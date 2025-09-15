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
import { RiotService } from '@services/riot.service';
import { WorkerClientService } from '@services/worker-client.service';
import { createInitialDraftState } from '@models/draft';
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
  private readonly data = inject(RiotService);
  private readonly client = inject(WorkerClientService);
  protected readonly roomId = signal<string>('');
  // Draft state
  readonly draft = toSignal(this.store.select(selectDraft));
  readonly isFinished = toSignal(this.store.select(selectIsFinished), { initialValue: false });
  // Replay controls: allowed when initial load was finished (deferred) and there are events
  protected readonly isReplayMode = computed<boolean>(() => {
    const s = this.draft();
    const hasEvents = Array.isArray(s?.events) && s.events.length > 0;
    const deferredEligible = this.initialWasFinished();
    return hasEvents && deferredEligible;
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
  // Play/Pause label: Detener while playing, Continuar if paused with progress, else Empezar
  protected readonly playPauseLabel = computed<string>(() => {
    if (this.isReplaying()) return 'Detener';
    const s = this.draft();
    const total = Array.isArray(s?.events) ? s.events.length : 0;
    const finished = this.replayIdx() >= total && this.replayCountdown() <= 0;
    if (finished) return 'Empezar';
    return this.replayIdx() > 0 || this.replayCountdown() < 30 ? 'Continuar' : 'Empezar';
  });
  private replayTimer: any = null;

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
      this.title.setTitle(`Sportia Drafter - spec`);
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
      this.client
        .incoming$
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

    // Load champions via NgRx + RiotService caching
    effect(() => {
      const items = this.championsItems();
      const status = this.championsStatus();
      if (status === 'idle' && (items?.length ?? 0) === 0) {
        (async () => {
          this.store.dispatch(ChampionsActions['champion/load']());
          try {
            const list = await this.data.getChampions();
            this.store.dispatch(ChampionsActions['champion/load-success']({ items: list }));
          } catch (err: any) {
            this.store.dispatch(
              ChampionsActions['champion/load-failure']({
                error: err?.message ?? 'Failed to load champions',
              }),
            );
          }
        })();
      }
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

      const base = createInitialDraftState({
        roomId: s.roomId,
        teams: {
          blue: { name: s.teams.blue.name, ready: false },
          red: { name: s.teams.red.name, ready: false },
        },
      });

      const masked = {
        ...s,
        steps: base.steps,
        currentStepId: base.currentStepId,
        currentSide: base.currentSide,
        countdown: base.countdown,
        isFinished: true,
        teams: base.teams,
      } as any;

      this.store.dispatch(DraftActions['draft/hydrate']({ newState: masked }));
      this.isMasked.set(true);
    });
  }

  private stopReplayTimer(): void {
    if (this.replayTimer) {
      clearInterval(this.replayTimer);
      this.replayTimer = null;
    }
    this.isReplaying.set(false);
  }

  private resetToMaskedBase(): void {
    const s = this.draft();
    if (!s) return;
    const base = createInitialDraftState({
      roomId: s.roomId,
      teams: {
        blue: { name: s.teams.blue.name, ready: false },
        red: { name: s.teams.red.name, ready: false },
      },
    });
    const masked = {
      ...s,
      steps: base.steps,
      currentStepId: base.currentStepId,
      currentSide: base.currentSide,
      countdown: base.countdown,
      isFinished: true,
      teams: base.teams,
    } as any;
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
    // We already have all events: disconnect socket in spec mode to avoid further updates
    this.client.disconnect();
    // Ensure both teams are marked ready so UI reflects started state (pending highlights)
    const roomId = this.roomId();
    if (roomId) {
      this.store.dispatch(DraftActions['draft/ready']({ roomId, side: 'blue' }));
      this.store.dispatch(DraftActions['draft/ready']({ roomId, side: 'red' }));
    }
    this.isReplaying.set(true);
    const events = state.events;

    const dispatchTick = (value: number) => {
      const current = this.draft();
      if (current) {
        this.store.dispatch(
          DraftActions['draft/tick']({ newState: { ...current, countdown: value } as any }),
        );
      }
    };

    const applyPending = () => {
      // Apply all events recorded at the current countdown value.
      // If a CONFIRM occurs, reset to 30 and immediately process events at 30 as well
      // before allowing the interval to continue. This prevents missing events at 30.
      let target = this.replayCountdown();
      // Loop may handle multiple waves when target jumps to 30 after a confirm
      // and there are immediate events at countdownAt=30.
      while (this.replayIdx() < events.length) {
        const idx = this.replayIdx();
        if (events[idx].countdownAt !== target) break;
        const ev = events[idx];
        this.replayIdx.set(idx + 1);
        this.applyEvent(ev);
        // Update external slider index to reflect applied event
        this.historyIndex.set(this.replayIdx() - 1);
        if (ev.type === 'CLIENT/CONFIRM' || ev.type === 'CONFIRM') {
          // Next step timer resets to 30 unless finished
          this.replayCountdown.set(30);
          target = this.replayCountdown();
          dispatchTick(this.replayCountdown());
          // continue loop to absorb any events that also happened at 30
          // fallthrough to while condition without explicit continue
        }
      }
    };

    // Apply any initial events at countdown 30 immediately
    dispatchTick(this.replayCountdown());
    applyPending();

    // Start ticking every second
    this.replayTimer = setInterval(() => {
      // Decrement countdown
      const next = Math.max(0, this.replayCountdown() - 1);
      this.replayCountdown.set(next);
      dispatchTick(this.replayCountdown());

      // Apply events that occurred at this countdown value
      applyPending();

      // Stop if finished (no more events and countdown has reached 0)
      if (this.replayIdx() >= events.length && this.replayCountdown() <= 0) {
        clearInterval(this.replayTimer);
        this.replayTimer = null;
        this.isReplaying.set(false);
      }
    }, 1000);
  }

  private applyEvent(ev: any): void {
    const roomId = this.roomId();
    if (!roomId || !ev || typeof ev.type !== 'string') return;
    // Reflect countdown as captured at event time
    const current = this.draft();
    if (current) {
      this.store.dispatch(
        DraftActions['draft/tick']({ newState: { ...current, countdown: ev.countdownAt } as any }),
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
  }
}
