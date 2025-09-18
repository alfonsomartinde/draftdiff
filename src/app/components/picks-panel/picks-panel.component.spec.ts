import { TestBed } from '@angular/core/testing';
import { PicksPanelComponent } from './picks-panel.component';
import { buildChampionItem } from 'src/test-helpers/builders';

describe('PicksPanelComponent', () => {
  it('nameById returns champion name and empty string for null/unknown', () => {
    const fixture = TestBed.createComponent(PicksPanelComponent);
    const cmp = fixture.componentInstance;
    const champions = [
      buildChampionItem({ id: 1, name: 'Aatrox' }),
      buildChampionItem({ id: 2, name: 'Ahri' }),
    ];
    fixture.componentRef.setInput('champions', champions);
    fixture.detectChanges();

    expect(cmp.nameById()(1)).toBe('Aatrox');
    expect(cmp.nameById()(2)).toBe('Ahri');
    expect(cmp.nameById()(999)).toBe('');
    expect(cmp.nameById()(null)).toBe('');
  });
});


