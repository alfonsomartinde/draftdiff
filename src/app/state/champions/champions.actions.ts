import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ChampionItem } from '@models/champion';
import { ChampionAction } from '@models/champion-actions';

export const ChampionsActions = createActionGroup({
  source: 'Champions',
  events: {
    [ChampionAction.LOAD]: emptyProps(),
    [ChampionAction.LOAD_SUCCESS]: props<{ items: ChampionItem[] }>(),
    [ChampionAction.LOAD_FAILURE]: props<{ error: string }>(),
    [ChampionAction.CLEAR]: emptyProps(),
  },
});
