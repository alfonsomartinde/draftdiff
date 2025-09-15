import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type Side = 'blue' | 'red';

@Component({
  selector: 'app-team-name',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="d-flex align-items-center align-content-center team-name antonio-700 text-uppercase text-shadow-sm rounded p-3"
      [class.blue]="side() === 'blue'"
      [class.red]="side() === 'red'"
      [class.text-bg-primary]="side() === 'blue'"
      [class.text-bg-danger]="side() === 'red'"
      [class.justify-content-start]="side() === 'blue'"
      [class.justify-content-end]="side() === 'red'"
      [class.current]="current()"
    >
      {{ name() }}
    </div>
  `,
})
export class TeamNameComponent {
  readonly side = input<Side>('blue');
  readonly name = input<string>('Team');
  readonly current = input<boolean>(false);
}
