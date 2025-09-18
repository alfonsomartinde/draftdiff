import { selectChampionsImageById, selectChampionsItems, selectChampionsStatus } from './champions.selectors';

describe('champions selectors', () => {
  const state = {
    champions: {
      status: 'success',
      items: [
        { id: 1, name: 'Aatrox', loadingImage: 'l', squareImage: 's', splashImage: 'p' },
      ],
    },
  } as any;

  it('selectChampionsStatus', () => {
    expect(selectChampionsStatus(state as any)).toBe('success');
  });

  it('selectChampionsItems', () => {
    expect(selectChampionsItems(state as any).length).toBe(1);
  });

  it('selectChampionsImageById maps id to image set', () => {
    const map = selectChampionsImageById(state as any);
    expect(map[1].squareImage).toBe('s');
  });
});


