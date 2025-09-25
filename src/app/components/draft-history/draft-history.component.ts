import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, input, output } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectDraft } from '@state/draft/draft.selectors';
import { DraftActions } from '@state/draft/draft.actions';
import { DraftAction } from '@models/draft-actions';
import { EVENT_TYPES } from '@models/worker';
import { withCountdown } from '@models/draft';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

/**
 * DraftHistoryComponent
 *
 * Purpose: Timeline slider to scrub through draft events.
 * Why created: Provide a visual and interactive way to navigate the draft history.
 * Modes:
 * - Uncontrolled: the component applies events deterministically as user scrubs
 * - Controlled: the parent drives the index (slider disabled) while replay is running
 *
 * Example:
 * - User drags slider to index 5 → we rebuild state from base and apply events 0..5
 */
@Component({
  selector: 'app-draft-history',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './draft-history.component.html',
  styleUrls: ['./draft-history.component.scss'],
})
export class DraftHistoryComponent {
  private readonly store = inject(Store);

  // Full draft state from store
  readonly draft = toSignal(this.store.select(selectDraft));

  // Current slider position (index into events timeline). -1 means base state (before any event)
  protected readonly index = signal<number>(-1);

  /**
   * Controlled mode flag.
   * When true, the parent component drives the current index and the slider is disabled.
   * In controlled mode, user input is ignored and no events are dispatched from this component.
   */
  readonly controlled = input<boolean>(false);
  /**
   * Current index provided by the parent when in controlled mode.
   * Values: -1 for initial state, [0 .. events.length - 1] for applied events.
   */
  readonly currentIndex = input<number | null>(null);

  /**
   * Emits the selected index when the user scrubs the slider while not in controlled mode.
   * The parent can use this to align replay pointers (idx and countdown) and resume from there.
   */
  readonly indexChanged = output<number>();

  // Derived length
  protected readonly total = computed<number>(() => {
    const s = this.draft();
    return Array.isArray(s?.events) ? s.events.length : 0;
  });

  constructor() {
    this.effectClampIndexOnDataChange();
    this.effectReflectControlledIndex();
  }

  /** Keep the local index within bounds when the draft data changes. */
  private effectClampIndexOnDataChange(): void {
    effect(() => {
      const s = this.draft();
      if (!s) return;
      const len = Array.isArray(s.events) ? s.events.length : 0;
      const curr = this.index();
      if (curr > len - 1) this.index.set(len - 1);
      if (curr < -1) this.index.set(-1);
    });
  }

  /** Reflect external `currentIndex` updates when in controlled mode. */
  private effectReflectControlledIndex(): void {
    effect(() => {
      const incoming = this.currentIndex();
      if (typeof incoming === 'number') {
        const len = this.total();
        const clamped = Math.max(-1, Math.min(incoming, len - 1));
        this.index.set(clamped);
      }
    });
  }

  /**
   * Handles user input from the slider. Applies the selected history deterministically
   * and notifies the parent via `indexChanged` so the replay can resume from that point.
   * Ignored when `controlled` is true.
   */
  /** Handle user move: rebuild base state and apply historical events up to `value`. */
  setIndex(value: number): void {
    if (this.controlled()) return; // ignore user input while controlled by parent (playing)
    const s = this.draft();
    const len = this.total();
    if (!s || len === 0) {
      this.resetToInitial();
      return;
    }
    const clamped = Math.max(-1, Math.min(value, len - 1));
    if (clamped === this.index()) return;
    this.index.set(clamped);
    this.applyUpToIndex(clamped);
    // Emit selected index so parent can align replay position
    this.indexChanged.emit(clamped);
  }

  // Apply events deterministically from initial masked state up to given index
  /**
   * Deterministically rebuild the state from a clean base and apply 0..targetIndex events.
   * Why: Avoid compounding effects; always start from a known base and reapply.
   */
  private applyUpToIndex(targetIndex: number): void {
    const s = this.draft();
    if (!s) return;

    // Build a clean base state: keep roomId and team names only; reset steps and counters
    const base = this.buildInitialBaseFromState(s);

    this.store.dispatch(DraftActions[DraftAction.HYDRATE]({ newState: base }));

    const events = Array.isArray(s.events) ? s.events : [];

    if (targetIndex < 0) {
      // No events to apply; ensure countdown at 30
      this.dispatchTick(30);
      return;
    }

    // Set initial countdown
    this.dispatchTick(30);

    // Apply events from 0..targetIndex
    for (let i = 0; i <= targetIndex && i < events.length; i++) {
      const ev = events[i];
      // When a confirmation happens, reset countdown to 30 immediately after applying
      this.applyHistoricalEvent(s.roomId, ev);
      if (ev.type === EVENT_TYPES.CLIENT.CONFIRM || ev.type === EVENT_TYPES.SERVER.CONFIRM) {
        this.dispatchTick(30);
      }
    }
  }

  /** Build a minimal base state: reset steps, counters and keep only names/roomId. */
  private buildInitialBaseFromState(s: any): any {
    return {
      ...s,
      currentStepId: 0,
      currentSide: 'blue',
      countdown: 30,
      isFinished: false,
      teams: {
        blue: { name: s.teams.blue.name, ready: false },
        red: { name: s.teams.red.name, ready: false },
      },
      steps: s.steps.map((step: any, i: number) => ({
        ...step,
        championId: undefined,
        pending: i === 0,
      })),
      // Ensure reducer treats this base hydrate as newer than any previous state
      eventSeq: (s.eventSeq ?? 0) + 1,
    };
  }

  /** Emit a tick with an explicit countdown value. */
  private dispatchTick(value: number): void {
    const curr = this.draft();
    if (curr) {
      this.store.dispatch(
        DraftActions[DraftAction.TICK]({ newState: withCountdown(curr as any, value) }),
      );
    }
  }

  /** Apply one historical event into the store reflecting its captured countdown. */
  private applyHistoricalEvent(roomId: string, ev: any): void {
    // Reflect countdown as captured at event time
    const curr = this.draft();
    if (curr) {
      this.store.dispatch(
        DraftActions[DraftAction.TICK]({ newState: withCountdown(curr as any, ev.countdownAt) }),
      );
    }
    switch (ev.type) {
      case EVENT_TYPES.CLIENT.READY: {
        this.store.dispatch(DraftActions[DraftAction.READY]({ roomId, side: ev.payload.side }));
        break;
      }
      case EVENT_TYPES.CLIENT.SELECT: {
        this.store.dispatch(
          DraftActions[DraftAction.SELECT]({
            roomId,
            side: ev.payload.side,
            action: ev.payload.action,
            championId: ev.payload.championId,
          }),
        );
        break;
      }
      case EVENT_TYPES.CLIENT.CONFIRM:
      case EVENT_TYPES.SERVER.CONFIRM: {
        this.store.dispatch(
          DraftActions[DraftAction.CONFIRM]({
            roomId,
            side: ev.payload.side,
            action: ev.payload.action,
          }),
        );
        break;
      }
      case EVENT_TYPES.CLIENT.SET_TEAM_NAME: {
        this.store.dispatch(
          DraftActions[DraftAction.SET_TEAM_NAME]({
            roomId,
            side: ev.payload.side,
            name: ev.payload.name,
          }),
        );
        break;
      }
      default:
        break;
    }
  }

  /** Reset the UI state to an initial masked base when there are no events. */
  private resetToInitial(): void {
    const s = this.draft();
    if (!s) return;
    const base = this.buildInitialBaseFromState(s);
    this.store.dispatch(DraftActions[DraftAction.HYDRATE]({ newState: base }));
  }
}
