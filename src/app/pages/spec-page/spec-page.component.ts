import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal, computed } from '@angular/core';
import { selectDraft, selectIsFinished } from '@state/draft/draft.selectors';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { PicksBansPanelComponent } from '@components/picks-bans/picks-bans-panel.component';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChampionsActions } from '@state/champions/champions.actions';
import {
  selectChampionsItems,
  selectChampionsImageById,
  selectChampionsStatus,
} from '@state/champions/champions.selectors';
import { RiotService } from '@services/riot.service';
import { WorkerClientService } from '@services/worker-client.service';

@Component({
  selector: 'app-spec-page',
  imports: [CommonModule, RouterModule, PicksBansPanelComponent],
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
  // Replay controls
  protected readonly isReplayMode = computed<boolean>(() => !!this.isFinished());
  protected readonly isReplaying = signal<boolean>(false);

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
  }

  startReplay(): void {
    if (!this.isReplayMode()) return;
    if (this.isReplaying()) return;
    const state = this.draft();
    if (!state || !Array.isArray(state.events) || state.events.length === 0) return;
    this.isReplaying.set(true);
    // Simple sequential replay using countdownAt spacing (best-effort)
    let i = 0;
    const playNext = () => {
      if (i >= state.events.length) {
        this.isReplaying.set(false);
        return;
      }
      const ev = state.events[i++];
      // Nothing to dispatch client-side; server already emitted STATES.
      // Here we just wait based on countdownAt deltas for a rough pacing.
      const next = state.events[i];
      const delayMs = next ? Math.max(0, (ev.countdownAt - next.countdownAt)) * 1000 : 0;
      setTimeout(playNext, delayMs);
    };
    playNext();
  }
}
