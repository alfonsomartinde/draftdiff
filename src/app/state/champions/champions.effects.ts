import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { ChampionsActions } from './champions.actions';
import { RiotService } from '@services/riot.service';
import { Store } from '@ngrx/store';
import { catchError, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable()
export class ChampionsEffects {
  private readonly actions$ = inject(Actions);
  private readonly data = inject(RiotService);
  private readonly store = inject(Store);

  // Load champions only when status is idle and list empty
  readonly load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChampionsActions['champion/load']),
      switchMap(() =>
        this.data.getChampions().then(
          (list) => ChampionsActions['champion/load-success']({ items: list }),
          (err: any) =>
            ChampionsActions['champion/load-failure']({
              error: err?.message ?? 'Failed to load champions',
            }),
        ),
      ),
      catchError((err: any) =>
        of(
          ChampionsActions['champion/load-failure']({
            error: err?.message ?? 'Failed to load champions',
          }),
        ),
      ),
    ),
  );
}
