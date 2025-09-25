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
import { DraftAction } from '@models/draft-actions';
import {
  selectChampionsItems,
  selectChampionsImageById,
  selectChampionsStatus,
} from '@state/champions/champions.selectors';
import { WorkerClientService } from '@services/worker-client.service';
import { maskedFromCurrent, withCountdown } from '@models/draft';
import { IPostMessage, MESSAGE_TYPES } from '@models/worker';
import { filter, take } from 'rxjs/operators';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DraftFacade } from '@services/draft-facade.service';
import { ReplayContext, ReplayScheduler } from '@services/replay.service';
import { ReplayStrategySelector } from '@services/replay-strategy.selector';

/**
 * SpecPageComponent
 *
 * Purpose: Spectator view with replay controls. It simulates the original cadence of a draft
 * so viewers can play/pause/continue and scrub the timeline.
 * Why created: Provide a faithful “replay” of a finished draft without requiring a live room.
 *
 * How it works (high-level):
 * - Reads the draft state (including a chronological events array) from the store
 * - Selects a replay strategy (currently real-time) and passes a small context interface
 * - While playing, a scheduler applies events at their recorded timestamps; the countdown
 *   reflects the original values (30 resets on confirm when not finished)
 * - A slider allows scrubbing to any point; while playing it is controlled by the scheduler
 *
 * Example:
 * - User clicks Play → scheduler starts → events apply with original delays → user clicks Pause →
 *   scheduler pauses and can later Continue
 */
