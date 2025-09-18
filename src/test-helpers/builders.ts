import { ChampionItem } from '@models/champion';
import { DraftState, createInitialDraftState } from '@models/draft';

export function buildChampionItem(p: Partial<ChampionItem> = {}): ChampionItem {
  const base: ChampionItem = {
    id: 1,
    name: 'Aatrox',
    loadingImage: 'https://example/1/loading',
    squareImage: 'https://example/1/square',
    splashImage: 'https://example/1/splash',
  };
  return { ...base, ...p };
}

export function buildDraftState(p: Partial<DraftState> = {}): DraftState {
  return { ...createInitialDraftState(), ...p } as DraftState;
}


