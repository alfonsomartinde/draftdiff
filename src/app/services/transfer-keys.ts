import { makeStateKey, StateKey } from '@angular/core';
import { ChampionItem } from '@models/champion';

export const CHAMPIONS_TSTATE_KEY: StateKey<ChampionItem[]> = makeStateKey<ChampionItem[]>(
  'champions-transfer-state',
);


