export type DraftSide = 'blue' | 'red' | 'spec';
export type UserSide = 'blue' | 'red';
export type DraftType = 'pick' | 'ban';

export interface IReady {
  blue: boolean;
  red: boolean;
}

export interface IStep {
  id: number;
  type: DraftType;
  side: UserSide;
  place: number;
  pending: boolean;
  championId: number | null;
}

export interface IPending {
  blue: number | null; // Champion ID or null if no selection
  red: number | null; // Champion ID or null if no selection
}

export interface IPicksBans {
  blue: number[]; // Champion IDs
  red: number[]; // Champion IDs
}

export interface ITeam {
  name: string;
  ready: boolean;
}

export interface DraftState {
  roomId: string;
  currentSide: UserSide;
  currentStepId: number;
  countdown: number;
  steps: IStep[];
  isFinished: boolean;
  teams: {
    blue: ITeam;
    red: ITeam;
  };
  // Events kept in-room instead of database table
  events: DraftEvent[];
  // Monotonic sequence number per room for events
  eventSeq: number;
}

export function createInitialDraftState(options: Partial<DraftState> = {}): DraftState {
  let initialSteps: IStep[] = [
    { id: 0, type: 'ban', side: 'blue', place: 0, pending: true, championId: null },
    { id: 1, type: 'ban', side: 'red', place: 0, pending: false, championId: null },
    { id: 2, type: 'ban', side: 'blue', place: 1, pending: false, championId: null },
    { id: 3, type: 'ban', side: 'red', place: 1, pending: false, championId: null },
    { id: 4, type: 'ban', side: 'blue', place: 2, pending: false, championId: null },
    { id: 5, type: 'ban', side: 'red', place: 2, pending: false, championId: null },
    { id: 6, type: 'pick', side: 'blue', place: 0, pending: false, championId: null },
    { id: 7, type: 'pick', side: 'red', place: 0, pending: false, championId: null },
    { id: 8, type: 'pick', side: 'red', place: 1, pending: false, championId: null },
    { id: 9, type: 'pick', side: 'blue', place: 1, pending: false, championId: null },
    { id: 10, type: 'pick', side: 'blue', place: 2, pending: false, championId: null },
    { id: 11, type: 'pick', side: 'red', place: 2, pending: false, championId: null },
    { id: 12, type: 'ban', side: 'red', place: 3, pending: false, championId: null },
    { id: 13, type: 'ban', side: 'blue', place: 3, pending: false, championId: null },
    { id: 14, type: 'ban', side: 'red', place: 4, pending: false, championId: null },
    { id: 15, type: 'ban', side: 'blue', place: 4, pending: false, championId: null },
    { id: 16, type: 'pick', side: 'red', place: 3, pending: false, championId: null },
    { id: 17, type: 'pick', side: 'blue', place: 3, pending: false, championId: null },
    { id: 18, type: 'pick', side: 'blue', place: 4, pending: false, championId: null },
    { id: 19, type: 'pick', side: 'red', place: 4, pending: false, championId: null },
  ];

  return {
    roomId: options.roomId ?? 'local',
    currentStepId: initialSteps[0].id,
    currentSide: initialSteps[0].side,
    countdown: 30,
    steps: initialSteps,
    isFinished: false,
    teams: {
      blue: { name: options.teams?.blue?.name ?? 'Blue', ready: false } as ITeam,
      red: { name: options.teams?.red?.name ?? 'Red', ready: false } as ITeam,
    },
    events: [],
    eventSeq: 0,
  };
}

// --- In-room event model ---

export type EventSource = 'client' | 'server';

export type EventType =
  | 'CLIENT/READY'
  | 'CLIENT/SELECT'
  | 'CLIENT/CONFIRM'
  | 'CLIENT/SET_TEAM_NAME'
  | 'CONFIRM';

export interface BaseEvent {
  seq: number;
  at: string; // ISO date string
  source: EventSource;
  type: EventType;
  // Countdown remaining (in seconds) at the moment the event was produced
  countdownAt: number;
}

export interface ReadyEvent extends BaseEvent {
  type: 'CLIENT/READY';
  payload: { side: UserSide };
}

export interface SelectEvent extends BaseEvent {
  type: 'CLIENT/SELECT';
  payload: { side: UserSide; action: DraftType; championId: number | null };
}

export interface ConfirmEvent extends BaseEvent {
  type: 'CLIENT/CONFIRM';
  payload: { side: UserSide; action: DraftType; championId: number | null };
}

export interface AutoConfirmEvent extends BaseEvent {
  type: 'CONFIRM';
  payload: { side: UserSide; action: DraftType; championId: number | null; reason: 'timeout' };
}

export interface SetTeamNameEvent extends BaseEvent {
  type: 'CLIENT/SET_TEAM_NAME';
  payload: { side: UserSide; name: string };
}

export type DraftEvent =
  | ReadyEvent
  | SelectEvent
  | ConfirmEvent
  | AutoConfirmEvent
  | SetTeamNameEvent;
