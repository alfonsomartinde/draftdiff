import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { ChampionItem } from '@models/champion';
import {
  selectChampionsImageById,
  selectChampionsItems,
  selectChampionsStatus,
} from '@state/champions/champions.selectors';
import { ChampionsActions } from '@state/champions/champions.actions';
import { CHAMPIONS_TSTATE_KEY } from './transfer-keys';
import { TransferState } from '@angular/core';

/**
 * ChampionsFacade
 *
 * Purpose: Expose champions data (items, images, status) and a simple load method.
 * Why created: Hide NgRx internals behind a minimal API for components.
 * Example: championsFacade.load() tries TransferState first, then dispatches load.
 */
@Injectable({ providedIn: 'root' })
export class ChampionsFacade {
  private readonly store = inject(Store);
  private readonly tstate = inject(TransferState);
  readonly items$: Observable<ChampionItem[]> = this.store.select(selectChampionsItems);
  readonly status$: Observable<'idle' | 'loading' | 'error' | 'success'> = this.store.select(
    selectChampionsStatus,
  );
  readonly imageById$: Observable<
    Record<number, { squareImage: string; loadingImage: string; splashImage: string }>
  > = this.store.select(selectChampionsImageById);

  constructor() {}

  /** Load champions: prefer TransferState cache, else trigger NgRx load. */
  load(): void {
    // Hydrate from TransferState if present, otherwise dispatch load
    const pre = this.tstate.get(CHAMPIONS_TSTATE_KEY, undefined as unknown as ChampionItem[]);
    if (Array.isArray(pre) && pre.length > 0) {
      this.store.dispatch(ChampionsActions['champion/load-success']({ items: pre }));
      this.tstate.remove(CHAMPIONS_TSTATE_KEY);
      return;
    }
    this.store.dispatch(ChampionsActions['champion/load']());
  }
}


