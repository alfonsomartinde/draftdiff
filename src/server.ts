import 'dotenv/config';
import express from 'express';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import mysql from 'mysql2/promise';
import { createInitialDraftState, DraftState } from '@models/draft';
import { IPostMessage } from '@models/worker';
import { databaseService } from './server/db';
import { eventsService } from './server/events';
import { existsSync } from 'node:fs';

const browserDistFolder = join(import.meta.dirname, '../browser');
const defaultSsr = process.env['NODE_ENV'] === 'production' ? 'false' : 'true';
const SSR_ENABLED = String(process.env['SSR'] ?? defaultSsr) === 'true';

const app = express();
let angularApp: any = null;
let writeResponseToNodeResponseFn: any = null;
const port = Number(process.env['PORT'] ?? 4000);

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
  }),
);

app.use(express.json());

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/health/db', async (_req, res) => {
  try {
    const summary = databaseService.describeConfig?.() ?? {};
    const result = await databaseService.checkConnectivity();
    res.json({ ok: (result as any).ok === true, summary, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Crear room con estado inicial
// Crea la sala persistiendo solo el registro de rooms
// Nota: no guardamos eventos hasta que ambos READY y el timer inicie
app.post('/api/rooms', async (req, res) => {
  try {
    let roomId: string = generateRoomId();
    const blueName: string = String(req.body?.blueName ?? 'Blue').trim();
    const redName: string = String(req.body?.redName ?? 'Red').trim();

    // Make sure the room id is unique
    let tries = 0;
    while (await databaseService.roomExists(roomId)) {
      roomId = generateRoomId();
      if (++tries > 5) return res.status(409).json({ error: 'room_id_collision' });
    }

    // Construir estado inicial antes de persistir
    const initialState: DraftState = createInitialDraftState({
      roomId,
      teams: {
        blue: {
          name: blueName,
          ready: false,
        },
        red: {
          name: redName,
          ready: false,
        },
      },
    });

    // Persistir sala con estado inicial en una única transacción
    await databaseService.insertRoomWithState(roomId, blueName, redName, initialState);

    // Inicializa runtime in-memory
    const room = eventsService.getRoom(roomId);
    room.state = initialState;
    room.started = false;

    return res.status(201).json(room.state);
  } catch (err: any) {
    console.error('[API] /api/rooms failed:', err?.sqlMessage || err?.message || err);
    return res
      .status(500)
      .json({ error: 'room_create_failed', message: err?.sqlMessage || err?.message || 'unknown' });
  }
});

// --- Socket.io + MySQL ---
const server = createServer(app);
const io = new Server(server, {
  transports: ['websocket'],
  perMessageDeflate: false,
  maxHttpBufferSize: 100000,
  pingInterval: 20000,
  pingTimeout: 20000,
  cors: {
    origin: (() => {
      const raw = process.env['CORS_ORIGIN'] ?? '';
      const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return list.length ? list : [`http://localhost:${port}`];
    })(),
  },
});

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

// Pool y runtime movidos a ./server/db y ./server/events

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Helpers movidos a módulos

// Lógica movida a módulos

// Lógica de tiempo y handlers de eventos se movieron a ./server/events

/**
 * Socket.io connection
 */
io.on('connection', (socket) => {
  socket.on('message', (msg: IPostMessage) => processSocketMessage(io, socket, msg));
});

function ensureStepExists(room: any): boolean {
  if (!room?.state) return false;
  const base = room.state as DraftState;
  const step = base.steps[base.currentStepId];
  return !!step;
}

async function hydrateStateIfMissing(roomId: string, room: any): Promise<void> {
  if (room?.state) return;
  try {
    const conn = await databaseService.getConnection();
    try {
      const [rows] = await conn.query('SELECT state FROM rooms WHERE id=? LIMIT 1', [roomId]);
      const row = Array.isArray(rows) ? (rows as any)[0] : undefined;
      const raw = row?.state;
      if (raw != null) {
        let parsed: any;
        if (typeof raw === 'string') parsed = JSON.parse(raw);
        else if (Buffer.isBuffer(raw)) parsed = JSON.parse(raw.toString('utf8'));
        else if (typeof raw === 'object') parsed = raw; // already parsed by driver
        if (parsed) room.state = parsed as DraftState;
      }
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('[socket] hydrate state failed', e);
  }
}

type MessageContext = {
  io: Server;
  socket: any;
  roomId: string;
  room: any;
  payload: any;
  type: string;
};

const messageHandlers: Record<string, (ctx: MessageContext) => Promise<void> | void> = {
  'CLIENT/JOIN': async ({ io, socket, roomId, room }) => {
    socket.join(roomId);
    await hydrateStateIfMissing(roomId, room);
    eventsService.handleJoin(io, roomId);
  },
  'CLIENT/PING': ({ io, socket, roomId }) => {
    socket.emit('message', { type: 'SERVER/PONG' });
    io.to(roomId).emit('message', { type: 'SERVER/PONG' });
  },
  'CLIENT/READY': async ({ io, roomId, room, payload }) => {
    if (!ensureStepExists(room)) return;
    console.log('CLIENT/READY received', payload);
    await eventsService.handleReady(io, roomId, room, payload);
  },
  'CLIENT/SELECT': async ({ io, roomId, room, payload }) => {
    if (!ensureStepExists(room)) return;
    console.log('CLIENT/SELECT received', payload);
    await eventsService.handleSelect(io, roomId, room, payload);
  },
  'CLIENT/CONFIRM': async ({ io, roomId, room, payload }) => {
    if (!ensureStepExists(room)) return;
    console.log('CLIENT/CONFIRM received', payload);
    await eventsService.handleConfirm(io, roomId, room, payload);
  },
  'CLIENT/SET_TEAM_NAME': async ({ io, roomId, room, payload }) => {
    if (!ensureStepExists(room)) return;
    console.log('CLIENT/SET_TEAM_NAME received', payload);
    await eventsService.handleSetTeamName(io, roomId, room, payload);
  },
};

function emitDefault(io: Server, roomId: string, payload: any, type: string, state: DraftState) {
  io.to(roomId).emit('message', {
    type: 'SERVER/' + type,
    payload: {
      state,
      ...payload,
    },
  });
}

async function processSocketMessage(io: Server, socket: any, msg: IPostMessage): Promise<void> {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
  const type: string = msg.type;
  const payload: any = msg.payload ?? {};
  const roomId: string = String(msg.roomId ?? 'local').trim();
  if (!roomId || roomId === 'local') return;
  if (!type) return;

  const room = eventsService.getRoom(roomId);
  const handler = messageHandlers[type];
  if (handler) {
    await handler({ io, socket, roomId, room, payload, type });
    return;
  }

  emitDefault(io, roomId, payload, type, room.state as DraftState);
}

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use(async (req, res, next) => {
  try {
    if (!SSR_ENABLED) {
      const csrIndex = existsSync(join(browserDistFolder, 'index.csr.html'))
        ? 'index.csr.html'
        : 'index.html';
      return res.sendFile(join(browserDistFolder, csrIndex));
    }
    if (!angularApp) {
      const ssr = await import('@angular/ssr/node');
      angularApp = new ssr.AngularNodeAppEngine();
      writeResponseToNodeResponseFn = ssr.writeResponseToNodeResponse;
    }
    const response = await angularApp.handle(req);
    return response ? writeResponseToNodeResponseFn(response, res) : next();
  } catch (e) {
    return next(e);
  }
});

// Start server unconditionally
server.listen(port, async () => {
  console.log(`Node ${SSR_ENABLED ? 'SSR' : 'CSR'} + Socket.io listening on http://localhost:${port}`);
  try {
    console.log('[DB] Config summary', databaseService.describeConfig());
    const res = await databaseService.checkConnectivity();
    if ((res as any).ok) {
      console.log('[DB] Ready');
    } else {
      console.error('[DB] Not reachable', (res as any).error);
    }
  } catch (e) {
    console.error('[DB] Connectivity check threw', e);
  }
});

/**
 * Optional request handler for Angular CLI or other integrations
 */
export const reqHandler = app as any;
