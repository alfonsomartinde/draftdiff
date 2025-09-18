import { selectCurrentStep, selectIsFinished, selectTeams } from './draft.selectors';

describe('draft selectors', () => {
  const state = {
    draft: {
      roomId: 'r',
      currentSide: 'blue',
      currentStepId: 0,
      countdown: 30,
      steps: [
        { id: 0, type: 'ban', side: 'blue', place: 0, pending: true, championId: null },
        { id: 1, type: 'ban', side: 'red', place: 0, pending: false, championId: null },
      ],
      isFinished: false,
      teams: { blue: { name: 'A', ready: false }, red: { name: 'B', ready: false } },
      events: [],
      eventSeq: 0,
    },
  } as any;

  it('selectCurrentStep returns current step', () => {
    expect(selectCurrentStep(state as any)).toEqual(state.draft.steps[0]);
  });

  it('selectIsFinished false by default', () => {
    expect(selectIsFinished(state as any)).toBeFalse();
  });

  it('selectTeams returns teams', () => {
    const res = selectTeams(state as any);
    expect(res.blue.name).toBe('A');
    expect(res.red.name).toBe('B');
  });
});

// No projector needed: selectors accept root state with feature key `draft`


