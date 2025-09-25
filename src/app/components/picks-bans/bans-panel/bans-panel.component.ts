import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { IStep } from '@models/draft';
import { TranslateModule } from '@ngx-translate/core';
import { squareFromResolver } from '@app/utils/images';

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
  readonly getImageById = input<(id: number | null) => { squareImage: string } | null>();

  imgSquare = (id: number | null): string => squareFromResolver(this.getImageById(), id);
}
