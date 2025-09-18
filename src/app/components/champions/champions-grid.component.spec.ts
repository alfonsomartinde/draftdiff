import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ChampionsGridComponent } from './champions-grid.component';
import { buildChampionItem } from 'src/test-helpers/builders';
import { provideMockStore } from '@ngrx/store/testing';

describe('ChampionsGridComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ChampionsGridComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideMockStore({ initialState: { champions: { status: 'success', items: [] } } }),
      ],
    });
  });

  it('filters champions by query', () => {
    const fixture = TestBed.createComponent(ChampionsGridComponent);
    const cmp = fixture.componentInstance;
    const items = [
      buildChampionItem({ id: 1, name: 'Aatrox' }),
      buildChampionItem({ id: 2, name: 'Ahri' }),
    ];
    fixture.componentRef.setInput('champions', items);
    fixture.detectChanges();
    expect(cmp.filtered().length).toBe(2);
    cmp['query'].set('aat');
    expect(cmp.filtered().map((c) => c.name)).toEqual(['Aatrox']);
  });
});


