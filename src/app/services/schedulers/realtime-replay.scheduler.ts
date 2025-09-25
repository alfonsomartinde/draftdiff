import { Injectable } from '@angular/core';
import { DraftFacade } from '../draft-facade.service';
import { ReplayContext, ReplayScheduler } from '../replay.service';
import { EVENT_TYPES } from '@models/worker';

/**
 * RealTimeReplayScheduler
 *
 * Purpose: Reproduce a finished draft timeline at real cadence using event timestamps.
 * Why created: In spectator mode, we want to simulate the original timing between actions
 * so viewers experience the draft as it unfolded.
 * How it works (high-level):
 * - Calculates delay between consecutive events based on their timestamp `at`
 * - Schedules each next event with setTimeout(delay)
 * - Ticks countdown every second to mimic the in-draft timer
 *
 * Example:
 * - If event A happened at t=1000ms and event B at t=2500ms, we wait 1500ms before applying B.
 */
@Injectable({ providedIn: 'root' })
export class RealTimeReplayScheduler implements ReplayScheduler {
  private ctx: ReplayContext | null = null;
  private countdownTimer: any = null;
  private nextEventTimer: any = null;
  private nextEventDueAtMs = 0;
  private remainingToNextMs = 0;
  private lastAppliedEventAtMs = 0;
  private running = false;

  constructor(private readonly draft: DraftFacade) {}

  /**
   * Configure execution context.
   * Why: decouple the scheduler from Angular/store specifics; the context abstracts accessors.
   */
  configure(ctx: ReplayContext): void {
    this.ctx = ctx;
  }

  /**
   * Whether the scheduler is currently running (has active timers).
   */
  isRunning(): boolean { return this.running; }

  /**
   * Start the real-time replay.
   * Steps:
   * 1) Ensure preconditions and mark running
   * 2) Start countdown ticking
   * 3) Schedule first event according to its timestamp
   */
  start(): void {
    if (!this.ctx) return;
    const events = this.ctx.getEvents();
    if (!Array.isArray(events) || events.length === 0) return;
    this.ensureSpecReplayReady();
    this.running = true;
    this.beginCountdownInterval();
    this.scheduleNextEvent(events);
  }

  /**
   * Pause all timers, remembering remaining delay for the next event.
   */
  pause(): void {
    if (this.nextEventTimer && this.nextEventDueAtMs > 0) {
      const now = Date.now();
      this.remainingToNextMs = Math.max(0, this.nextEventDueAtMs - now);
    }
    this.stopTimers();
    this.running = false;
  }

  /**
   * Stop and clear all timers.
   */
  stop(): void {
    this.stopTimers();
    this.running = false;
  }

  /**
   * Restart from masked base (names only), used when user clicks Restart.
   */
  restartToMaskedBase(): void {
    if (!this.ctx) return;
    this.stop();
    const state = this.ctx.getState();
    const masked = this.ctx.maskedFromCurrent(state);
    this.draft.hydrate(masked);
    this.ctx.setHistoryIndex(-1);
    this.ctx.setReplayIdx(0);
    this.ctx.setReplayCountdown(30);
  }

  /**
   * Align replay pointers (history index and next replay index) when the user scrubs.
   */
  scrubTo(index: number): void {
    if (!this.ctx) return;
    this.ctx.setHistoryIndex(index);
    const events = this.ctx.getEvents();
    const nextIdx = Math.max(0, (index ?? -1) + 1);
    this.ctx.setReplayIdx(nextIdx);
    if (nextIdx >= (events?.length ?? 0)) {
      this.ctx.setReplayCountdown(0);
    } else {
      const nextEventCd = events[nextIdx]?.countdownAt ?? 30;
      this.ctx.setReplayCountdown(nextEventCd);
    }
  }

  /**
   * Clear countdown and next-event timers if any are set.
   */
  private stopTimers(): void {
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    if (this.nextEventTimer) { clearTimeout(this.nextEventTimer); this.nextEventTimer = null; }
  }

  /**
   * Prepare spectator mode by disconnecting sockets and ensuring both sides are ready in-store.
   */
  private ensureSpecReplayReady(): void {
    if (!this.ctx) return;
    this.ctx.disconnectSocket();
    const roomId = this.ctx.getRoomId();
    if (!roomId) return;
    this.draft.ready(roomId, 'blue');
    this.draft.ready(roomId, 'red');
  }

  /**
   * Emit a controlled countdown tick value into the store.
   * Why: The replay's countdown should mirror original values for each applied event.
   */
  private dispatchCountdownTick(value: number): void {
    if (!this.ctx) return;
    const current = this.ctx.getState();
    if (current) this.draft.tickWithValue(current, value);
  }

