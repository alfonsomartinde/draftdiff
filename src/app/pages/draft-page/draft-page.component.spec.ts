import { TestBed } from '@angular/core/testing';
import { DraftPageComponent } from './draft-page.component';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { draftReducer, initialDraftState } from '@state/draft/draft.reducer';
import { WorkerClientService } from '@services/worker-client.service';

describe('DraftPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DraftPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: ':roomId/blue', component: DraftPageComponent }]),
        provideStore({ draft: draftReducer }, { initialState: { draft: initialDraftState } }),
        {
          provide: WorkerClientService,
          useValue: {
            connect: () => {},
            disconnect: () => {},
            ready: () => {},
            confirm: () => {},
            selectChampion: () => {},
          },
        },
      ],
    });
  });

  it('computes confirmable false when grid disabled', () => {
    const f = TestBed.createComponent(DraftPageComponent);
    const c = f.componentInstance as any;
    c.isFinished = () => true; // force disabled
    expect(c.confirmable()).toBeFalse();
  });
});


