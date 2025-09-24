import { Server } from 'socket.io';
import { DraftState, IStep, UserSide } from '@models/draft';
import { databaseService } from './db';
import { reduce, type DomainAction, type ReducerEffect } from './reducer';

export type TimerRef = ReturnType<typeof setInterval>;
export type RoomRuntime = {
  state: DraftState | null;
  timer: TimerRef | null;
  deadlineMs: number;
  started: boolean;
};

/**
 * Orchestrates in-memory draft runtime per room and applies reducer effects.
 *
 * Responsibilities:
 * - Maintain RoomRuntime (state, timer, deadlines, started flag)
 * - Route client actions to domain reducer and execute returned effects
 * - Persist state to DB and emit socket messages when needed
 * - Manage countdown timer and auto-confirm on timeout
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
      type: 'SERVER/TICK',
      payload: { countdown },
    });
    room.state = nextState;
    await this.applyEffects(room, roomId, io, effects);
    if (countdown <= 0) {
      const res = reduce(room.state, { type: 'SERVER/AUTO_CONFIRM' });
      room.state = res.state;
      await this.applyEffects(room, roomId, io, res.effects);
    }
  }

  handleJoin(io: Server, roomId: string): void {
    const room = this.getRoom(roomId);
    io.to(roomId).emit('message', { type: 'SERVER/STATE', payload: { state: room.state } });
  }

  async handleReady(io: Server, roomId: string, room: RoomRuntime, payload: any): Promise<void> {
    if (!payload?.side) return;
    if (!room?.state) return;
    const action: DomainAction = {
      type: 'CLIENT/READY',
      payload: { side: payload.side as UserSide },
    };
    const { state: next, effects } = reduce(room.state, action);
    room.state = next;
    await this.applyEffects(room, roomId, io, effects);
  }

  async handleSelect(io: Server, roomId: string, room: RoomRuntime, payload: any): Promise<void> {
    if (!payload?.side || !payload?.action) return;
    if (!room?.state) return;
    const action: DomainAction = {
      type: 'CLIENT/SELECT',
      payload: {
        side: payload.side as UserSide,
        action: payload.action,
        championId: payload.championId ?? null,
      },
    };
    const { state: next, effects } = reduce(room.state, action);
    room.state = next;
    await this.applyEffects(room, roomId, io, effects);
  }

  async handleConfirm(io: Server, roomId: string, room: RoomRuntime, payload: any): Promise<void> {
    if (!room?.state) return;
    if (!payload?.side || !payload?.action) return;
    const action: DomainAction = {
      type: 'CLIENT/CONFIRM',
      payload: { side: payload.side as UserSide, action: payload.action },
    };
    const { state: next, effects } = reduce(room.state, action);
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
      type: 'CLIENT/SET_TEAM_NAME',
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
        io.to(roomId).emit('message', { type: 'SERVER/STATE', payload: { state: room.state } });
      },
      'emit-tick': ({ room, roomId, io }: { room: RoomRuntime; roomId: string; io: Server }) => {
        io.to(roomId).emit('message', { type: 'SERVER/TICK', payload: { state: room.state } });
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