@Component({
  selector: 'app-spec-page',
  imports: [CommonModule, RouterModule, PicksBansPanelComponent, DraftHistoryComponent, TranslateModule],
  standalone: true,
  templateUrl: './spec-page.component.html',
  styleUrls: ['./spec-page.component.scss'],
})
export class SpecPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly store = inject(Store);
  private readonly client = inject(WorkerClientService);
  private readonly draftFacade = inject(DraftFacade);
  private readonly replaySelector = inject(ReplayStrategySelector);
  private readonly t = inject(TranslateService);
  private replay!: ReplayScheduler;
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
    if (this.isReplaying()) return 'spec.pause';
    const s = this.draft();
    const total = Array.isArray(s?.events) ? s.events.length : 0;
    const finished = this.replayIdx() >= total && this.replayCountdown() <= 0;
    if (finished) return 'spec.playAgain';
    return this.replayIdx() > 0 || this.replayCountdown() < 30 ? 'spec.continue' : 'spec.play';
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
    // Group reactive wiring into small, self-explanatory effects
    this.effectSetRoomIdFromRoute();
    this.effectSetTitle();
    this.effectConnectSocketOnRoomId();
    this.effectCaptureInitialFinishedOnce();
    this.effectMaskStateOnDeferredLoad();
  }

  /** Sync the `roomId` signal from current route. */
  private effectSetRoomIdFromRoute(): void {
    effect(() => {
      const id = this.route.snapshot.paramMap.get('roomId') ?? 'local';
      this.roomId.set(id);
    });
  }

  /** Set document title for this page. */
  private effectSetTitle(): void {
    effect(() => {
      const app = this.t.instant('app.title');
      const role = this.t.instant('common.spectator');
      this.title.setTitle(`${app} - ${role}`);
    });
  }

  /** Connect socket when a valid room id is present (hydrates state). */
  private effectConnectSocketOnRoomId(): void {
    effect(() => {
      const id = this.roomId();
      if (id) this.client.connect({ roomId: id });
    });
  }

  /**
   * Capture whether the initial state (first SERVER/STATE) was already finished.
   * Why: In deferred spec we want to mask state until replay starts.
   */
  private effectCaptureInitialFinishedOnce(): void {
    effect(() => {
      if (this.hasCapturedInitial()) return;
      this.client.incoming$
        .pipe(
          filter(
            (m: IPostMessage | null): m is IPostMessage => !!m && m.type === MESSAGE_TYPES.SERVER.STATE,
          ),
          take(1),
        )
        .subscribe((m) => {
          const state = (m as any)?.payload?.state;
          this.initialWasFinished.set(!!state?.isFinished);
          this.hasCapturedInitial.set(true);
        });
    });
  }

  /**
   * In deferred spec mode (finished on load), mask the state to only show team names
   * until the user starts the replay. Disconnect socket to avoid re-hydrating final state.
   */
  private effectMaskStateOnDeferredLoad(): void {
    effect(() => {
      const s = this.draft();
      const finished = this.isFinished();
      if (!s) return;
      if (!finished) return;
      if (!this.hasCapturedInitial()) return;
      if (!this.initialWasFinished()) return;
      if (this.isReplaying()) return;
      if (this.isMasked()) return;
      const hasEvents = Array.isArray(s.events) && s.events.length > 0;
      if (!hasEvents) return;

      const masked = maskedFromCurrent(s as any);
      this.store.dispatch(DraftActions[DraftAction.HYDRATE]({ newState: masked }));
      this.client.disconnect();
      this.isMasked.set(true);
    });
  }

  /** When the user scrubs the slider, align replay pointers via scheduler. */
  onHistoryIndexChanged(index: number): void {
    // If a replay instance is active, delegate; otherwise align local pointers only
    if (this.replay && this.replay.isRunning()) {
      this.replay.scrubTo(index);
      return;
    }
    this.historyIndex.set(index);
    const events = Array.isArray(this.draft()?.events) ? (this.draft()!.events as any[]) : [];
    const nextIdx = Math.max(0, (index ?? -1) + 1);
    this.replayIdx.set(nextIdx);
    this.replayCountdown.set(nextIdx >= events.length ? 0 : (events[nextIdx]?.countdownAt ?? 30));
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
      this.store.dispatch(DraftActions[DraftAction.HYDRATE]({ newState: masked }));
    this.isMasked.set(true);
    // Reset runtime state and slider
    this.historyIndex.set(-1);
    this.replayIdx.set(0);
    this.replayCountdown.set(30);
  }

  /**
   * Toggle play/pause without resetting state.
   * Example: If paused mid-way, Continue resumes from the next event.
   */
  togglePlayback(): void {
    if (this.isReplaying()) {
      this.replay.pause();
      this.isReplaying.set(false);
      return;
    }
    const s = this.draft();
    const events = Array.isArray(s?.events) ? s.events : [];
    const finished = this.replayIdx() >= events.length && this.replayCountdown() <= 0;
    if (finished) {
      // If the previous run completed, restart to masked base and begin from the start
      if (this.replay) {
        this.replay.restartToMaskedBase();
      } else {
        // In the unlikely case replay isn't initialized yet, reset locally
        this.historyIndex.set(-1);
        this.replayIdx.set(0);
        this.replayCountdown.set(30);
      }
    } else if (this.replayIdx() < events.length) {
      const nextEventCd = events[this.replayIdx()].countdownAt;
      if (nextEventCd > this.replayCountdown()) this.replayCountdown.set(nextEventCd);
    }
    this.startReplay();
  }

  /** Restart to masked beginning without auto-starting the replay. */
  restart(): void {
    this.replay.restartToMaskedBase();
  }

  /**
   * Start replay using the selected strategy.
   * Preconditions: replay mode must be eligible and there must be events.
   */
  startReplay(): void {
    if (!this.isReplayMode()) return;
    // Choose strategy at start by current finished state
    this.replay = this.replaySelector.selectStrategy({ isFinished: this.isFinished() });
    if (this.replay.isRunning()) return;
    const state = this.draft();
    if (!state || !Array.isArray(state.events) || state.events.length === 0) return;
    const ctx: ReplayContext = {
      getState: () => this.draft(),
      getEvents: () => (this.draft()?.events ?? []) as any[],
      getRoomId: () => this.roomId(),
      setHistoryIndex: (i) => this.historyIndex.set(i),
      getReplayIdx: () => this.replayIdx(),
      setReplayIdx: (i) => this.replayIdx.set(i),
      getReplayCountdown: () => this.replayCountdown(),
      setReplayCountdown: (v) => this.replayCountdown.set(v),
      maskedFromCurrent: (s) => maskedFromCurrent(s as any),
      disconnectSocket: () => this.client.disconnect(),
      onFinished: () => (this.isReplaying.set(false)),
    };
    this.replay.configure(ctx);
    this.isReplaying.set(true);
    this.replay.start();
  }
}
