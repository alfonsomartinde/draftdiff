import { DraftState, DraftType, IStep, UserSide, DraftEvent } from '@models/draft';
import { EVENT_TYPES, MESSAGE_TYPES } from '@models/worker';

/**
 * Draft domain reducer
 *
 * Purpose: Pure function that takes current DraftState and a DomainAction and returns
 * the next DraftState plus symbolic side-effects (persist/emit/start-timer/etc.).
 * Why created: Keep business rules testable and independent of IO.
 */

export type DomainAction =
  | { type: typeof MESSAGE_TYPES.CLIENT.JOIN }
  | { type: typeof MESSAGE_TYPES.CLIENT.READY; payload: { side: UserSide } }
  | {
      type: typeof MESSAGE_TYPES.CLIENT.SELECT;
      payload: { side: UserSide; action: DraftType; championId: number | null };
    }
  | { type: typeof MESSAGE_TYPES.CLIENT.CONFIRM; payload: { side: UserSide; action: DraftType } }
  | { type: typeof MESSAGE_TYPES.CLIENT.SET_TEAM_NAME; payload: { side: UserSide; name: string } }
  | { type: typeof MESSAGE_TYPES.SERVER.TICK; payload: { countdown: number } }
  | { type: typeof MESSAGE_TYPES.SERVER.AUTO_CONFIRM };

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

/**
 * Create a deep clone using JSON serialization.
 * Simple and safe for our plain data structures.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/** Returns true when current step is the last one. */
function isLastStep(state: DraftState): boolean {
  return state.currentStepId + 1 >= state.steps.length;
}

/** Returns the current step based on currentStepId. */
function getCurrentStep(state: DraftState): IStep | undefined {
  return state.steps[state.currentStepId];
}

/** True if both teams marked ready. */
function bothTeamsReady(state: DraftState): boolean {
  return !!(state?.teams?.blue?.ready && state?.teams?.red?.ready);
}

/** Handle CLIENT/READY; logs event only when both sides are ready (timer starts). */
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
      type: EVENT_TYPES.CLIENT.READY,
      payload: { side },
      countdownAt: next.countdown, // normalmente DEFAULT_DEADLINE_SECONDS
    });
    effects.push({ kind: 'persist' }, { kind: 'emit-state' }, { kind: 'start-timer' });
  } else {
    effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  }
  return { state: next, effects };
}

/** Handle CLIENT/SELECT; only logs when the draft has officially started. */
function handleSelect(
  next: DraftState,
  payload: { side: UserSide; action: DraftType; championId: number | null },
): ReducerResult {
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
      type: EVENT_TYPES.CLIENT.SELECT,
      payload,
      countdownAt: next.countdown,
    });
  }
  effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  return { state: next, effects };
}

/**
 * Handle CONFIRM (client or server auto-confirm).
 * - Closes current step (or the draft if last)
 * - Logs event with appropriate type
 */
function closeOrAdvance(
  next: DraftState,
  logType: 'CLIENT/CONFIRM' | 'CONFIRM',
  extra: Record<string, any> = {},
): ReducerResult {
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
      type: EVENT_TYPES.CLIENT.CONFIRM,
      payload: { side: step.side, action: step.type, championId: step.championId },
      countdownAt: countdownBefore,
    });
  } else {
    pushEvent(next, {
      seq: ++next.eventSeq,
      at: new Date().toISOString(),
      source: 'server',
      type: EVENT_TYPES.SERVER.CONFIRM,
      payload: {
        side: step.side,
        action: step.type,
        championId: step.championId,
        reason: 'timeout',
      },
      countdownAt: 0,
    });
  }
  // Ensure that the last event is CONFIRM for the current step by adjusting last at if needed
  const len = next.events.length;
  if (len >= 2) {
    const last = next.events[len - 1];
    const prev = next.events[len - 2];
    if (last.type === 'CLIENT/CONFIRM' || last.type === 'CONFIRM') {
      const prevAt = new Date(prev.at).getTime();
      const lastAt = new Date(last.at).getTime();
      if (Number.isFinite(prevAt) && Number.isFinite(lastAt) && lastAt <= prevAt) {
        last.at = new Date(prevAt + 1).toISOString();
      }
    }
  }
  effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  effects.push(last ? { kind: 'stop-timer' } : { kind: 'start-timer' });
  return { state: next, effects };
}

/** Handle CLIENT/SET_TEAM_NAME while draft is active. */
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
      type: EVENT_TYPES.CLIENT.SET_TEAM_NAME,
      payload: { side, name: newName },
      countdownAt: next.countdown,
    });
  }
  effects.push({ kind: 'persist' }, { kind: 'emit-state' });
  return { state: next, effects };
}

/** Public reducer entrypoint. */
export function reduce(state: DraftState, action: DomainAction): ReducerResult {
  const effects: ReducerEffect[] = [];
  const next = deepClone(state);

  switch (action.type) {
    case MESSAGE_TYPES.CLIENT.JOIN: {
      effects.push({ kind: 'emit-state' });
      return { state: next, effects };
    }

    case MESSAGE_TYPES.CLIENT.READY: {
      return handleReady(next, action.payload.side);
    }

    case MESSAGE_TYPES.CLIENT.SELECT: {
      return handleSelect(next, {
        side: action.payload.side,
        action: action.payload.action,
        championId: action.payload.championId,
      });
    }

    case MESSAGE_TYPES.CLIENT.CONFIRM: {
      return closeOrAdvance(next, 'CLIENT/CONFIRM');
    }

    case MESSAGE_TYPES.CLIENT.SET_TEAM_NAME: {
      return handleSetTeamName(next, action.payload.side, action.payload.name);
    }

    case MESSAGE_TYPES.SERVER.TICK: {
      // El countdown es calculado por el orquestador
      next.countdown = Math.max(0, Number(action.payload.countdown || 0));
      effects.push({ kind: 'emit-tick' });
      return { state: next, effects };
    }

    case MESSAGE_TYPES.SERVER.AUTO_CONFIRM: {
      return closeOrAdvance(next, 'CONFIRM');
    }
  }

  return { state: next, effects };
}

/**
 * Append an event ensuring strictly increasing `at` timestamp.
 * Why: stable chronological order for replay and persistence.
 */
function pushEvent(next: DraftState, evt: DraftEvent) {
  // Ensure monotonic sequence is already set by callers (seq++)
  // Enforce stable chronological order at append-time
  const prev = next.events[next.events.length - 1];
  if (prev) {
    const prevAt = new Date(prev.at).getTime();
    let atMs = new Date(evt.at).getTime();
    if (!Number.isFinite(atMs)) atMs = Date.now();
    if (!Number.isFinite(prevAt)) {
      // If previous is invalid, just coerce current to now
      evt.at = new Date(atMs).toISOString();
    } else {
      // Monotonic: at >= prevAt + 1ms
      evt.at = new Date(Math.max(prevAt + 1, atMs)).toISOString();
    }
  }
  next.events.push(evt);
}
