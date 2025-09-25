import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { DraftActions } from '@state/draft/draft.actions';
import { DraftAction } from '@models/draft-actions';
import { UserSide } from '@models/draft';
import { withCountdown } from '@models/draft';

/**
 * DraftFacade
 *
 * Purpose: Provide a simple, typed API to dispatch draft-related actions.
 * Why created: Keep components/services free from NgRx details and action shapes.
 * Example: draftFacade.confirm(roomId, 'blue', 'pick')
 */
@Injectable({ providedIn: 'root' })
export class DraftFacade {
  constructor(private readonly store: Store) {}

  /** Dispatch READY for the given side. */
  ready(roomId: string, side: UserSide): void {
    this.store.dispatch(DraftActions[DraftAction.READY]({ roomId, side }));
  }

  /** Dispatch SELECT with side/action/championId. */
  select(
    roomId: string,
    side: UserSide,
    action: 'pick' | 'ban',
    championId: number,
  ): void {
    this.store.dispatch(
      DraftActions[DraftAction.SELECT]({ roomId, side, action, championId }),
    );
  }

  /** Dispatch CONFIRM for the given side and action. */
  confirm(roomId: string, side: UserSide, action: 'pick' | 'ban'): void {
    this.store.dispatch(DraftActions[DraftAction.CONFIRM]({ roomId, side, action }));
  }

  /** Hydrate full state from a server or computed snapshot. */
  hydrate(newState: any): void {
    this.store.dispatch(DraftActions[DraftAction.HYDRATE]({ newState }));
  }

  /** Dispatch a countdown tick with an explicit value. */
  tickWithValue(currentState: any, value: number): void {
    this.store.dispatch(
      DraftActions[DraftAction.TICK]({ newState: withCountdown(currentState as any, value) }),
    );
  }
}


