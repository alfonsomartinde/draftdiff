import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  selectSteps,
  selectCurrentStepId,
  selectCountdown,
  selectTeams,
} from '@state/draft/draft.selectors';
import { IStep, ITeam } from '@models/draft';
import { ActivatedRoute } from '@angular/router';
import { ChampionItem } from '@models/champion';
// Removed direct grid usage; nested in PicksPanelComponent
import { BansPanelComponent } from '@components/picks-bans/bans-panel/bans-panel.component';
import { PicksPanelComponent } from '@components/picks-bans/picks-panel/picks-panel.component';
import { TimerComponent } from '@components/timer/timer.component';
import { TeamNameComponent } from '@components/team-name/team-name.component';
import { TRANSPARENT_PIXEL_GIF } from '@app/constants/images';

/**
 * Composite panel that renders bans row, picks grid and team/timer header.
 *
 * Why: Centralizes the draft interaction surface, wiring NgRx draft state signals
 * to visual subcomponents and exposing a simple `pickedChampion` output upstream.
 */
@Component({
  selector: 'app-picks-bans-panel',
  imports: [
    CommonModule,
    BansPanelComponent,
    PicksPanelComponent,
    TimerComponent,
    TeamNameComponent,
  ],
  standalone: true,
  templateUrl: './picks-bans-panel.component.html',
  styleUrls: ['./picks-bans-panel.component.scss'],
})
export class PicksBansPanelComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);

  readonly imageById = input<
    Record<
      number,
      {
        squareImage: string;
        loadingImage: string;
        splashImage: string;
      }
    >
  >();
  readonly disableGrid = input<boolean>(false);
  readonly champions = input<ChampionItem[]>([]);
  readonly usedIds = input<Set<number>>();
  readonly pickedChampion = output<ChampionItem>();

  readonly picksRed = computed(() =>
    (this.state()?.steps ?? []).filter((s: IStep) => s.type === 'pick' && s.side === 'red'),
  );
  readonly picksBlue = computed(() =>
    (this.state()?.steps ?? []).filter((s: IStep) => s.type === 'pick' && s.side === 'blue'),
  );
  readonly bansRed = computed(() =>
    (this.state()?.steps ?? []).filter((s: IStep) => s.type === 'ban' && s.side === 'red'),
  );
  readonly bansBlue = computed(() =>
    (this.state()?.steps ?? []).filter((s: IStep) => s.type === 'ban' && s.side === 'blue'),
  );
  // NgRx-backed signals
  readonly currentStepId = toSignal(this.store.select(selectCurrentStepId), { initialValue: 0 });
  readonly stepsSig = toSignal(this.store.select(selectSteps), { initialValue: [] as IStep[] });
  readonly countdownSig = toSignal(this.store.select(selectCountdown), { initialValue: 30 });
  readonly teamsSig = toSignal(this.store.select(selectTeams), {
    initialValue: {
      blue: { name: 'Blue', ready: false } as ITeam,
      red: { name: 'Red', ready: false } as ITeam,
    },
  });
  readonly state = computed(() => ({
    currentStepId: this.currentStepId(),
    steps: this.stepsSig(),
    countdown: this.countdownSig(),
    teams: this.teamsSig(),
  }));
  readonly side = computed(() => this.route.snapshot.data['side']);
  readonly step = computed<IStep | null>(
    () => this.state()?.steps[this.state()?.currentStepId ?? 0] ?? null,
  );
  readonly isPending = computed(
    () => this.state()?.steps[this.state()?.currentStepId ?? 0]?.pending ?? false,
  );
  readonly countdown = computed(() => this.state()?.countdown ?? 0);
  readonly teamNameBlue = computed(() => this.teamsSig().blue.name ?? '');
  readonly teamNameRed = computed(() => this.teamsSig().red.name ?? '');
  readonly hasStarted = computed(() => this.teamsSig().blue.ready && this.teamsSig().red.ready);

  readonly isSpec = computed(() => this.route.snapshot.data['side'] === 'spec');

  imgSplash(id: number | null): string {
    if (id == null) return TRANSPARENT_PIXEL_GIF;
    const image = this.imageById()?.[id];
    if (!image) return TRANSPARENT_PIXEL_GIF;
    return image.splashImage;
  }

  imgSquare(id: number | null): string {
    if (id == null) return TRANSPARENT_PIXEL_GIF;
    const image = this.imageById()?.[id];
    if (!image) return TRANSPARENT_PIXEL_GIF;
    return image.squareImage;
  }

  imgLoading(id: number | null): string {
    if (id == null) return TRANSPARENT_PIXEL_GIF;
    const image = this.imageById()?.[id];
    if (!image) return TRANSPARENT_PIXEL_GIF;
    return image.loadingImage;
  }
}
