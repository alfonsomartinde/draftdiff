import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  signal,
  Input,
  OnChanges,
  SimpleChanges,
  output,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectDraft } from '@state/draft/draft.selectors';
import { DraftActions } from '@state/draft/draft.actions';
import { withCountdown } from '@models/draft';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-draft-history',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './draft-history.component.html',
  styleUrls: ['./draft-history.component.scss'],
})
export class DraftHistoryComponent implements OnChanges {
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
  @Input() controlled: boolean = false;
  /**
   * Current index provided by the parent when in controlled mode.
   * Values: -1 for initial state, [0 .. events.length - 1] for applied events.
   */
  @Input() currentIndex: number | null = null;

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

  // When draft changes (e.g., navigation), keep index clamped to valid range
  constructor() {
    effect(() => {
      const s = this.draft();
      if (!s) return;
      // Keep index within bounds when data changes
      const len = Array.isArray(s.events) ? s.events.length : 0;
      const curr = this.index();
      if (curr > len - 1) this.index.set(len - 1);
      if (curr < -1) this.index.set(-1);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (typeof this.currentIndex === 'number') {
      const len = this.total();
      const clamped = Math.max(-1, Math.min(this.currentIndex, len - 1));
      this.index.set(clamped);
    }
  }

  /**
   * Handles user input from the slider. Applies the selected history deterministically
   * and notifies the parent via `indexChanged` so the replay can resume from that point.
   * Ignored when `controlled` is true.
   */
  setIndex(value: number): void {
    if (this.controlled) return; // ignore user input while controlled by parent (playing)
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
  private applyUpToIndex(targetIndex: number): void {
    const s = this.draft();
    if (!s) return;

    // Build a clean base state: keep roomId and team names only; reset steps and counters
    const base = this.buildInitialBaseFromState(s);

    this.store.dispatch(DraftActions['draft/hydrate']({ newState: base }));

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
      if (ev.type === 'CLIENT/CONFIRM' || ev.type === 'CONFIRM') {
        this.dispatchTick(30);
      }
    }
  }

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

  private dispatchTick(value: number): void {
    const curr = this.draft();
    if (curr) {
      this.store.dispatch(
        DraftActions['draft/tick']({ newState: withCountdown(curr as any, value) }),
      );
    }
  }

  private applyHistoricalEvent(roomId: string, ev: any): void {
    // Reflect countdown as captured at event time
    const curr = this.draft();
    if (curr) {
      this.store.dispatch(
        DraftActions['draft/tick']({ newState: withCountdown(curr as any, ev.countdownAt) }),
      );
    }
    switch (ev.type) {
      case 'CLIENT/READY': {
        this.store.dispatch(DraftActions['draft/ready']({ roomId, side: ev.payload.side }));
        break;
      }
      case 'CLIENT/SELECT': {
        this.store.dispatch(
          DraftActions['draft/select']({
            roomId,
            side: ev.payload.side,
            action: ev.payload.action,
            championId: ev.payload.championId,
          }),
        );
        break;
      }
      case 'CLIENT/CONFIRM':
      case 'CONFIRM': {
        this.store.dispatch(
          DraftActions['draft/confirm']({
            roomId,
            side: ev.payload.side,
            action: ev.payload.action,
          }),
        );
        break;
      }
      case 'CLIENT/SET_TEAM_NAME': {
        this.store.dispatch(
          DraftActions['draft/set-team-name']({
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

  private resetToInitial(): void {
    const s = this.draft();
    if (!s) return;
    const base = this.buildInitialBaseFromState(s);
    this.store.dispatch(DraftActions['draft/hydrate']({ newState: base }));
  }
}
