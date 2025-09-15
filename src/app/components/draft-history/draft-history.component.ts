import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectDraft } from '@state/draft/draft.selectors';
import { DraftActions } from '@state/draft/draft.actions';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-draft-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './draft-history.component.html',
  styleUrls: ['./draft-history.component.scss'],
})
export class DraftHistoryComponent implements OnChanges {
  private readonly store = inject(Store);

  // Full draft state from store
  readonly draft = toSignal(this.store.select(selectDraft));

  // Current slider position (index into events timeline). -1 means base state (before any event)
  protected readonly index = signal<number>(-1);

  // Controlled mode: when true, parent drives the index and this component does not dispatch events
  @Input() controlled: boolean = false;
  @Input() currentIndex: number | null = null;

  // Derived length
  protected readonly total = computed<number>(() => {
    const s = this.draft();
    return Array.isArray(s?.events) ? s.events.length : 0;
  });

  // When draft changes (e.g., navigation), reset slider to end if finished else -1
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

  // Public API to set the index from template input
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
  }

  // Apply events deterministically from initial masked state up to given index
  private applyUpToIndex(targetIndex: number): void {
    const s = this.draft();
    if (!s) return;

    // Build a clean base state: keep roomId and team names only; reset steps and counters
    const base = {
      ...s,
      currentStepId: 0,
      currentSide: 'blue' as any,
      countdown: 30,
      isFinished: false,
      teams: {
        blue: { name: s.teams.blue.name, ready: false },
        red: { name: s.teams.red.name, ready: false },
      },
      steps: s.steps.map((step, i) => ({
        ...step,
        championId: undefined,
        pending: i === 0,
      })),
    } as any;

    this.store.dispatch(DraftActions['draft/hydrate']({ newState: base }));

    const events = Array.isArray(s.events) ? s.events : [];

    if (targetIndex < 0) {
      // No events to apply; ensure countdown at 30
      const curr = this.draft();
      if (curr) {
        this.store.dispatch(
          DraftActions['draft/tick']({ newState: { ...curr, countdown: 30 } as any }),
        );
      }
      return;
    }

    let currentCountdown = 30;

    const dispatchTick = (value: number) => {
      const curr = this.draft();
      if (curr) {
        this.store.dispatch(
          DraftActions['draft/tick']({ newState: { ...curr, countdown: value } as any }),
        );
      }
    };

    const applyEvent = (ev: any) => {
      const roomId = s.roomId;
      // Reflect countdown as captured at event time
      const curr = this.draft();
      if (curr) {
        this.store.dispatch(
          DraftActions['draft/tick']({ newState: { ...curr, countdown: ev.countdownAt } as any }),
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
            DraftActions['draft/confirm']({ roomId, side: ev.payload.side, action: ev.payload.action }),
          );
          break;
        }
        case 'CLIENT/SET_TEAM_NAME': {
          this.store.dispatch(
            DraftActions['draft/set-team-name']({ roomId, side: ev.payload.side, name: ev.payload.name }),
          );
          break;
        }
        default:
          break;
      }
    };

    // Set initial countdown
    dispatchTick(currentCountdown);

    // Apply events from 0..targetIndex
    for (let i = 0; i <= targetIndex && i < events.length; i++) {
      const ev = events[i];
      // When a confirmation happens, reset countdown to 30 immediately after applying
      applyEvent(ev);
      if (ev.type === 'CLIENT/CONFIRM' || ev.type === 'CONFIRM') {
        dispatchTick(30);
      }
    }
  }

  private resetToInitial(): void {
    const s = this.draft();
    if (!s) return;
    const base = {
      ...s,
      currentStepId: 0,
      currentSide: 'blue' as any,
      countdown: 30,
      isFinished: false,
      teams: {
        blue: { name: s.teams.blue.name, ready: false },
        red: { name: s.teams.red.name, ready: false },
      },
      steps: s.steps.map((step, i) => ({
        ...step,
        championId: undefined,
        pending: i === 0,
      })),
    } as any;
    this.store.dispatch(DraftActions['draft/hydrate']({ newState: base }));
  }
}


