import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { WorkerClientService } from '@services/worker-client.service';
import { DraftActions } from './draft.actions';
import { EMPTY, of } from 'rxjs';
import { filter, map, mergeMap, tap, distinctUntilChanged } from 'rxjs/operators';
import { IPostMessage } from '@models/worker';

@Injectable()
export class DraftEffects {
  private readonly client = inject(WorkerClientService);
  private readonly actions$ = inject(Actions);

  // Bridge incoming SERVER/STATE to hydrate full state
  readonly incomingState$ = createEffect(() =>
    this.client.incoming$.pipe(
      tap((m) => console.log('[draft-effects] INCOMING MESSAGE', m)),
      filter((m: IPostMessage | null): m is IPostMessage => !!m),
      filter((m) => m.type === 'SERVER/STATE'),
      map((m) => DraftActions['draft/hydrate']({ newState: m.payload.state })),
    ),
  );

  // Bridge incoming SERVER/TICK to lightweight tick updates
  readonly incomingTick$ = createEffect(() =>
    this.client.incoming$.pipe(
      filter((m: IPostMessage | null): m is IPostMessage => !!m),
      filter((m) => m.type === 'SERVER/TICK'),
      map((m) => {
        const s: any = m.payload?.state ?? {};
        return DraftActions['draft/tick']({
          newState: {
            countdown: Number(s.countdown ?? 0),
            eventSeq: Number(s.eventSeq ?? 0),
          } as any,
        });
      }),
      // Only propagate when countdown actually changes
      distinctUntilChanged((a, b) => a.newState.countdown === b.newState.countdown),
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
