export interface IPostMessage {
  type: string;
  roomId?: string;
  payload?: any;
  // Client-side timestamp in milliseconds when the action was created
  clientAtMs?: number;
}

/**
 * Centralized socket message and event type strings.
 * Keep all CLIENT/SERVER message types and event types here to avoid string duplication.
 */
export const MESSAGE_TYPES = {
  CLIENT: {
    JOIN: 'CLIENT/JOIN',
    PING: 'CLIENT/PING',
    READY: 'CLIENT/READY',
    SELECT: 'CLIENT/SELECT',
    CONFIRM: 'CLIENT/CONFIRM',
    SET_TEAM_NAME: 'CLIENT/SET_TEAM_NAME',
  },
  SERVER: {
    STATE: 'SERVER/STATE',
    TICK: 'SERVER/TICK',
    AUTO_CONFIRM: 'SERVER/AUTO_CONFIRM',
    PONG: 'SERVER/PONG',
    READY: 'SERVER/READY',
    SELECT: 'SERVER/SELECT',
    CONFIRM: 'SERVER/CONFIRM',
    SET_TEAM_NAME: 'SERVER/SET_TEAM_NAME',
  },
} as const;

export const EVENT_TYPES = {
  CLIENT: {
    READY: 'CLIENT/READY',
    SELECT: 'CLIENT/SELECT',
    CONFIRM: 'CLIENT/CONFIRM',
    SET_TEAM_NAME: 'CLIENT/SET_TEAM_NAME',
  },
  SERVER: {
    CONFIRM: 'CONFIRM',
  },
} as const;
