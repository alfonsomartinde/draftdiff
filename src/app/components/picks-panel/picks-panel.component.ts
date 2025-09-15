import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
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
  readonly imageById = input<Record<number, { splashImage: string; squareImage: string; loadingImage: string }>>();
  readonly pickedChampion = output<ChampionItem>();

  imgSplash = (id: number | null): string => {
    if (id == null) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const image = this.imageById()?.[id];
    if (!image) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    return image.splashImage;
  };
}


