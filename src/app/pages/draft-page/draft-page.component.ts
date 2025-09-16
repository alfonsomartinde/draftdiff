import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ChampionItem } from '@models/champion';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChampionsActions } from '@state/champions/champions.actions';
import {
  selectChampionsItems,
  selectChampionsImageById,
  selectChampionsStatus,
} from '@state/champions/champions.selectors';
import {
  selectCountdown,
  selectCurrentSide,
  selectCurrentStep,
  selectCurrentStepId,
  selectIsFinished,
  selectSteps,
  selectTeams,
} from '@state/draft/draft.selectors';
import { WorkerClientService } from '@services/worker-client.service';
import { DraftActions } from '@state/draft/draft.actions';
import { PicksBansPanelComponent } from '@components/picks-bans/picks-bans-panel.component';
import { DraftSide, UserSide, IStep, ITeam } from '@models/draft';

@Component({
  selector: 'app-draft-page',
  imports: [CommonModule, RouterModule, PicksBansPanelComponent],
  standalone: true,
  templateUrl: './draft-page.component.html',
  styleUrls: ['./draft-page.component.scss'],
})
export class DraftPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly title = inject(Title);
  private readonly client = inject(WorkerClientService);

  // Champions data comes directly from ChampionsStore to avoid duplication
  protected readonly roomId = signal<string>('');
  // NgRx champions signals
  readonly championsStatus = toSignal(this.store.select(selectChampionsStatus), {
    initialValue: 'idle' as const,
  });
  readonly championsItems = toSignal(this.store.select(selectChampionsItems), {
    initialValue: [] as ChampionItem[],
  });
  readonly imageById = toSignal(this.store.select(selectChampionsImageById), {
    initialValue: {} as Record<
      number,
      { squareImage: string; loadingImage: string; splashImage: string }
    >,
  });

  // mySide is the side of the user, from the URL
  // currentSide is the side of the current step
  mySide = computed(() => this.route.snapshot.url?.at(-1)?.path as DraftSide);

  // Draft NgRx signals
  readonly currentStepId = toSignal(this.store.select(selectCurrentStepId), { initialValue: 0 });
  readonly currentSide = toSignal(this.store.select(selectCurrentSide), {
    initialValue: 'blue' as UserSide,
  });
  readonly stepsSig = toSignal(this.store.select(selectSteps), { initialValue: [] as IStep[] });
  readonly countdownSig = toSignal(this.store.select(selectCountdown), { initialValue: 30 });
  readonly teamsSig = toSignal(this.store.select(selectTeams), {
    initialValue: { blue: { name: 'Blue', ready: false }, red: { name: 'Red', ready: false } } as {
      blue: ITeam;
      red: ITeam;
    },
  });
  readonly isFinishedSig = toSignal(this.store.select(selectIsFinished), { initialValue: false });
  readonly currentStep = toSignal(this.store.select(selectCurrentStep), { initialValue: null });

  readonly usedIds = computed<Set<number>>(() => {
    const steps = this.stepsSig();
    const ids: number[] = [];
    for (const step of steps ?? []) {
      if (step.championId != null) ids.push(step.championId);
    }
    return new Set(ids);
  });

  protected readonly isFinished = computed<boolean>(() => this.isFinishedSig());

  // currentStepId provided by selector signal

  protected readonly isMyTurn = computed<boolean>(() => {
    const steps = this.stepsSig();
    const idx = this.currentStepId();
    return steps?.[idx]?.side === this.mySide();
  });

  protected readonly hasStarted = computed<boolean>(() => {
    const t = this.teamsSig();
    return !!(t?.blue?.ready && t?.red?.ready);
  });

  protected readonly disableGrid = computed<boolean>(() => {
    return this.isFinished() || !this.isMyTurn() || !this.hasStarted();
  });

  protected readonly isReady = computed<boolean>(() => {
    const t = this.teamsSig();
    if (this.mySide() === 'spec') return false;
    if (this.mySide() === 'blue') return t?.blue?.ready ?? false;
    if (this.mySide() === 'red') return t?.red?.ready ?? false;
    return false;
  });

  protected readonly isPending = computed<boolean>(() => {
    const steps = this.stepsSig();
    const idx = this.currentStepId();
    return !!steps?.[idx]?.pending;
  });

  readonly confirmable = computed<boolean>(() => {
    if (!this.roomId()) return false;
    if (this.disableGrid()) return false;
    return this.isPending();
  });

  constructor() {
    // Get the room ID from the route
    effect(() => {
      const id = this.route.snapshot.paramMap.get('roomId') ?? 'local';
      this.roomId.set(id);
    });

    // Connect to the room
    effect(() => {
      if (this.roomId()) {
        this.client.connect({
          roomId: this.roomId(),
        });
      }
    });

    // Set the title
    effect(() => {
      if (this.roomId()) {
        this.title.setTitle(`Draft Diff - ${this.mySide()}`);
      }
    });

    // Countdown derived directly in UI via PicksBansPanel

    // Trigger champions load; effect will guard by status/items
    effect(() => {
      const status = this.championsStatus();
      if (status === 'idle') this.store.dispatch(ChampionsActions['champion/load']());
    });
  }

  ready(): void {
    if (!this.roomId()) return;
    const side = this.mySide();
    if (side === 'spec') return;
    this.store.dispatch(DraftActions['draft/ready']({ roomId: this.roomId(), side }));
  }

  pickedChampion(c: ChampionItem): void {
    if (!this.roomId()) return;
    if (!this.isMyTurn()) return;
    if (!c) return;
    const side = this.mySide();
    if (side === 'spec') return;
    const action = this.currentStep()?.type;
    if (!action) return;
    this.store.dispatch(
      DraftActions['draft/select']({
        roomId: this.roomId(),
        side,
        action,
        championId: c.id,
      }),
    );
  }

  confirmSelection(): void {
    if (!this.roomId()) return;
    if (!this.isMyTurn()) return;
    const side = this.mySide();
    if (side === 'spec') return;
    const action = this.currentStep()?.type;
    if (!action) return;
    this.store.dispatch(DraftActions['draft/confirm']({ roomId: this.roomId(), side, action }));
  }
}
