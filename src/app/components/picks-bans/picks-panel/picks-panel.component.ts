import { CommonModule } from '@angular/common';
import { Component, input, output, computed } from '@angular/core';
import { IStep } from '@models/draft';
import { ChampionItem } from '@models/champion';
import { ChampionsGridComponent } from '@components/champions/champions-grid.component';
import { TranslateModule } from '@ngx-translate/core';
import { splashFromResolver } from '@app/utils/images';

/**
 * PicksPanelComponent
 *
 * Visualizes the five picks per team and hosts the champions grid. It exposes
 * a `nameById` computed mapper to render champion names efficiently from the
 * provided `champions` input, avoiding repeated array scans in the template.
 */
@Component({
  selector: 'app-picks-panel',
  standalone: true,
  imports: [CommonModule, ChampionsGridComponent, TranslateModule],
  templateUrl: './picks-panel.component.html',
  styleUrls: ['./picks-panel.component.scss'],
})
export class PicksPanelComponent {
  readonly picksBlue = input<IStep[]>([]);
  readonly picksRed = input<IStep[]>([]);
  // The picks panel no longer requires the champions list
  readonly usedIds = input<Set<number>>();
  readonly disableGrid = input<boolean>(false);
  readonly isPending = input<boolean>(false);
  readonly isSpec = input<boolean>(false);
  readonly getImageById = input<
    (id: number | null) => { splashImage: string; squareImage: string; loadingImage: string } | null
  >();
  // Provide champion names via function from parent
  readonly getNameById = input<(id: number | null) => string>(() => '');
  readonly pickedChampion = output<ChampionItem>();

  /**
   * Returns a function that maps champion id -> name, pre-indexed from the
   * current `champions()` input. Example:
   * ```ts
   * const name = this.nameById()(12); // "Aatrox"
   * ```
   */
  // Returns a function to get champion name by id using current champions input
  readonly nameById = computed<(id: number | null) => string>(() => this.getNameById());

  /** Resolve splash image URL using the provided resolver or return a 1x1 placeholder. */
  imgSplash = (id: number | null): string => splashFromResolver(this.getImageById(), id);
}
