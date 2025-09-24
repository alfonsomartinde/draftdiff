import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type Side = 'blue' | 'red';

@Component({
  selector: 'app-team-name',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-name.component.html',
  styleUrls: ['./team-name.component.scss'],
})
export class TeamNameComponent {
  readonly side = input<Side>('blue');
  readonly name = input<string>('Team');
  readonly current = input<boolean>(false);
}
