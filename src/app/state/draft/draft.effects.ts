import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { WorkerClientService } from '@services/worker-client.service';
import { DraftActions } from './draft.actions';
import { EMPTY, of } from 'rxjs';
import { filter, mergeMap, tap } from 'rxjs/operators';
import { IPostMessage } from '@models/worker';

@Injectable()
export class DraftEffects {
  private readonly client = inject(WorkerClientService);
  private readonly actions$ = inject(Actions);

  // Bridge incoming worker events to NgRx actions
  readonly incoming$ = createEffect(() =>
    this.client.incoming$.pipe(
      tap((m) => console.log('[draft-effects] INCOMING MESSAGE', m)),
      filter((m: IPostMessage | null): m is IPostMessage => !!m),
      mergeMap((m) => {
        switch (m.type) {
          case 'SERVER/TICK':
          case 'SERVER/STATE':
            return of(
              DraftActions['draft/hydrate']({
                newState: m.payload.state,
              }),
            );
          default:
            return EMPTY;
        }
      }),
    ),
  );

  // Outgoing side-effects: forward draft actions to worker client
  readonly ready$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DraftActions['draft/ready']),
        tap(({ roomId, side }) => this.client.ready({ roomId, side })),
      ),
    { dispatch: false },
  );

  readonly select$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DraftActions['draft/select']),
        tap(({ roomId, side, action, championId }) =>
          this.client.selectChampion({ roomId, side, action, championId: championId as number }),
        ),
      ),
    { dispatch: false },
  );

  readonly confirm$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DraftActions['draft/confirm']),
        tap(({ roomId, side, action }) => this.client.confirm({ roomId, side, action })),
      ),
    { dispatch: false },
  );

  readonly setTeamName$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(DraftActions['draft/set-team-name']),
        tap(({ roomId, side, name }) => this.client.setTeamName({ roomId, side, name })),
      ),
    { dispatch: false },
  );
}
