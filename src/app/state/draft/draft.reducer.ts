import { createReducer, on } from '@ngrx/store';
import { DraftActions } from './draft.actions';
import { DraftState, createInitialDraftState } from '@models/draft';

export const initialDraftState: DraftState = createInitialDraftState();

export const draftReducer = createReducer(
  initialDraftState,

  // payload: { ...newState }
  on(DraftActions['draft/hydrate'], (state, { newState }) => ({
    ...state,
    ...newState,
  })),

  // payload: { ...newState }
  on(DraftActions['draft/tick'], (state, { newState }) => {
    const next = {
      ...state,
      ...newState,
    };
    console.log('[draft-reducer] TICK', { from: state.countdown, to: next.countdown });
    return next;
  }),

  // payload: { roomId, side }
  on(DraftActions['draft/ready'], (state, { roomId, side }) => ({
    ...state,
    teams: {
      blue: {
        ...state.teams.blue,
        ready: side === 'blue' ? true : state.teams.blue.ready,
      },
      red: {
        ...state.teams.red,
        ready: side === 'red' ? true : state.teams.red.ready,
      },
    },
  })),

  // payload: { roomId, side, name }
  on(DraftActions['draft/set-team-name'], (state, { roomId, side, name }) => ({
    ...state,
    teams: {
      blue: {
        ...state.teams.blue,
        name: side === 'blue' ? name?.trim() || state.teams.blue.name : state.teams.blue.name,
      },
      red: {
        ...state.teams.red,
        name: side === 'red' ? name?.trim() || state.teams.red.name : state.teams.red.name,
      },
    },
  })),

  // payload: { roomId, side, action, championId }
  on(DraftActions['draft/select'], (state, { roomId, side, action, championId }) => {
    const idx = state.currentStepId;
    const step = state.steps[idx];

    if (!step || step.side !== side || step.type !== action) return state;

    const steps = state.steps.slice();
    steps[idx] = { ...step, championId };

    return {
      ...state,
      steps,
    };
  }),

  // payload: { roomId, side, action }
  on(DraftActions['draft/confirm'], (state, { roomId, side, action }) => {
    const idx = state.currentStepId;
    const step = state.steps[idx];

    if (!step || step.side !== side || step.type !== action) return state;

    const steps = state.steps.slice();

    // Current step set to not pending
    steps[idx] = {
      ...step,
      pending: false,
    };

    const nextIdx = idx + 1;
    const finished = nextIdx >= steps.length;

    if (!finished) {
      // Next step set to pending
      steps[nextIdx] = {
        ...steps[nextIdx],
        pending: true,
      };
    }

    return {
      ...state,
      steps,
      currentStepId: nextIdx,
      countdown: finished ? 0 : 30,
      isFinished: finished,
    };
  }),
);
