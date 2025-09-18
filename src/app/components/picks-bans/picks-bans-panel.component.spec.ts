import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PicksBansPanelComponent } from './picks-bans-panel.component';
import { provideMockStore } from '@ngrx/store/testing';
import { provideRouter } from '@angular/router';

describe('PicksBansPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PicksBansPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideMockStore({
          initialState: {
            draft: {
              roomId: 'r',
              currentSide: 'blue',
              currentStepId: 0,
              countdown: 30,
              steps: [
                { id: 0, type: 'ban', side: 'blue', place: 0, pending: true, championId: null },
              ],
              isFinished: false,
              teams: { blue: { name: 'A', ready: false }, red: { name: 'B', ready: false } },
              events: [],
              eventSeq: 0,
            },
          },
        }),
      ],
    });
  });

  it('creates component', () => {
    const fixture = TestBed.createComponent(PicksBansPanelComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});


