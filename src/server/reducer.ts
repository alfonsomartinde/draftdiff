import { DraftState, DraftType, IStep, UserSide, DraftEvent } from '@models/draft';

export type DomainAction =
  | { type: 'CLIENT/JOIN' }
  | { type: 'CLIENT/READY'; payload: { side: UserSide } }
  | { type: 'CLIENT/SELECT'; payload: { side: UserSide; action: DraftType; championId: number | null } }
  | { type: 'CLIENT/CONFIRM'; payload: { side: UserSide; action: DraftType } }
  | { type: 'CLIENT/SET_TEAM_NAME'; payload: { side: UserSide; name: string } }
  | { type: 'SERVER/TICK'; payload: { countdown: number } }
  | { type: 'SERVER/AUTO_CONFIRM' };

export type ReducerEffect =
  | { kind: 'persist' }
  | { kind: 'emit-state' }
  | { kind: 'emit-tick' }
  | { kind: 'start-timer' }
  | { kind: 'stop-timer' }
  | { kind: 'log-event'; eventType: string; payload: Record<string, any> };

export type ReducerResult = {
  state: DraftState;
  effects: ReducerEffect[];
};

const DEFAULT_DEADLINE_SECONDS = 30;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function isLastStep(state: DraftState): boolean {
  return state.currentStepId + 1 >= state.steps.length;
}

function getCurrentStep(state: DraftState): IStep | undefined {
  return state.steps[state.currentStepId];
}

function bothTeamsReady(state: DraftState): boolean {
  return !!(state?.teams?.blue?.ready && state?.teams?.red?.ready);
}

function handleReady(next: DraftState, side: UserSide): ReducerResult {
  const effects: ReducerEffect[] = [];
  if (next.isFinished) return { state: next, effects };
  if (next.teams[side].ready) return { state: next, effects };
  next.teams[side].ready = true;
  // Registrar READY solo cuando arranca el timer (segundo READY)
  if (bothTeamsReady(next)) {
    pushEvent(next, {
      seq: ++next.eventSeq,
      at: new Date().toISOString(),
      source: 'client',
      type: 'CLIENT/READY',
      payload: { side },
      countdownAt: next.countdown, // normalmente DEFAULT_DEADLINE_SECONDS
    });
    effects.push({ kind: 'persist' }, { kind: 'emit-state' }, { kind: 'start-timer' });
  } else {
    effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  }
  return { state: next, effects };
}

function handleSelect(next: DraftState, payload: { side: UserSide; action: DraftType; championId: number | null }): ReducerResult {
  const effects: ReducerEffect[] = [];
  if (next.isFinished) return { state: next, effects };
  const step = getCurrentStep(next);
  if (!step) return { state: next, effects };
  if (step.side !== payload.side || step.type !== payload.action) return { state: next, effects };
  next.steps[next.currentStepId] = { ...step, championId: payload.championId };
  // Registrar solo si ambos READY (draft en marcha)
  if (bothTeamsReady(next)) {
    pushEvent(next, {
      seq: ++next.eventSeq,
      at: new Date().toISOString(),
      source: 'client',
      type: 'CLIENT/SELECT',
      payload,
      countdownAt: next.countdown,
    });
  }
  effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  return { state: next, effects };
}

function closeOrAdvance(next: DraftState, logType: 'CLIENT/CONFIRM' | 'CONFIRM', extra: Record<string, any> = {}): ReducerResult {
  const effects: ReducerEffect[] = [];
  if (next.isFinished) return { state: next, effects };
  const step = getCurrentStep(next);
  if (!step) return { state: next, effects };

  const countdownBefore = next.countdown;
  next.steps[next.currentStepId] = { ...step, pending: false };
  const last = isLastStep(next);
  if (!last) {
    const nextId = next.currentStepId + 1;
    const nextStep = next.steps[nextId];
    if (nextStep) next.steps[nextId] = { ...nextStep, pending: true };
    next.currentStepId = nextId;
    next.countdown = DEFAULT_DEADLINE_SECONDS;
  } else {
    next.isFinished = true;
    next.countdown = 0;
  }

  if (logType === 'CLIENT/CONFIRM') {
    pushEvent(next, {
      seq: ++next.eventSeq,
      at: new Date().toISOString(),
      source: 'client',
      type: 'CLIENT/CONFIRM',
      payload: { side: step.side, action: step.type, championId: step.championId },
      countdownAt: countdownBefore,
    });
  } else {
    pushEvent(next, {
      seq: ++next.eventSeq,
      at: new Date().toISOString(),
      source: 'server',
      type: 'CONFIRM',
      payload: { side: step.side, action: step.type, championId: step.championId, reason: 'timeout' },
      countdownAt: 0,
    });
  }
  effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  effects.push(last ? { kind: 'stop-timer' } : { kind: 'start-timer' });
  return { state: next, effects };
}

function handleSetTeamName(next: DraftState, side: UserSide, name: string): ReducerResult {
  const effects: ReducerEffect[] = [];
  if (next.isFinished) return { state: next, effects };
  const newName = typeof name === 'string' && name.trim() ? name.trim() : next.teams[side].name;
  if (newName === next.teams[side].name) return { state: next, effects };
  next.teams[side].name = newName;
  if (bothTeamsReady(next)) {
    pushEvent(next, {
      seq: ++next.eventSeq,
      at: new Date().toISOString(),
      source: 'client',
      type: 'CLIENT/SET_TEAM_NAME',
      payload: { side, name: newName },
      countdownAt: next.countdown,
    });
  }
  effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  return { state: next, effects };
}

export function reduce(state: DraftState, action: DomainAction): ReducerResult {
  const effects: ReducerEffect[] = [];
  const next = deepClone(state);

  switch (action.type) {
    case 'CLIENT/JOIN': {
      effects.push({ kind: 'emit-state' });
      return { state: next, effects };
    }

    case 'CLIENT/READY': {
      return handleReady(next, action.payload.side);
    }

    case 'CLIENT/SELECT': {
      return handleSelect(next, { side: action.payload.side, action: action.payload.action, championId: action.payload.championId });
    }

    case 'CLIENT/CONFIRM': {
      return closeOrAdvance(next, 'CLIENT/CONFIRM');
    }

    case 'CLIENT/SET_TEAM_NAME': {
      return handleSetTeamName(next, action.payload.side, action.payload.name);
    }

    case 'SERVER/TICK': {
      // El countdown es calculado por el orquestador
      next.countdown = Math.max(0, Number(action.payload.countdown || 0));
      effects.push({ kind: 'emit-tick' });
      return { state: next, effects };
    }

    case 'SERVER/AUTO_CONFIRM': {
      return closeOrAdvance(next, 'CONFIRM');
    }
  }

  return { state: next, effects };
}

function pushEvent(next: DraftState, evt: DraftEvent) {
  next.events.push(evt);
}


