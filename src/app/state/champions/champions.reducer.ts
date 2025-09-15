import { createReducer, on } from '@ngrx/store';
import { ChampionsActions } from './champions.actions';
import { ChampionItem } from '@models/champion';

export interface ChampionsState {
  status: 'idle' | 'loading' | 'success' | 'error';
  items: ChampionItem[];
  error?: string;
}

export const initialChampionsState: ChampionsState = {
  status: 'idle',
  items: [],
  error: undefined,
};

export const championsReducer = createReducer(
  initialChampionsState,
  on(ChampionsActions['champion/load'], (s) => ({ ...s, status: 'loading', error: undefined })),
  on(ChampionsActions['champion/load-success'], (s, { items }) => ({
    ...s,
    status: 'success',
    items,
  })),
  on(ChampionsActions['champion/load-failure'], (s, { error }) => ({
    ...s,
    status: 'error',
    error,
  })),
  on(ChampionsActions['champion/clear'], () => ({ ...initialChampionsState })),
);
