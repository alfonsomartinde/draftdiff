import { Injectable } from '@angular/core';
import { DraftFacade } from '../draft-facade.service';
import { ReplayContext, ReplayScheduler } from '../replay.service';
import { EVENT_TYPES } from '@models/worker';

/**
 * FastReplayScheduler
 *
 * Purpose: Apply all events immediately to reach the final state as fast as possible.
 * When to use: Useful for testing or explicit fast-forward actions.
 * Why created: Some flows need to jump straight to the end without simulating timing.
 *
 * Example: Given N events, it applies 0..N-1 in a tight loop and sets countdown to 0.
 */
@Injectable({ providedIn: 'root' })
export class FastReplayScheduler implements ReplayScheduler {
  private ctx: ReplayContext | null = null;
  private running = false;

  constructor(private readonly draft: DraftFacade) {}

  /** Configure execution context (store accessors and callbacks). */
  configure(ctx: ReplayContext): void { this.ctx = ctx; }
  /** Whether the scheduler is active. */
  isRunning(): boolean { return this.running; }

  /**
   * Start fast replay by applying events in order without delay.
   */
  start(): void {
    if (!this.ctx) return;
    const events = this.ctx.getEvents();
    if (!Array.isArray(events) || events.length === 0) return;
    this.ensureSpecReplayReady();
    this.running = true;
    for (let i = 0; i < events.length; i++) {
      this.applyEvent(events[i]);
      this.onEventApplied(i);
    }
    this.resetCountdownTo(0);
    this.running = false;
    this.ctx.onFinished?.();
  }

  pause(): void { this.running = false; }
  stop(): void { this.running = false; }

  /** Restart from masked base (names only) without auto-start. */
  restartToMaskedBase(): void {
    if (!this.ctx) return;
    const s = this.ctx.getState();
    const masked = this.ctx.maskedFromCurrent(s);
    this.draft.hydrate(masked);
    this.ctx.setHistoryIndex(-1);
    this.ctx.setReplayIdx(0);
    this.ctx.setReplayCountdown(30);
  }

  /** Align history index and replay index to the provided position. */
  scrubTo(index: number): void {
    if (!this.ctx) return;
    this.ctx.setHistoryIndex(index);
    const events = this.ctx.getEvents();
    const nextIdx = Math.max(0, (index ?? -1) + 1);
    this.ctx.setReplayIdx(nextIdx);
    this.ctx.setReplayCountdown(nextIdx >= (events?.length ?? 0) ? 0 : (events[nextIdx]?.countdownAt ?? 30));
  }

  /** Prepare spectator mode: disconnect socket and mark both teams ready in-store. */
  private ensureSpecReplayReady(): void {
    if (!this.ctx) return;
    this.ctx.disconnectSocket();
    const roomId = this.ctx.getRoomId();
    if (!roomId) return;
    this.draft.ready(roomId, 'blue');
    this.draft.ready(roomId, 'red');
  }

  /** Update pointers after applying an event. */
  private onEventApplied(indexJustApplied: number): void {
    if (!this.ctx) return;
    this.ctx.setHistoryIndex(indexJustApplied);
    this.ctx.setReplayIdx(indexJustApplied + 1);
  }

  /** Helper to set countdown. */
  private resetCountdownTo(value: number): void {
    if (!this.ctx) return;
    this.ctx.setReplayCountdown(value);
  }

  /** Apply a single event into the store through the facade. */
  private applyEvent(ev: any): void {
    if (!this.ctx) return;
    const roomId = this.ctx.getRoomId();
    if (!roomId || !ev || typeof ev.type !== 'string') return;
    switch (ev.type) {
      case EVENT_TYPES.CLIENT.READY:
        this.draft.ready(roomId, ev.payload.side);
        break;
      case EVENT_TYPES.CLIENT.SELECT:
        this.draft.select(roomId, ev.payload.side, ev.payload.action, ev.payload.championId);
        break;
      case EVENT_TYPES.CLIENT.CONFIRM:
      case EVENT_TYPES.SERVER.CONFIRM:
        this.draft.confirm(roomId, ev.payload.side, ev.payload.action);
        break;
      default:
        break;
    }
  }
}


