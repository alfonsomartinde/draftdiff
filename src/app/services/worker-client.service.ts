import { Injectable } from '@angular/core';
import { DraftType, UserSide } from '@models/draft';
import { IPostMessage, MESSAGE_TYPES } from '@models/worker';
import { io, Socket } from 'socket.io-client';
import { environment } from '@/environments/environment';
import { Subject } from 'rxjs';

/**
 * WorkerClientService
 *
 * Purpose: Single place to manage Socket.io client connection and message I/O.
 * Why created: Encapsulate transport concerns away from components/effects.
 * Responsibilities:
 * - Connect/disconnect socket
 * - Send typed client messages (JOIN/READY/SELECT/CONFIRM/...)
 * - Expose incoming server messages via a Subject
 *
 * Example:
 *   client.ready({ roomId, side: 'blue' }) → emits CLIENT/READY with clientAtMs.
 */
@Injectable({ providedIn: 'root' })
export class WorkerClientService {
  /** Socket.io client instance (lazy). */
  private socket?: Socket;

  readonly incoming$ = new Subject<IPostMessage | null>();

  /** Post a typed message to the server worker through Socket.io. */
  private post(message: IPostMessage): void {
    try {
      console.log('CLIENT: POST', message);
      this.socket?.emit('message', message);
    } catch (e) {
      console.error('CLIENT: ERROR POSTING MESSAGE', e);
    }
  }

  /** Get the worker Socket.io URL from environment. */
  private getSocketUrl(): string {
    return environment.socketUrl;
  }

  /** Connect to the server and join the provided room id. */
  connect({ roomId }: { roomId: string }): void {
    if (this.socket) return;
    const url = this.getSocketUrl();
    this.socket = io(url, { transports: ['websocket', 'polling'], withCredentials: false });
    this.socket.on('connect_error', (e) => console.error('[socket] error', e));
    this.socket.on('message', (msg: any) => this.onSocketMessage(msg));
    this.join({ roomId });
    setTimeout(() => this.ping({ roomId }), 0);
  }

  /** Disconnect and cleanup listeners. */
  disconnect(): void {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } catch {}
    this.socket = undefined;
  }

  /** Handle incoming messages and fan them out through incoming$. */
  private readonly onSocketMessage = (msg: any): void => {
    if (!msg) {
      console.warn('CLIENT: EMPTY MESSAGE RECEIVED');
      return;
    }
    const msgType = msg.type;

    if (!msgType) {
      console.warn('CLIENT: MISSING MESSAGE TYPE RECEIVED', msg);
      return;
    }

    if (msgType === MESSAGE_TYPES.SERVER.PONG) {
      console.log('CLIENT: PONG RECEIVED');
      return;
    }

    const allowed = new Set<string>([
      MESSAGE_TYPES.SERVER.STATE,
      MESSAGE_TYPES.SERVER.TICK,
      MESSAGE_TYPES.SERVER.READY,
      MESSAGE_TYPES.SERVER.SELECT,
      MESSAGE_TYPES.SERVER.CONFIRM,
      MESSAGE_TYPES.SERVER.SET_TEAM_NAME,
    ]);
    if (allowed.has(msgType)) {
      this.incoming$.next(msg as IPostMessage);
    } else {
      console.warn('CLIENT: UNKNOWN MESSAGE TYPE RECEIVED', msg);
    }
  };

  /** Join a room so the server starts sending state updates. */
  join({ roomId }: { roomId: string }): void {
    this.post({
      type: MESSAGE_TYPES.CLIENT.JOIN,
      roomId,
      clientAtMs: Date.now(),
    });
  }

  /** Send a ping for diagnostics (server replies with PONG). */
  ping({ roomId }: { roomId: string }): void {
    this.post({
      type: MESSAGE_TYPES.CLIENT.PING,
      roomId,
      clientAtMs: Date.now(),
    });
  }

  /** Mark a side as ready (second READY starts the timer). */
  ready({ roomId, side }: { roomId: string; side: UserSide }): void {
    this.post({
      type: MESSAGE_TYPES.CLIENT.READY,
      roomId,
      payload: { side },
      clientAtMs: Date.now(),
    });
  }

  /** Confirm the current step (ends draft when last step). */
  confirm({ roomId, side, action }: { roomId: string; side: UserSide; action: DraftType }): void {
    this.post({
      type: MESSAGE_TYPES.CLIENT.CONFIRM,
      roomId,
      payload: { side, action },
      clientAtMs: Date.now(),
    });
  }

  /** Select a champion for the current step. */
  selectChampion({
    roomId,
    side,
    action,
    championId,
  }: {
    roomId: string;
    side: UserSide;
    action: DraftType;
    championId: number;
  }): void {
    this.post({
      type: MESSAGE_TYPES.CLIENT.SELECT,
      roomId,
      payload: { side, action, championId },
      clientAtMs: Date.now(),
    });
  }

  /** Update a team name. */
  setTeamName({ roomId, side, name }: { roomId: string; side: UserSide; name: string }): void {
    this.post({
      type: MESSAGE_TYPES.CLIENT.SET_TEAM_NAME,
      roomId,
      payload: { side, name },
      clientAtMs: Date.now(),
    });
  }
}
