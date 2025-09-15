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

class EventsService {
  private static _instance: EventsService | null = null;
  private readonly DEFAULT_DEADLINE_SECONDS = 30;
  private readonly rooms = new Map<string, RoomRuntime>();

  static get instance(): EventsService {
    this._instance ??= new EventsService();
    return this._instance;
  }

  getRoom(roomId: string): RoomRuntime {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { state: null, timer: null, deadlineMs: 0, started: false });
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
    if (room.timer) clearInterval(room.timer);
    this.updateRoomProperties(roomId, { timer: null, deadlineMs: 0, started: false });
  }

  async tick(room: RoomRuntime, roomId: string, io: Server): Promise<void> {
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
    const action: DomainAction = { type: 'CLIENT/READY', payload: { side: payload.side as UserSide } };
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

  private async applyEffects(
    room: RoomRuntime,
    roomId: string,
    io: Server,
    effects: ReducerEffect[],
  ): Promise<void> {
    if (!room?.state) return;
    const hasPersist = effects.some((e) => e.kind === 'persist');

    for (const effect of effects) {
      switch (effect.kind) {
        case 'persist': {
          try {
            await databaseService.updateRoomState(roomId, room.state, io);
          } catch {}
          break;
        }
        case 'emit-state': {
          if (hasPersist) break; // evitar doble emisión: persist ya emite SERVER/STATE
          io.to(roomId).emit('message', { type: 'SERVER/STATE', payload: { state: room.state } });
          break;
        }
        case 'emit-tick': {
          io.to(roomId).emit('message', { type: 'SERVER/TICK', payload: { state: room.state } });
          break;
        }
        case 'start-timer': {
          this.startTimer(room, roomId, io);
          break;
        }
        case 'stop-timer': {
          this.resetTimer(room, roomId);
          break;
        }
        case 'log-event': {
          // in-room logging; no DB action
          break;
        }
      }
    }
  }
}

export const eventsService = EventsService.instance;