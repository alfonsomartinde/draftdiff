import { Server } from 'socket.io';
import { DraftState, IStep, UserSide } from '@models/draft';
import { databaseService } from './db';
import { reduce, type DomainAction, type ReducerEffect } from './reducer';
import { EVENT_TYPES, MESSAGE_TYPES } from '@models/worker';

export type TimerRef = ReturnType<typeof setInterval>;
export type RoomRuntime = {
  state: DraftState | null;
  timer: TimerRef | null;
  deadlineMs: number;
  started: boolean;
};

/**
 * EventsService
 *
 * Purpose: Orchestrate in-memory draft runtime per room and apply reducer effects.
 * Why created: Centralize real-time draft logic (timers, state, persistence, sockets)
 * to keep the HTTP/socket layer thin and the reducer pure.
 *
 * Responsibilities:
 * - Maintain RoomRuntime (state, timer, deadlines, started flag)
 * - Route client actions to domain reducer and execute returned effects
 * - Persist state to DB and emit socket messages when needed
 * - Manage countdown timer and auto-confirm on timeout
 *
 * Example:
 * - handleSelect() → reduce() → applyEffects() persists and emits SERVER/STATE
 */
class EventsService {
  private static _instance: EventsService | null = null;
  private readonly DEFAULT_DEADLINE_SECONDS = 30;
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly SWEEP_MS = 60_000;
  private sweepTimer: NodeJS.Timeout | null = null;

  static get instance(): EventsService {
    this._instance ??= new EventsService();
    return this._instance;
  }

