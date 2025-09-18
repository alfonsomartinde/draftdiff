import { createInitialDraftState, maskedFromCurrent, withCountdown } from './draft';

describe('draft helpers', () => {
  it('withCountdown sets countdown', () => {
    const s = createInitialDraftState();
    const next = withCountdown(s, 10);
    expect(next.countdown).toBe(10);
  });

  it('maskedFromCurrent resets steps and preserves team names', () => {
    const s = createInitialDraftState({ teams: { blue: { name: 'A', ready: true }, red: { name: 'B', ready: true } } as any });
    const masked = maskedFromCurrent(s);
    expect(masked.steps[0].championId).toBeNull();
    expect(masked.teams.blue.name).toBe('A');
    expect(masked.teams.red.name).toBe('B');
    expect(masked.isFinished).toBeTrue();
  });
});


