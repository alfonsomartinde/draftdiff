import { TestBed } from '@angular/core/testing';
import { provideEffects } from '@ngrx/effects';
import { provideMockActions } from '@ngrx/effects/testing';
import { Observable, of, ReplaySubject } from 'rxjs';
import { ChampionsEffects } from './champions.effects';
import { ChampionsActions } from './champions.actions';
import { RiotService } from '@services/riot.service';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideStore } from '@ngrx/store';
import { provideMockStore } from '@ngrx/store/testing';

describe('ChampionsEffects', () => {
  let actions$: ReplaySubject<any>;
  let effects: ChampionsEffects;

  beforeEach(() => {
    actions$ = new ReplaySubject(1);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideStore({} as any),
        provideMockStore({ initialState: { champions: { status: 'idle', items: [] } } }),
        provideEffects(ChampionsEffects),
        provideMockActions(() => actions$ as unknown as Observable<any>),
        {
          provide: RiotService,
          useValue: {
            getChampions: () => Promise.resolve([]),
          },
        },
      ],
    });
    effects = TestBed.inject(ChampionsEffects);
  });

  it('emits load-success on champion/load', (done) => {
    TestBed.runInInjectionContext(() => {
      effects.load$.subscribe((action) => {
        expect(action.type).toBe(ChampionsActions['champion/load-success'].type);
        done();
      });
      actions$.next(ChampionsActions['champion/load']());
    });
  });
});


