import { TestBed } from '@angular/core/testing';
import { LobbyPageComponent } from './lobby-page.component';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideStore, Store } from '@ngrx/store';
import { provideRouter } from '@angular/router';
import { draftReducer, initialDraftState } from '@state/draft/draft.reducer';
import { RoomsService } from '@services/rooms.service';

describe('LobbyPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LobbyPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideStore({ draft: draftReducer }, { initialState: { draft: initialDraftState } }),
        {
          provide: RoomsService,
          useValue: {
            createRoom: () => Promise.resolve({ ...initialDraftState, roomId: 'r1' }),
          },
        },
      ],
    });
  });

  it('dispatches hydrate after create()', (done) => {
    const fixture = TestBed.createComponent(LobbyPageComponent);
    const cmp = fixture.componentInstance as any;
    const store = TestBed.inject(Store);
    spyOn(store, 'dispatch').and.callThrough();
    cmp.blueTeamName = 'A';
    cmp.redTeamName = 'B';
    cmp.create();
    setTimeout(() => {
      expect(store.dispatch).toHaveBeenCalled();
      done();
    }, 0);
  });
});


