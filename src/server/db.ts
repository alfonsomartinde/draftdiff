import mysql from 'mysql2/promise';
import { DraftState } from '@models/draft';
import { Server } from 'socket.io';

type Queryable = {
  query: (sql: string, values?: any[]) => Promise<[any, any]>;
};

function createPool() {
  const url = process.env['DATABASE_URL'];
  if (url && url.trim().length > 0) {
    return mysql.createPool(url);
  }
  return mysql.createPool({
    host: process.env['DATABASE_HOST'] || process.env['DB_HOST'] || '127.0.0.1',
    port: Number(process.env['DATABASE_PORT'] ?? process.env['DB_PORT'] ?? 3306),
    user: process.env['DATABASE_USER'] || process.env['DB_USER'] || 'root',
    password: process.env['DATABASE_PASSWORD'] || process.env['DB_PASSWORD'] || '',
    database: process.env['DATABASE_NAME'] || process.env['DB_NAME'] || 'drafter',
    waitForConnections: true,
    connectionLimit: 10,
  });
}

export class DatabaseService {
  private static _instance: DatabaseService | null = null;
  private readonly pool: mysql.Pool;

  private constructor() {
    this.pool = createPool();
  }

  static get instance(): DatabaseService {
    this._instance ??= new DatabaseService();
    return this._instance;
  }

  async getConnection() {
    return this.pool.getConnection();
  }

  /**
   * Performs a simple connectivity check and logs useful error metadata.
   */
  async checkConnectivity(): Promise<{ ok: true } | { ok: false; error: Record<string, any> }> {
    try {
      const conn = await this.getConnection();
      try {
        await conn.query('SELECT 1');
      } finally {
        conn.release();
      }
      console.log('[DB] Connectivity OK');
      return { ok: true } as const;
    } catch (e: any) {
      const meta: Record<string, any> = {
        code: e?.code,
        errno: e?.errno,
        address: e?.address,
        port: e?.port,
        fatal: e?.fatal,
        message: e?.message,
      };
      console.error('[DB] Connectivity FAILED', meta);
      return { ok: false, error: meta } as const;
    }
  }

  private async checkRoomExistsInternal(dbLike: Queryable, id: string): Promise<boolean> {
    try {
      const [rows] = await dbLike.query('SELECT 1 FROM rooms WHERE id=? LIMIT 1', [id]);
      return Array.isArray(rows) && (rows as any).length > 0;
    } catch (err) {
      console.error('[API] checkRoomExists failed:', err);
      throw err;
    }
  }

  async roomExists(id: string): Promise<boolean> {
    const conn = await this.getConnection();
    try {
      return this.checkRoomExistsInternal(conn as unknown as Queryable, id);
    } finally {
      conn.release();
    }
  }

  async insertRoomWithState(
    roomId: string,
    blueName: string,
    redName: string,
    state: DraftState,
  ): Promise<void> {
    const conn = await this.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'INSERT INTO rooms (id, blue_name, red_name, status, state) VALUES (?, ?, ?, ?, ?)',
        [roomId, blueName || 'Blue', redName || 'Red', 'active', JSON.stringify(state)],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error(
        '[API] INSERT INTO rooms failed:',
        (err as any)?.sqlMessage || (err as any)?.message || err,
      );
      throw err;
    } finally {
      conn.release();
    }
  }

  async insertRoomIfMissing(
    conn: mysql.PoolConnection,
    roomId: string,
    state: DraftState,
  ): Promise<void> {
    const exists = await this.checkRoomExistsInternal(conn as unknown as Queryable, roomId);
    if (exists) return;

    const blueName = state.teams?.blue?.name ?? 'Blue';
    const redName = state.teams?.red?.name ?? 'Red';
    await conn.query(
      'INSERT INTO rooms (id, blue_name, red_name, status, state) VALUES (?,?,?,?,?)',
      [roomId, blueName, redName, 'active', JSON.stringify(state)],
    );
  }

  async updateRoomState(
    roomId: string,
    state: DraftState,
    io?: Server,
    externalConn?: mysql.PoolConnection,
  ): Promise<void> {
    if (!roomId) throw new Error('UPDATE ROOM STATE: roomId is required');
    if (!state) throw new Error('UPDATE ROOM STATE: state is required');

    let conn = externalConn;
    let createdConn = false;
    if (!conn) {
      conn = await this.getConnection();
      createdConn = true;
    }

    try {
      const stateStr = JSON.stringify(state);
      await conn.beginTransaction();
      await conn.query('UPDATE rooms SET state=? WHERE id=?', [stateStr, roomId]);
      await conn.commit();
      if (io) {
        io.to(roomId).emit('message', { type: 'SERVER/STATE', payload: { state } });
      }
    } catch (err) {
      try {
        await conn.rollback();
      } catch {}
      console.error('[API] updateRoomState failed:', err);
      throw err;
    } finally {
      if (createdConn && conn) {
        try {
          conn.release();
        } catch {}
      }
    }
  }

  async saveEvent(
    roomId: string,
    started: boolean,
    io: Server | undefined,
    payload: { type: string; data: any; state?: DraftState },
    stateForEnsure?: DraftState,
  ) {
    if (!started) return;
    const type = payload.type;
    if (type === 'PING' || type === 'JOIN') return;

    const conn = await this.getConnection();
    try {
      await conn.beginTransaction();
      if (!(await this.checkRoomExistsInternal(conn as unknown as Queryable, roomId))) {
        if (!stateForEnsure) throw new Error('room_not_found');
        await this.insertRoomIfMissing(conn, roomId, stateForEnsure);
      }
      const [rows] = await conn.query(
        'SELECT IFNULL(MAX(seq),0)+1 AS next FROM events WHERE room_id=?',
        [roomId],
      );
      const seq = Number((rows as any)[0].next);
      await conn.query('INSERT INTO events (room_id, seq, type, payload) VALUES (?,?,?,?)', [
        roomId,
        seq,
        type,
        JSON.stringify(payload.data),
      ]);
      await conn.commit();
      return seq;
    } catch (err) {
      await conn.rollback();
      console.error('[API] saveEvent failed:', err);
      throw err;
    } finally {
      conn.release();
    }
  }

  async fetchRoomEvents(roomId: string) {
    const conn = await this.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT seq, type, payload, created_at FROM events WHERE room_id=? ORDER BY seq ASC',
        [roomId],
      );
      return rows as any[];
    } finally {
      conn.release();
    }
  }
}

export const databaseService = DatabaseService.instance;
