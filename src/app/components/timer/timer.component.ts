import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-timer',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="countdown-badge badge text-bg-dark antonio-700 p-3">{{ value() }}</div>`,
})
export class TimerComponent {
  readonly value = input<number>(0);
}