  getRoom(roomId: string): RoomRuntime {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { state: null, timer: null, deadlineMs: 0, started: false });
    }
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweepIdleRooms(), this.SWEEP_MS);
    }
    return this.rooms.get(roomId)!;
  }

  private updateRoomProperties(roomId: string, properties: Partial<RoomRuntime> = {}): void {
    if (!roomId) return;
    if (!this.rooms.has(roomId)) return;
    const room = this.rooms.get(roomId)!;
    this.rooms.set(roomId, { ...room, ...properties });
  }

  /** Estimate per-socket time offset to normalize clientAtMs → server time. */
  private computeClientOffsetMs(socket: any): number {
    // Placeholder: could be improved via handshake RTT measurement
    const now = Date.now();
    const clientNow = Number(socket?.handshake?.issued ?? 0);
    if (Number.isFinite(clientNow) && clientNow > 0) return now - clientNow;
    return 0;
  }

  /**
   * Compute a normalized server-time reference for an incoming client timestamp.
   * If client timestamp is missing/invalid, uses serverReceiveAtMs.
   */
  private computeNormalizedAtMs(socket: any, clientAtMs: number, serverReceiveAtMs: number): number {
    const offset = this.computeClientOffsetMs(socket);
    const hasClient = Number.isFinite(clientAtMs);
    return hasClient ? clientAtMs + offset : serverReceiveAtMs;
  }

  /**
   * Attach timing metadata to the last appended event and enforce monotonic `at`.
   * Optionally checks the expected type to avoid mismatches.
   */
  private annotateLastEvent(
    state: DraftState,
    expectedType: string | null,
    clientAtMs: number | undefined,
    serverReceiveAtMs: number,
    normalizedAtMs: number,
  ): void {
    const last = state.events[state.events.length - 1];
    if (!last) return;
    if (expectedType && last.type !== expectedType) return;
    last.clientAtMs = Number.isFinite(clientAtMs as number) ? (clientAtMs as number) : undefined;
    last.serverReceiveAtMs = serverReceiveAtMs;
    const prevAtMs = state.events.length > 1
      ? new Date(state.events[state.events.length - 2].at).getTime()
      : serverReceiveAtMs;
    const safePrev = Number.isFinite(prevAtMs) ? prevAtMs : serverReceiveAtMs;
    const atMs = Math.max(safePrev + 1, normalizedAtMs);
    last.at = new Date(atMs).toISOString();
  }

  private resetDeadlineMs(): number {
    return Date.now() + this.DEFAULT_DEADLINE_SECONDS * 1000;
  }

  private isLastStep(room: RoomRuntime): boolean {
    if (!room.state) return false;
    return room.state.currentStepId + 1 >= room.state.steps.length;
  }

  private setNextStepPending(room: RoomRuntime): void {
    if (!room.state) return;
    const nextStepId = room.state.currentStepId + 1;
    const nextStep = room.state.steps[nextStepId];
    const lastStep: boolean = this.isLastStep(room);
    if (lastStep) return;
    if (!nextStep) return;
    room.state.steps[nextStepId] = { ...nextStep, pending: true };
  }

  private updateCurrentStep(room: RoomRuntime, value: Partial<IStep>): void {
    if (!room.state) return;
    const currentStepId = room.state.currentStepId;
    const step = room.state.steps[currentStepId];
    if (!step) return;
    room.state.steps[currentStepId] = { ...step, ...value };
  }

  startTimer(room: RoomRuntime, roomId: string, io: Server): void {
    /** Starts or restarts the per-room countdown timer when both teams are ready. */
    const bothReady = !!(room.state?.teams?.blue?.ready && room.state?.teams?.red?.ready);
    if (!bothReady) return;
    if (room.timer) this.resetTimer(room, roomId);

    const nextDeadline = this.resetDeadlineMs();
    this.updateRoomProperties(roomId, {
      deadlineMs: nextDeadline,
      started: true,
    });
    const timerRef = setInterval(() => this.tick(this.getRoom(roomId), roomId, io), 1000);
    this.updateRoomProperties(roomId, { timer: timerRef });
  }

  resetTimer(room: RoomRuntime, roomId: string): void {
    /** Stops the timer and clears runtime deadline/started flags. */
    if (room.timer) clearInterval(room.timer);
    this.updateRoomProperties(roomId, { timer: null, deadlineMs: 0, started: false });
  }

  async tick(room: RoomRuntime, roomId: string, io: Server): Promise<void> {
    /** Called each second while timer is running; emits tick and auto-confirms at 0. */
    if (!room.timer) return;
    if (!room.state) return;
    const countdown = Math.max(0, Math.ceil((room.deadlineMs - Date.now()) / 1000));
    const { state: nextState, effects } = reduce(room.state, {
      type: MESSAGE_TYPES.SERVER.TICK as any,
      payload: { countdown },
    });
    room.state = nextState;
    await this.applyEffects(room, roomId, io, effects);
    if (countdown <= 0) {
      const res = reduce(room.state, { type: MESSAGE_TYPES.SERVER.AUTO_CONFIRM } as any);
      room.state = res.state;
      await this.applyEffects(room, roomId, io, res.effects);
    }
  }

  handleJoin(io: Server, roomId: string): void {
    const room = this.getRoom(roomId);
    io.to(roomId).emit('message', { type: MESSAGE_TYPES.SERVER.STATE, payload: { state: room.state } });
  }

  /** Handle CLIENT/READY for a specific side. */
  async handleReady(io: Server, roomId: string, room: RoomRuntime, payload: any, socket?: any): Promise<void> {
    if (!payload?.side) return;
    if (!room?.state) return;
    const serverReceiveAtMs = Date.now();
    const clientAtMs = Number(payload?.clientAtMs ?? payload?.clientAt ?? NaN);
    const normalizedAt = this.computeNormalizedAtMs(socket, clientAtMs, serverReceiveAtMs);
    const action: DomainAction = {
      type: MESSAGE_TYPES.CLIENT.READY as any,
      payload: { side: payload.side as UserSide },
    };
    const { state: next, effects } = reduce(room.state, action);
    this.annotateLastEvent(next, EVENT_TYPES.CLIENT.READY, clientAtMs, serverReceiveAtMs, normalizedAt);
    room.state = next;
    await this.applyEffects(room, roomId, io, effects);
  }

  /** Handle CLIENT/SELECT and append event timing metadata. */
  async handleSelect(io: Server, roomId: string, room: RoomRuntime, payload: any, socket?: any): Promise<void> {
    if (!payload?.side || !payload?.action) return;
    if (!room?.state) return;
    const serverReceiveAtMs = Date.now();
    const clientAtMs = Number(payload?.clientAtMs ?? payload?.clientAt ?? NaN);
    const normalizedAt = this.computeNormalizedAtMs(socket, clientAtMs, serverReceiveAtMs);
    const action: DomainAction = {
      type: MESSAGE_TYPES.CLIENT.SELECT as any,
      payload: {
        side: payload.side as UserSide,
        action: payload.action,
        championId: payload.championId ?? null,
      },
    };
    const { state: next, effects } = reduce(room.state, action);
    this.annotateLastEvent(next, EVENT_TYPES.CLIENT.SELECT, clientAtMs, serverReceiveAtMs, normalizedAt);
    room.state = next;
    await this.applyEffects(room, roomId, io, effects);
  }

  /** Handle CLIENT/CONFIRM; ensure confirm ends the turn and has proper timing. */
  async handleConfirm(io: Server, roomId: string, room: RoomRuntime, payload: any, socket?: any): Promise<void> {
    if (!room?.state) return;
    if (!payload?.side || !payload?.action) return;
    const serverReceiveAtMs = Date.now();
    const clientAtMs = Number(payload?.clientAtMs ?? payload?.clientAt ?? NaN);
    const normalizedAt = this.computeNormalizedAtMs(socket, clientAtMs, serverReceiveAtMs);
    const action: DomainAction = {
      type: MESSAGE_TYPES.CLIENT.CONFIRM as any,
      payload: { side: payload.side as UserSide, action: payload.action },
    };
    const { state: next, effects } = reduce(room.state, action);
    this.annotateLastEvent(next, EVENT_TYPES.CLIENT.CONFIRM, clientAtMs, serverReceiveAtMs, normalizedAt);
    // Ensure CONFIRM of the current step appears after any preceding SELECTs (stable sort within same step)
    if (next.events.length >= 2) {
      const currStepId = next.currentStepId; // after reduce, already advanced when confirm
      // Move the last CONFIRM just before any next-step events if needed (should already be last of previous step)
      // Given monotonic at, this usually holds; no-op here for simplicity
    }
    room.state = next;
    await this.applyEffects(room, roomId, io, effects);
  }

  async handleSetTeamName(
    io: Server,
    roomId: string,
    room: RoomRuntime,
    payload: any,
  ): Promise<void> {
    if (!payload?.side || typeof payload?.name !== 'string') return;
    if (!room?.state) return;
    const action: DomainAction = {
      type: MESSAGE_TYPES.CLIENT.SET_TEAM_NAME as any,
      payload: { side: payload.side as UserSide, name: payload.name },
    };
    const { state: next, effects } = reduce(room.state, action);
    room.state = next;
    await this.applyEffects(room, roomId, io, effects);
  }

  async fetchRoomEvents(roomId: string) {
    const room = this.getRoom(roomId);
    return room.state?.events ?? [];
  }

  private getEffectHandlers() {
    return {
      persist: async ({ room, roomId, io }: { room: RoomRuntime; roomId: string; io: Server }) => {
        try {
          // Sanitize events before persisting: ensure strictly increasing timestamps
          if (room.state && Array.isArray(room.state.events)) {
            this.sanitizeEventsInPlace(room.state);
          }
          await databaseService.updateRoomState(roomId, room.state!, io);
        } catch {}
      },
      'emit-state': ({
        room,
        roomId,
        io,
        hasPersist,
      }: {
        room: RoomRuntime;
        roomId: string;
        io: Server;
        hasPersist: boolean;
      }) => {
        if (hasPersist) return; // avoid duplicate emission; persist already emits SERVER/STATE
        io.to(roomId).emit('message', { type: MESSAGE_TYPES.SERVER.STATE, payload: { state: room.state } });
      },
      'emit-tick': ({ room, roomId, io }: { room: RoomRuntime; roomId: string; io: Server }) => {
        io.to(roomId).emit('message', { type: MESSAGE_TYPES.SERVER.TICK, payload: { state: room.state } });
      },
      'start-timer': ({ room, roomId, io }: { room: RoomRuntime; roomId: string; io: Server }) => {
        this.startTimer(room, roomId, io);
      },
      'stop-timer': ({ room, roomId }: { room: RoomRuntime; roomId: string }) => {
        this.resetTimer(room, roomId);
      },
      'log-event': (_ctx: { room: RoomRuntime; roomId: string }) => {
        // no-op
      },
    } as const;
  }

  /**
   * Sanitize events to ensure strictly increasing `at` timestamps.
   * Rule: bump by +1ms when equal/non-increasing; never drop CONFIRM.
   */
  private sanitizeEventsInPlace(state: DraftState): void {
    const events = Array.isArray(state?.events) ? state.events : [];
    if (events.length === 0) return;
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      const prevAt = new Date(prev.at).getTime();
      let currAt = new Date(curr.at).getTime();
      if (!Number.isFinite(prevAt)) continue;
      if (!Number.isFinite(currAt)) {
        currAt = prevAt + 1;
      }
      if (currAt <= prevAt) {
        // If equal or behind, prefer bump by 1ms; never drop CONFIRM
        if (curr.type !== 'CLIENT/CONFIRM' && curr.type !== 'CONFIRM') {
          currAt = prevAt + 1;
        } else {
          // Should not happen for CONFIRM; still coerce and log
          currAt = prevAt + 1;
          try { console.error('[events] CONFIRM had non-increasing at; coerced'); } catch {}
        }
        curr.at = new Date(currAt).toISOString();
      }
    }
  }

  private async applyEffects(
    room: RoomRuntime,
    roomId: string,
    io: Server,
    effects: ReducerEffect[],
  ): Promise<void> {
    /** Executes reducer effects, ensuring single persist emits SERVER/STATE. */
    if (!room?.state) return;
    const hasPersist = effects.some((e) => e.kind === 'persist');
    const handlers = this.getEffectHandlers();

    for (const effect of effects) {
      const kind = effect.kind;
      const handler = (handlers as any)[kind] as Function | undefined;
      if (!handler) continue;
      await handler({ room, roomId, io, hasPersist, effect });
    }
  }

  private sweepIdleRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      const isInactive = !room.started && !room.state;
      const expiredTimer = room.deadlineMs && now - room.deadlineMs > 5 * 60_000; // 5 min
      if (room.timer && (isInactive || expiredTimer)) {
        clearInterval(room.timer);
      }
      if (isInactive || expiredTimer) {
        this.rooms.delete(roomId);
      }
    }
  }
}

export const eventsService = EventsService.instance;
