import { draftReducer, initialDraftState } from './draft.reducer';
import { DraftActions } from './draft.actions';
import { DraftAction } from '@models/draft-actions';
import { createInitialDraftState } from '@models/draft';

describe('draftReducer', () => {
  it('ready marks the given side as ready', () => {
    const s = createInitialDraftState();
    const next = draftReducer(s, DraftActions[DraftAction.READY]({ roomId: 'r', side: 'blue' }));
    expect(next.teams.blue.ready).toBeTrue();
    expect(next.teams.red.ready).toBeFalse();
  });

  it('select sets championId on current step when matches side/type', () => {
    let s = createInitialDraftState();
    // Current step: id=0, side=blue, type=ban
    s = draftReducer(s, DraftActions[DraftAction.SELECT]({ roomId: 'r', side: 'blue', action: 'ban', championId: 12 }));
    expect(s.steps[s.currentStepId].championId).toBe(12);
  });

  it('confirm advances to next step and sets pending flags', () => {
    let s = createInitialDraftState();
    s = draftReducer(s, DraftActions[DraftAction.SELECT]({ roomId: 'r', side: 'blue', action: 'ban', championId: 12 }));
    s = draftReducer(s, DraftActions[DraftAction.CONFIRM]({ roomId: 'r', side: 'blue', action: 'ban' }));
    expect(s.currentStepId).toBe(1);
    expect(s.steps[0].pending).toBeFalse();
    expect(s.steps[1].pending).toBeTrue();
  });

  it('confirm on last step sets isFinished=true and countdown=0', () => {
    // Move to last step
    let s = createInitialDraftState();
    s.currentStepId = s.steps.length - 1;
    const last = s.steps[s.currentStepId];
    s = draftReducer(s, DraftActions[DraftAction.CONFIRM]({ roomId: 'r', side: last.side, action: last.type }));
    expect(s.isFinished).toBeTrue();
    expect(s.countdown).toBe(0);
  });

  it('tick applies countdown from newState', () => {
    let s = createInitialDraftState();
    const with10 = { ...s, countdown: 10 } as any;
    s = draftReducer(s, DraftActions[DraftAction.TICK]({ newState: with10 }));
    expect(s.countdown).toBe(10);
  });

  it('set-team-name updates given team name', () => {
    let s = createInitialDraftState();
    s = draftReducer(s, DraftActions[DraftAction.SET_TEAM_NAME]({ roomId: 'r', side: 'red', name: 'Team R' }));
    expect(s.teams.red.name).toBe('Team R');
  });
});


