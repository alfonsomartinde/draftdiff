import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { WorkerClientService } from '@services/worker-client.service';
import { DraftActions } from './draft.actions';
import { EMPTY, of } from 'rxjs';
import { filter, mergeMap, tap } from 'rxjs/operators';
import { IPostMessage } from '@models/worker';

@Injectable()
export class DraftEffects {
  private readonly client = inject(WorkerClientService);

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
}

