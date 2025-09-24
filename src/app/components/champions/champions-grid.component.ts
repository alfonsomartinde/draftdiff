import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectChampionsItems, selectChampionsStatus } from '@state/champions/champions.selectors';
import { ChampionItem } from '@models/champion';
import { ChampionsActions } from '@state/champions/champions.actions';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-champions-grid',
  imports: [CommonModule, FormsModule, TranslateModule],
  standalone: true,
  templateUrl: './champions-grid.component.html',
  styleUrls: ['./champions-grid.component.scss'],
})
export class ChampionsGridComponent {
  private readonly store = inject(Store);
  readonly disabled = input<boolean>(false);
  readonly champions = input<ChampionItem[]>([]);
  readonly usedIds = input<Set<number>>();
  readonly isPending = input<boolean>(false);
  readonly isSpec = input<boolean>(false);

  readonly query = signal<string>('');
  readonly pickedChampion = output<ChampionItem>();

  // NgRx-backed signals
  readonly status = toSignal(this.store.select(selectChampionsStatus), {
    initialValue: 'idle' as const,
  });
  readonly storeItems = toSignal(this.store.select(selectChampionsItems), {
    initialValue: [] as ChampionItem[],
  });

  constructor() {
    effect(() => {
      const s = this.status();
      if (s === 'idle') {
        this.store.dispatch(ChampionsActions['champion/load']());
      }
    });
  }

  /**
   * @description Filters champions by name
   */
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const inputList: ChampionItem[] = this.champions() ?? [];
    const list: ChampionItem[] = inputList.length > 0 ? inputList : (this.storeItems() ?? []);
    if (!q) return list;
    return list.filter((c: ChampionItem) => c.name.toLowerCase().includes(q));
  });

  /**
   * @description Clears the query
   */
  clear(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.query.set('');
  }

  /**
   * @description Emits the selected champion
   */
  emitSelectedChampionEvent(c: ChampionItem, ev?: MouseEvent): void {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (this.disabled()) return;
    this.pickedChampion.emit(c);
  }
}
