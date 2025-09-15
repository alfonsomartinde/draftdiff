import { Injectable } from '@angular/core';
import { DraftType, UserSide } from '@models/draft';
import { IPostMessage } from '@models/worker';
import { io, Socket } from 'socket.io-client';
import { environment } from '@/environments/environment';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkerClientService {
  /**
   * The worker
   */
  private socket?: Socket;

  readonly incoming$ = new Subject<IPostMessage | null>();

  /**
   * Post a message to the worker
   */
  private post(message: IPostMessage): void {
    try {
      console.log('CLIENT: POST', message);
      this.socket?.emit('message', message);
    } catch (e) {
      console.error('CLIENT: ERROR POSTING MESSAGE', e);
    }
  }

  /**
   * Get the worker URL
   */
  private getSocketUrl(): string {
    return environment.socketUrl;
  }

  /**
   * Connect to the worker
   */
  connect({ roomId }: { roomId: string }): void {
    if (this.socket) return;
    const url = this.getSocketUrl();
    this.socket = io(url, { transports: ['websocket', 'polling'], withCredentials: false });
    this.socket.on('connect_error', (e) => console.error('[socket] error', e));
    this.socket.on('message', (msg: any) => this.onSocketMessage(msg));
    this.join({ roomId });
    setTimeout(() => this.ping({ roomId }), 0);
  }

  /**
   * Disconnect from the worker and cleanup
   */
  disconnect(): void {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } catch {}
    this.socket = undefined;
  }

  /**
   * Set the worker
   */
  // no-op, legacy
  private setWorker(_workerUrl: string): void {
    // Legacy method intentionally left blank
  }

  /**
   * On message
   */
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

    if (msgType === 'SERVER/PONG') {
      console.log('CLIENT: PONG RECEIVED');
      return;
    }

    if (
      msgType === 'SERVER/STATE' ||
      msgType === 'SERVER/TICK' ||
      msgType === 'SERVER/READY' ||
      msgType === 'SERVER/SELECT' ||
      msgType === 'SERVER/CONFIRM' ||
      msgType === 'SERVER/SET_TEAM_NAME'
    ) {
      this.incoming$.next(msg as IPostMessage);
    } else {
      console.warn('CLIENT: UNKNOWN MESSAGE TYPE RECEIVED', msg);
    }
  };

  /**
   * Join a room
   * @param roomId - The room ID
   */
  join({ roomId }: { roomId: string }): void {
    this.post({
      type: 'CLIENT/JOIN',
      roomId,
    });
  }

  /**
   * Ping the worker
   * @param roomId - The room ID
   */
  ping({ roomId }: { roomId: string }): void {
    this.post({
      type: 'CLIENT/PING',
      roomId,
    });
  }

  /**
   * Ready a side
   * @param roomId - The room ID
   * @param side - The side to ready
   */
  ready({ roomId, side }: { roomId: string; side: UserSide }): void {
    this.post({
      type: 'CLIENT/READY',
      roomId,
      payload: { side },
    });
  }

  /**
   * Confirm an champion selection
   * @param roomId - The room ID
   * @param side - The side to confirm
   * @param action - The action to confirm
   */
  confirm({ roomId, side, action }: { roomId: string; side: UserSide; action: DraftType }): void {
    this.post({
      type: 'CLIENT/CONFIRM',
      roomId,
      payload: { side, action },
    });
  }

  /**
   * Select a champion
   * @param roomId - The room ID
   * @param side - The side to select a champion
   * @param action - The action to select a champion
   * @param championId - The champion ID to select
   */
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
      type: 'CLIENT/SELECT',
      roomId,
      payload: { side, action, championId },
    });
  }

  /**
   * Set the name of a team
   * @param roomId - The room ID
   * @param side - The side to set the name of
   * @param name - The name to set
   */
  setTeamName({ roomId, side, name }: { roomId: string; side: UserSide; name: string }): void {
    this.post({
      type: 'CLIENT/SET_TEAM_NAME',
      roomId,
      payload: { side, name },
    });
  }
}
