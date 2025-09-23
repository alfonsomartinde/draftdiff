import { createReducer, on } from '@ngrx/store';
import { DraftActions } from './draft.actions';
import { DraftState, createInitialDraftState } from '@models/draft';

export const initialDraftState: DraftState = createInitialDraftState();

export const draftReducer = createReducer(
  initialDraftState,

  // payload: { ...newState }
  on(DraftActions['draft/hydrate'], (state, { newState }) => {
    const currentSeq = state?.eventSeq ?? 0;
    const incomingSeq = newState?.eventSeq ?? 0;

    // If incoming is older, only refresh countdown to avoid UI flicker
    if (incomingSeq < currentSeq) {
      return {
        ...state,
        countdown: newState.countdown,
      };
    }

    // If same seq, treat as tick/state echo: preserve local optimistic selection
    if (incomingSeq === currentSeq) {
      const steps = Array.isArray(newState.steps) ? newState.steps.slice() : state.steps;
      const idx = state.currentStepId;
      if (idx >= 0 && idx < steps.length) {
        const localStep: any = state.steps[idx];
        const incomingStep: any = steps[idx];
        if (
          localStep &&
          incomingStep &&
          localStep.side === incomingStep.side &&
          localStep.type === incomingStep.type
        ) {
          if (
            localStep.championId !== undefined &&
            localStep.championId !== null &&
            incomingStep.championId !== localStep.championId
          ) {
            steps[idx] = { ...incomingStep, championId: localStep.championId };
          }
        }
      }
      return {
        ...state,
        ...newState,
        steps,
      };
    }

    // For newer seq, accept server state as source of truth
    return {
      ...state,
      ...newState,
    };
  }),

  // payload: { newState: { countdown, eventSeq? } }
  on(DraftActions['draft/tick'], (state, { newState }) => {
    const currentSeq = state?.eventSeq ?? 0;
    const incomingSeq = (newState as any)?.eventSeq ?? currentSeq;

    // Ignore stale ticks
    if (incomingSeq < currentSeq) {
      return state;
    }

    // For same seq, update only countdown to avoid overwriting steps
    if (incomingSeq === currentSeq) {
      if (state.countdown === newState.countdown) return state;
      return {
        ...state,
        countdown: Number(newState.countdown ?? state.countdown),
      };
    }

    // For safety (shouldn't happen for ticks), if incoming is newer, still only update countdown
    return {
      ...state,
      countdown: Number(newState.countdown ?? state.countdown),
      eventSeq: Number(incomingSeq),
    } as any;
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
