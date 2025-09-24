import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { IStep } from '@models/draft';
import { TranslateModule } from '@ngx-translate/core';
import { TRANSPARENT_PIXEL_GIF } from '@app/constants/images';

/**
 * BansPanelComponent
 *
 * Renders the bans lane for each team. Shows placeholder slots and pending state styling
 * while the draft is in progress. Uses provided imageById mapping for champion squares.
 */
@Component({
  selector: 'app-bans-panel',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './bans-panel.component.html',
  styleUrls: ['./bans-panel.component.scss'],
})
export class BansPanelComponent {
  readonly bansBlue = input<IStep[]>([]);
  readonly bansRed = input<IStep[]>([]);
  readonly hasStarted = input<boolean>(false);
  readonly imageById = input<Record<number, { squareImage: string }>>();

  imgSquare = (id: number | null): string => {
    if (id == null) return TRANSPARENT_PIXEL_GIF;
    const image = this.imageById()?.[id];
    if (!image) return TRANSPARENT_PIXEL_GIF;
    return image.squareImage;
  };
}
