import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ChampionsState } from './champions.reducer';

export const selectChampions = createFeatureSelector<ChampionsState>('champions');

export const selectChampionsStatus = createSelector(selectChampions, (s) => s.status);
export const selectChampionsItems = createSelector(selectChampions, (s) => s.items);
export const selectChampionsImageById = createSelector(selectChampionsItems, (items) => {
  const map: Record<number, { squareImage: string; loadingImage: string; splashImage: string }> =
    {};
  for (const c of items) {
    map[c.id] = {
      squareImage: c.squareImage,
      loadingImage: c.loadingImage,
      splashImage: c.splashImage,
    };
  }
  return map;
});
