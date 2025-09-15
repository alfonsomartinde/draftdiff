import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { IStep } from '@models/draft';

@Component({
  selector: 'app-bans-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bans-panel.component.html',
  styleUrls: ['./bans-panel.component.scss'],
})
export class BansPanelComponent {
  readonly bansBlue = input<IStep[]>([]);
  readonly bansRed = input<IStep[]>([]);
  readonly hasStarted = input<boolean>(false);
  readonly imageById = input<Record<number, { squareImage: string }>>();

  imgSquare = (id: number | null): string => {
    if (id == null) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const image = this.imageById()?.[id];
    if (!image) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    return image.squareImage;
  };
}


