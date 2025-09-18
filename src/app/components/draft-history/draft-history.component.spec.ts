import { TestBed } from '@angular/core/testing';
import { provideStore } from '@ngrx/store';
import { DraftHistoryComponent } from './draft-history.component';
import { draftReducer } from '@state/draft/draft.reducer';
import { createInitialDraftState } from '@models/draft';

describe('DraftHistoryComponent', () => {
  function setup(initial: any = createInitialDraftState()) {
    TestBed.configureTestingModule({
      imports: [DraftHistoryComponent],
      providers: [provideStore({ draft: draftReducer }, { initialState: { draft: initial } })],
    });
    const fixture = TestBed.createComponent(DraftHistoryComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, cmp };
  }

  it('emits indexChanged when user scrubs in uncontrolled mode', () => {
    const { cmp } = setup();
    let emitted: number | null = null;
    cmp.indexChanged.subscribe((v) => (emitted = v));
    cmp.setIndex(0);
    expect(emitted).toBe(0);
  });

  it('ignores user input when controlled is true', () => {
    const { cmp } = setup();
    cmp.controlled = true;
    let emitted: number | null = null;
    cmp.indexChanged.subscribe((v) => (emitted = v));
    cmp.setIndex(1);
    expect(emitted).toBeNull();
  });
});


