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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DraftFacade } from '@services/draft-facade.service';

/**
 * DraftPageComponent
 *
 * Purpose: Host the main draft UI. Connects to a room, exposes selectors as signals
 * for the `PicksBansPanel`, and provides actions for ready/select/confirm.
 * Why created: Centralize user interaction for an ongoing draft.
 *
 * Example:
 * - User clicks Ready → we emit READY for the user's side
 * - User selects a champion → we dispatch SELECT for current step
 * - User confirms → we dispatch CONFIRM and the draft advances
 */
@Component({
  selector: 'app-draft-page',
  imports: [CommonModule, RouterModule, PicksBansPanelComponent, TranslateModule],
  standalone: true,
  templateUrl: './draft-page.component.html',
  styleUrls: ['./draft-page.component.scss'],
})
export class DraftPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly title = inject(Title);
  private readonly client = inject(WorkerClientService);
  private readonly draft = inject(DraftFacade);
  private readonly t = inject(TranslateService);

  // Champions data comes directly from ChampionsStore to avoid duplication
  protected readonly roomId = signal<string>('');
  // NgRx champions signals
  readonly championsStatus = toSignal(this.store.select(selectChampionsStatus), {
    initialValue: 'idle' as const,
  });
  // Champions items
  // Proposal: use a service to get the champions list
  readonly championsItems = toSignal(this.store.select(selectChampionsItems), {
    initialValue: [] as ChampionItem[],
  });

  // Champions image by id
  // Proposal: use a service to get the image by id
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
    initialValue: { blue: { name: '', ready: false }, red: { name: '', ready: false } } as {
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
    this.effectSyncRoomIdFromRoute();
    this.effectConnectOnRoomId();
    this.effectSetTitleOnRoom();
  }

  /** Sync `roomId` from route param. */
  private effectSyncRoomIdFromRoute(): void {
    effect(() => {
      const id = this.route.snapshot.paramMap.get('roomId') ?? 'local';
      this.roomId.set(id);
    });
  }

  /** Connect socket when `roomId` is available. */
  private effectConnectOnRoomId(): void {
    effect(() => {
      if (this.roomId()) this.client.connect({ roomId: this.roomId() });
    });
  }

  /** Set tab title with side hint when room is present. */
  private effectSetTitleOnRoom(): void {
    effect(() => {
      if (this.roomId()) {
        const app = this.t.instant('app.title');
        const side = this.mySide();
        const sideLabel = side === 'blue' ? this.t.instant('common.blueSide') : side === 'red' ? this.t.instant('common.redSide') : this.t.instant('common.spectator');
        this.title.setTitle(`${app} - ${sideLabel}`);
      }
    });
  }

  /** Mark current user side as ready (ignored for spectator). */
  ready(): void {
    if (!this.roomId()) return;
    const side = this.mySide();
    if (side === 'spec') return;
    this.draft.ready(this.roomId(), side);
  }

  /** Pick a champion for the current step when it is our turn. */
  pickedChampion(c: ChampionItem): void {
    if (!this.roomId()) return;
    if (!this.isMyTurn()) return;
    if (!c) return;
    const side = this.mySide();
    if (side === 'spec') return;
    const action = this.currentStep()?.type;
    if (!action) return;
    this.draft.select(this.roomId(), side, action, c.id);
  }

  /** Confirm current step when it is our turn. */
  confirmSelection(): void {
    if (!this.roomId()) return;
    if (!this.isMyTurn()) return;
    const side = this.mySide();
    if (side === 'spec') return;
    const action = this.currentStep()?.type;
    if (!action) return;
    this.draft.confirm(this.roomId(), side, action);
  }
}
