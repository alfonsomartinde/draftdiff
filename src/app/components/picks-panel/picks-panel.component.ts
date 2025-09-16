import { CommonModule } from '@angular/common';
import { Component, input, output, computed } from '@angular/core';
import { IStep } from '@models/draft';
import { ChampionItem } from '@models/champion';
import { ChampionsGridComponent } from '@components/champions/champions-grid.component';

@Component({
  selector: 'app-picks-panel',
  standalone: true,
  imports: [CommonModule, ChampionsGridComponent],
  templateUrl: './picks-panel.component.html',
  styleUrls: ['./picks-panel.component.scss'],
})
export class PicksPanelComponent {
  readonly picksBlue = input<IStep[]>([]);
  readonly picksRed = input<IStep[]>([]);
  readonly champions = input<ChampionItem[]>([]);
  readonly usedIds = input<Set<number>>();
  readonly disableGrid = input<boolean>(false);
  readonly isPending = input<boolean>(false);
  readonly isSpec = input<boolean>(false);
  readonly imageById =
    input<Record<number, { splashImage: string; squareImage: string; loadingImage: string }>>();
  readonly pickedChampion = output<ChampionItem>();

  // Returns a function to get champion name by id using current champions input
  readonly nameById = computed<(id: number | null) => string>(() => {
    const list = this.champions() ?? [];
    const index = new Map<number, string>();
    for (const c of list) index.set(c.id, c.name);
    return (id: number | null): string => {
      if (id == null) return '';
      return index.get(id) ?? '';
    };
  });

  imgSplash = (id: number | null): string => {
    if (id == null) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const image = this.imageById()?.[id];
    if (!image) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    return image.splashImage;
  };
}