  /**
   * Begin ticking countdown every second while running.
   * Stops and signals finish when there are no more events and countdown reaches 0.
   */
  private beginCountdownInterval(): void {
    if (!this.ctx) return;
    this.dispatchCountdownTick(this.ctx.getReplayCountdown());
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (!this.ctx) return;
      const next = Math.max(0, this.ctx.getReplayCountdown() - 1);
      this.ctx.setReplayCountdown(next);
      this.dispatchCountdownTick(next);
      const total = Array.isArray(this.ctx.getEvents()) ? this.ctx.getEvents().length : 0;
      if (this.ctx.getReplayIdx() >= total && next <= 0) {
        this.stop();
        this.ctx.onFinished?.();
      }
    }, 1000);
  }

  /**
   * Orchestrate scheduling of the next event based on timestamps.
   * Splits responsibilities into small helpers to keep this method simple.
   */
  private scheduleNextEvent(events: any[]): void {
    if (this.nextEventTimer) { clearTimeout(this.nextEventTimer); this.nextEventTimer = null; }
    if (!this.ctx) return;
    const idx = this.ctx.getReplayIdx();
    if (idx >= events.length) return;

    const nextEvent = events[idx];
    const nextAt = new Date(nextEvent.at).getTime();

    const delayMs = this.computeDelayMs(events, idx, nextAt);
    this.armNextEventTimer(events, idx, nextEvent, nextAt, delayMs);
  }

  /**
   * Compute the delay to the next event based on timestamps.
   * - Resumes from paused state using remainingToNextMs, if present
   * - Otherwise derives the delta between last applied time and the next event time
   * Example: if base=1000 and nextAt=1600, result=600
   */
  private computeDelayMs(events: any[], idx: number, nextAt: number): number {
    if (this.remainingToNextMs > 0) {
      const v = this.remainingToNextMs;
      this.remainingToNextMs = 0;
      return v;
    }
    const prevAt = idx > 0 ? new Date(events[idx - 1].at).getTime() : nextAt;
    const base = this.lastAppliedEventAtMs > 0 ? this.lastAppliedEventAtMs : prevAt;
    const rawDelta = Number.isFinite(nextAt) && Number.isFinite(base) ? nextAt - base : 0;
    return Math.max(0, rawDelta);
  }

  /**
   * Arm a setTimeout to apply the event after delay, and chain the next schedule.
   */
  private armNextEventTimer(
    events: any[],
    idx: number,
    nextEvent: any,
    nextAt: number,
    delayMs: number,
  ): void {
    this.nextEventDueAtMs = Date.now() + delayMs;
    this.nextEventTimer = setTimeout(() => {
      this.applyEvent(nextEvent as any);
      this.onEventApplied(idx, nextAt);
      if (this.isConfirm(nextEvent)) {
        const finished = this.handlePostConfirm();
        if (!finished) {
          this.scheduleNextEvent(events);
        }
        return;
      }
      this.scheduleNextEvent(events);
    }, delayMs);
  }

  /**
   * Update runtime pointers after applying an event.
   */
  private onEventApplied(idx: number, nextAt: number): void {
    if (!this.ctx) return;
    this.ctx.setHistoryIndex(idx);
    this.ctx.setReplayIdx(idx + 1);
    this.lastAppliedEventAtMs = nextAt;
  }

  /**
   * Handle countdown and termination rules after a CONFIRM.
   * - If the draft finished, set countdown to 0 and stop timers
   * - Otherwise reset countdown to 30 to mimic next step
   */
  private handlePostConfirm(): boolean {
    if (!this.ctx) return false;
    const s = this.ctx.getState();
    if (s?.isFinished) {
      this.resetCountdownTo(0);
      this.stop();
      this.ctx.onFinished?.();
      return true;
    }
    this.resetCountdownTo(30);
    return false;
  }

  /**
   * Helper to set replay countdown and emit a synthetic tick to the store.
   */
  private resetCountdownTo(value: number): void {
    if (!this.ctx) return;
    this.ctx.setReplayCountdown(value);
    this.dispatchCountdownTick(value);
  }

  /**
   * Type guard for confirm-like events.
   */
  private isConfirm(ev: any): boolean {
    return ev?.type === EVENT_TYPES.CLIENT.CONFIRM || ev?.type === EVENT_TYPES.SERVER.CONFIRM;
  }

  /**
   * Apply a single event into the store through the facade.
   * Example: for CLIENT/SELECT, dispatch select with side/action/championId.
   */
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
      case EVENT_TYPES.CLIENT.SET_TEAM_NAME:
        break;
      default:
        break;
    }
  }
}


