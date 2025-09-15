import 'dotenv/config';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import mysql from 'mysql2/promise';
import { createInitialDraftState, DraftState } from '@models/draft';
import { IPostMessage } from '@models/worker';
import { databaseService } from './server/db';
import { eventsService } from './server/events';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();
const DEFAULT_DEADLINE_SECONDS = 30; // 30 seconds

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
  cors: {
    origin: (() => {
      const raw = process.env['CORS_ORIGIN'] ?? '';
      const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return list.length ? list : ['http://localhost:4200'];
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
  socket.on('message', async (msg: IPostMessage) => {
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    const type: string = msg.type;
    const payload: any = msg.payload ?? {};
    const roomId: string = String(msg.roomId ?? 'local').trim();

    if (!roomId || roomId === 'local') return;

    const room = eventsService.getRoom(roomId);

    if (!type) return;
    if (!room.state) return;

    const base = room.state;
    const stepIdx = base.currentStepId;
    const step = base.steps[stepIdx];
    // noop: preserved for potential deep copy in future

    if (!step) return;

    switch (type) {
      case 'CLIENT/JOIN': {
        socket.join(roomId);
        eventsService.handleJoin(io, roomId);
        break;
      }

      // if type is PING
      case 'CLIENT/PING': {
        io.to(roomId).emit('message', {
          type: 'SERVER/PONG',
        });
        break;
      }

      // if type is READY, payload: { side }
      case 'CLIENT/READY': {
        console.log('CLIENT/READY received', payload);
        await eventsService.handleReady(io, roomId, room, payload);
        break;
      }

      // if type is SELECT, payload: { side, action, championId }
      case 'CLIENT/SELECT': {
        console.log('CLIENT/SELECT received', payload);
        await eventsService.handleSelect(io, roomId, room, payload);
        break;
      }

      // if type is CONFIRM, payload: { side, action }
      case 'CLIENT/CONFIRM': {
        console.log('CLIENT/CONFIRM received', payload);
        await eventsService.handleConfirm(io, roomId, room, payload);
        break;
      }

      // if type is SET_TEAM_NAME, payload: { side, name }
      case 'CLIENT/SET_TEAM_NAME': {
        console.log('CLIENT/SET_TEAM_NAME received', payload);
        await eventsService.handleSetTeamName(io, roomId, room, payload);
        break;
      }
      default: {
        io.to(roomId).emit('message', {
          type: 'SERVER/' + type,
          payload: {
            state: room.state,
            ...payload,
          },
        });
      }
    }
  });
});

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 4000);
  server.listen(port, () => {
    console.log(`Node SSR + Socket.io listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
