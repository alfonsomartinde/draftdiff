import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal, computed } from '@angular/core';
import { selectDraft, selectIsFinished } from '@state/draft/draft.selectors';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { PicksBansPanelComponent } from '@components/picks-bans/picks-bans-panel.component';
import { DraftHistoryComponent } from '@components/draft-history/draft-history.component';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChampionsActions } from '@state/champions/champions.actions';
import { DraftActions } from '@state/draft/draft.actions';
import {
  selectChampionsItems,
  selectChampionsImageById,
  selectChampionsStatus,
} from '@state/champions/champions.selectors';
import { WorkerClientService } from '@services/worker-client.service';
import { maskedFromCurrent, withCountdown } from '@models/draft';
import { IPostMessage } from '@models/worker';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'app-spec-page',
  imports: [CommonModule, RouterModule, PicksBansPanelComponent, DraftHistoryComponent],
  standalone: true,
  templateUrl: './spec-page.component.html',
  styleUrls: ['./spec-page.component.scss'],
})
export class SpecPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly store = inject(Store);
  private readonly client = inject(WorkerClientService);
  protected readonly roomId = signal<string>('');
  
  // Draft state
  readonly draft = toSignal(this.store.select(selectDraft));
  readonly isFinished = toSignal(this.store.select(selectIsFinished), { initialValue: false });
  
  // Replay controls: allowed when there are events and either initial load was finished (deferred)
  // or the current state is finished (relaxed for tests and edge cases)
  protected readonly isReplayMode = computed<boolean>(() => {
    const s = this.draft();
    const hasEvents = Array.isArray(s?.events) && s.events.length > 0;
    const deferredEligible = this.initialWasFinished();
    const currentlyFinished = this.isFinished();
    return hasEvents && (deferredEligible || currentlyFinished);
  });
  protected readonly isReplaying = signal<boolean>(false);
  private readonly isMasked = signal<boolean>(false);
 
  // Track whether initial server state was already finished (deferred mode on load)
  private readonly hasCapturedInitial = signal<boolean>(false);
  private readonly initialWasFinished = signal<boolean>(false);
  
  // Slider control from parent to child
  protected readonly historyIndex = signal<number>(-1);
  
  // Persistent replay runtime state
  protected readonly replayIdx = signal<number>(0);
  protected readonly replayCountdown = signal<number>(30);
  
  // Play/Pause label: Pause while playing, Continue if paused with progress, else Play
  protected readonly playPauseLabel = computed<string>(() => {
    if (this.isReplaying()) return 'Pause';
    const s = this.draft();
    const total = Array.isArray(s?.events) ? s.events.length : 0;
    const finished = this.replayIdx() >= total && this.replayCountdown() <= 0;
    if (finished) return 'Play';
    return this.replayIdx() > 0 || this.replayCountdown() < 30 ? 'Continue' : 'Play';
  });
  // Timers: countdown decrements each second; events scheduled with real deltas between their timestamps
  private countdownTimer: any = null;
  private nextEventTimer: any = null;
  private nextEventDueAtMs: number = 0;
  private remainingToNextMs: number = 0;
  private lastAppliedEventAtMs: number = 0;

  // NgRx champions signals
  readonly championsStatus = toSignal(this.store.select(selectChampionsStatus), {
    initialValue: 'idle' as const,
  });
  readonly championsItems = toSignal(this.store.select(selectChampionsItems), { initialValue: [] });
  readonly imageById = toSignal(this.store.select(selectChampionsImageById), {
    initialValue: {} as Record<
      number,
      { squareImage: string; loadingImage: string; splashImage: string }
    >,
  });

  constructor() {
    // Get the room ID from the route
    effect(() => {
      const id = this.route.snapshot.paramMap.get('roomId') ?? 'local';
      this.roomId.set(id);
    });

    // Set the title
    effect(() => {
      this.title.setTitle(`Draft Diff - spec`);
    });

    // Connect to room to hydrate state via socket events
    effect(() => {
      const id = this.roomId();
      if (id) {
        this.client.connect({ roomId: id });
      }
    });

    // Capture initial finished state once to decide masking behavior
    effect(() => {
      if (this.hasCapturedInitial()) return;
      // Wait for the first SERVER/STATE from socket to avoid capturing the pre-hydrate default
      this.client.incoming$
        .pipe(
          filter((m: IPostMessage | null): m is IPostMessage => !!m && m.type === 'SERVER/STATE'),
          take(1),
        )
        .subscribe((m) => {
          const state = (m as any)?.payload?.state;
          this.initialWasFinished.set(!!state?.isFinished);
          this.hasCapturedInitial.set(true);
        });
    });

    // Trigger champions load; effect will guard by status/items
    effect(() => {
      const status = this.championsStatus();
      if (status === 'idle') this.store.dispatch(ChampionsActions['champion/load']());
    });

    // In deferred spec mode: mask state to only show team names before starting replay
    effect(() => {
      const s = this.draft();
      const finished = this.isFinished();
      if (!s) return;
      if (!finished) return; // only mask when draft is finished (deferred mode)
      // Only mask if the initial state on load was already finished (deferred load)
      if (!this.hasCapturedInitial()) return;
      if (!this.initialWasFinished()) return;
      if (this.isReplaying()) return;
      if (this.isMasked()) return;
      const hasEvents = Array.isArray(s.events) && s.events.length > 0;
      if (!hasEvents) return;

      const masked = maskedFromCurrent(s as any);
      this.store.dispatch(DraftActions['draft/hydrate']({ newState: masked }));
      // Prevent server from immediately re-hydrating the final state again
      // while we are paused at the beginning of the replay in deferred mode
      this.client.disconnect();
      this.isMasked.set(true);
    });
  }

  // When user scrubs the history slider while paused, align replay pointers
  onHistoryIndexChanged(index: number): void {
    // Reflect selected slider index
    this.historyIndex.set(index);
    const s = this.draft();
    const events = s && Array.isArray(s.events) ? s.events : [];
    // Next event to apply is one after the selected index; if -1, start from 0
    const nextIdx = Math.max(0, (index ?? -1) + 1);
    this.replayIdx.set(nextIdx);
    if (nextIdx >= events.length) {
      // At or beyond last event: set countdown to 0 to indicate finished
      this.replayCountdown.set(0);
    } else {
      // Set countdown to the next event's countdown value so resume starts from there
      const nextEventCd = events[nextIdx]?.countdownAt ?? 30;
      this.replayCountdown.set(nextEventCd);
    }
  }

  private stopReplayTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.nextEventTimer) {
      clearTimeout(this.nextEventTimer);
      this.nextEventTimer = null;
    }
    this.isReplaying.set(false);
  }

  private resetToMaskedBase(): void {
    const s = this.draft();
    if (!s) return;
    const masked = maskedFromCurrent(s as any);
    this.store.dispatch(DraftActions['draft/hydrate']({ newState: masked }));
    this.isMasked.set(true);
    // Reset runtime state and slider
    this.historyIndex.set(-1);
    this.replayIdx.set(0);
    this.replayCountdown.set(30);
  }

  // Toggle play/pause without resetting position/state
  togglePlayback(): void {
    if (this.isReplaying()) {
      // Capture remaining ms to next scheduled event before stopping
      if (this.nextEventTimer && this.nextEventDueAtMs > 0) {
        const now = Date.now();
        this.remainingToNextMs = Math.max(0, this.nextEventDueAtMs - now);
      }
      this.stopReplayTimer();
      return;
    }
    // Ensure countdown is not behind the next event countdown (e.g., paused at 0 but next event at 30)
    const s = this.draft();
    const events = Array.isArray(s?.events) ? s.events : [];
    if (this.replayIdx() < events.length) {
      const nextEventCd = events[this.replayIdx()].countdownAt;
      if (nextEventCd > this.replayCountdown()) this.replayCountdown.set(nextEventCd);
    }
    this.startReplay();
  }

  // Restart to beginning without auto-starting
  restart(): void {
    this.stopReplayTimer();
    this.resetToMaskedBase();
  }

  startReplay(): void {
    if (!this.isReplayMode()) return;
    if (this.isReplaying()) return;
    const state = this.draft();
    if (!state || !Array.isArray(state.events) || state.events.length === 0) return;
    // Prepare spec replay environment and teams readiness
    this.ensureSpecReplayReady();
    this.isReplaying.set(true);
    const events = state.events;

    // Initialize countdown loop (independent from event schedule)
    this.beginCountdownInterval();

    // Schedule next event based on real timestamp deltas
    this.scheduleNextEvent(events);
  }

  private ensureSpecReplayReady(): void {
    // We already have all events: disconnect socket in spec mode to avoid further updates
    this.client.disconnect();
    // Ensure both teams are marked ready so UI reflects started state (pending highlights)
    const roomId = this.roomId();
    if (roomId) {
      this.store.dispatch(DraftActions['draft/ready']({ roomId, side: 'blue' }));
      this.store.dispatch(DraftActions['draft/ready']({ roomId, side: 'red' }));
    }
  }

  private dispatchCountdownTick(value: number): void {
    const current = this.draft();
    if (current) {
      this.store.dispatch(
        DraftActions['draft/tick']({ newState: withCountdown(current as any, value) }),
      );
    }
  }

  private beginCountdownInterval(): void {
    // Kick initial tick based on current replayCountdown
    this.dispatchCountdownTick(this.replayCountdown());
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      // Decrement countdown independently of events
      const next = Math.max(0, this.replayCountdown() - 1);
      this.replayCountdown.set(next);
      this.dispatchCountdownTick(next);
      // If finished and no more events pending, stop timers
      const s = this.draft();
      const total = Array.isArray(s?.events) ? s!.events.length : 0;
      if (this.replayIdx() >= total && next <= 0) {
        this.stopReplayTimer();
      }
    }, 1000);
  }

  private scheduleNextEvent(events: any[]): void {
    if (this.nextEventTimer) {
      clearTimeout(this.nextEventTimer);
      this.nextEventTimer = null;
    }
    const idx = this.replayIdx();
    if (idx >= events.length) return;

    // Compute delay to next event preserving original inter-event timing
    const nextEvent = events[idx];
    const nextAt = new Date(nextEvent.at).getTime();

    let delayMs = 0;
    if (this.remainingToNextMs > 0) {
      // Resuming from pause
      delayMs = this.remainingToNextMs;
      this.remainingToNextMs = 0;
    } else {
      // If starting from an intermediate index without prior event applied,
      // base delta on previous event timestamp; otherwise, use lastAppliedEventAtMs
      const prevAt = idx > 0 ? new Date(events[idx - 1].at).getTime() : nextAt;
      const base = this.lastAppliedEventAtMs > 0 ? this.lastAppliedEventAtMs : prevAt;
      const rawDelta = Number.isFinite(nextAt) && Number.isFinite(base) ? nextAt - base : 0;
      delayMs = Math.max(0, rawDelta);
    }

    // Fast-path: apply synchronously when delay is zero or timestamps are invalid
    if (delayMs === 0) {
      const invalidTimes = !Number.isFinite(nextAt);
      if (invalidTimes) {
        // Apply at least one event to ensure immediate progress in tests
        this.applyEvent(nextEvent as any);
        this.historyIndex.set(idx);
        this.lastAppliedEventAtMs = Date.now();
        this.replayIdx.set(idx + 1);
        this.scheduleNextEvent(events);
        return;
      } else {
        // Establish base timestamp for zero-delta burst
        const baseAt = this.lastAppliedEventAtMs > 0 ? this.lastAppliedEventAtMs : nextAt;
        let i = this.replayIdx();
        while (i < events.length) {
          const ev = events[i];
          const evAt = new Date(ev.at).getTime();
          if (!Number.isFinite(evAt) || evAt - baseAt !== 0) break;
          this.applyEvent(ev);
          this.historyIndex.set(i);
          this.lastAppliedEventAtMs = evAt;
          i += 1;
        }
        this.replayIdx.set(i);
        // After synchronous burst, schedule the subsequent event (if any)
        this.scheduleNextEvent(events);
        return;
      }
    }

    this.nextEventDueAtMs = Date.now() + delayMs;
    this.nextEventTimer = setTimeout(() => {
      // Apply the event
      this.applyEvent(nextEvent as any);
      this.historyIndex.set(idx); // reflect in slider

      // Update pointers
      this.replayIdx.set(idx + 1);
      this.lastAppliedEventAtMs = nextAt;

      // Special handling: after confirm, reset countdown to 30 (unless finished)
      if (nextEvent.type === 'CLIENT/CONFIRM' || nextEvent.type === 'CONFIRM') {
        const s = this.draft();
        const finished = s?.isFinished;
        if (!finished) {
          this.replayCountdown.set(30);
          this.dispatchCountdownTick(30);
        }
      }

      // Schedule subsequent event
      this.scheduleNextEvent(events);
    }, delayMs);
  }

  private applyEvent(ev: import('@models/draft').DraftEvent): void {
    const roomId = this.roomId();
    if (!roomId || !ev || typeof ev.type !== 'string') return;
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
}
