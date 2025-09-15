import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { DraftAction } from '@models/draft-actions';
import { DraftState, DraftType, UserSide } from '@models/draft';

export const DraftActions = createActionGroup({
  source: 'Draft',
  events: {
    [DraftAction.HYDRATE]: props<{ newState: DraftState }>(),
    [DraftAction.TICK]: props<{ newState: DraftState }>(),
    [DraftAction.READY]: props<{ roomId: string; side: UserSide }>(),
    [DraftAction.SET_TEAM_NAME]: props<{ roomId: string; side: UserSide; name: string }>(),
    [DraftAction.SELECT]: props<{
      roomId: string;
      side: UserSide;
      action: DraftType;
      championId: number | null;
    }>(),
    [DraftAction.CONFIRM]: props<{ roomId: string; side: UserSide; action: DraftType }>(),
  },
});
