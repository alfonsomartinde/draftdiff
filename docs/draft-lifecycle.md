### Draft lifecycle: estado, base de datos y eventos

Este documento describe cómo varía el estado de la aplicación durante un draft, qué operaciones se realizan en base de datos y qué eventos se emiten por Socket.io en cada fase.

#### Estado en memoria (runtime)

- **RoomRuntime** por `roomId`:
  - `state: DraftState | null`
  - `timer: NodeJS.Timer | null`
  - `deadlineMs: number`
  - `started: boolean`
- Se accede vía `eventsService.getRoom(roomId)`.

#### Eventos de Socket.io

- Cliente → Servidor (canal `message` con `type`):
  - `CLIENT/JOIN` { roomId }
  - `CLIENT/PING`
  - `CLIENT/READY` { side }
  - `CLIENT/SELECT` { side, action, championId }
  - `CLIENT/CONFIRM` { side, action }
  - `CLIENT/SET_TEAM_NAME` { side, name }
- Servidor → Cliente:
  - `SERVER/STATE` { state } (push del estado persistido/actual)
  - `SERVER/TICK` { state } (cada segundo mientras corre el temporizador)
  - `SERVER/PONG`
  - `SERVER/{CLIENT/*}` eco por defecto en rutas no manejadas específicamente

#### Persistencia

- Tabla `rooms` (o almacenamiento equivalente):
  - `id`, `blue_name`, `red_name`, `status`, `state` (JSON del `DraftState`)
  - Dentro de `state` se guarda TODO: pasos, equipos, `events` (historial en memoria), `eventSeq`, etc.
  - Opcional: persistir también `deadlineMs` y `started` (excluye `timer`) para recuperación tras caída.

#### Reglas de guardado de eventos (in-room)

- Los eventos de dominio se añaden a `state.events` (no hay tabla de eventos en DB).
- Se registran desde que el draft está en marcha (ventana de replay): a partir del READY que enciende el timer y hasta el final.
- Eventos registrados: `CLIENT/READY`, `CLIENT/SELECT`, `CLIENT/CONFIRM`, `CLIENT/SET_TEAM_NAME`, `CONFIRM` (auto-confirm del servidor).
- No se registran: `PING`, `JOIN`, `SERVER/TICK`.
- Cada evento incluye:
  - `seq` (secuencia por room), `at` (ISO), `source` (`client|server`), `type`, `payload`, `countdownAt` (segundos restantes en el momento del evento).

---

## Flujo por fases

### 1) Creación de sala (Lobby)

1. Cliente REST: `POST /api/rooms` con `blueName`, `redName`.
2. Servidor:
   - Genera `roomId` único (`databaseService.roomExists`).
   - Construye `initialState: DraftState` (ambos equipos `ready: false`).
   - Persiste `rooms` con `insertRoomWithState(roomId, blueName, redName, initialState)`.
   - Inicializa runtime: `eventsService.getRoom(roomId).state = initialState; started = false`.
3. Respuesta: `201` con `state` inicial.
4. Eventos socket: ninguno automático en esta fase.

DB:
- INSERT en `rooms` con `state = initialState`.
Eventos:
- No se guarda nada en `events` aún (no ha iniciado el draft).

### 2) Lobby: jugadores listos (READY)

Cliente envía `CLIENT/READY` con el `side`.

Servidor (handleReady):
- Valida y marca `teams[side].ready = true`.
- Añade evento a `state.events` con `{ type: 'CLIENT/READY', payload: { side }, countdownAt }`.
- Persiste: `updateRoomState(roomId, state, io)` → también emite `SERVER/STATE`.
- Si ambos equipos están ready, `eventsService.startTimer(...)`:
  - `started = true`, `deadlineMs = now + DEFAULT_DEADLINE`, setInterval de `tick` (1s).

DB:
- UPDATE `rooms.state` (con `events` incluidos).
Eventos servidor → cliente:
- `SERVER/STATE` tras persistir.
- `SERVER/TICK` cada segundo mientras corre el timer.

### 3) Selección (SELECT)

Cliente envía `CLIENT/SELECT` con `{ side, action, championId }`.

Servidor (handleSelect):
- Valida que coincide con el paso actual y aplica `championId`.
- Añade evento a `state.events` con `{ type: 'CLIENT/SELECT', payload: { side, action, championId }, countdownAt }`.
- Persiste: `updateRoomState(roomId, state, io)` → emite `SERVER/STATE`.

DB:
- UPDATE `rooms.state` (con `events`).
Eventos servidor → cliente:
- `SERVER/STATE` tras persistir.

### 4) Confirmación (CONFIRM)

Puede ser:
- Manual: Cliente envía `CLIENT/CONFIRM`.
- Automática: `tick` dispara auto-confirm al expirar `deadlineMs`.

Servidor (handleConfirm o autoConfirm):
- Detiene el timer actual.
- Marca el paso actual como `pending: false`.
- Avanza `currentStepId` si no es el último; marca `pending: true` el siguiente; resetea `countdown` a `DEFAULT_DEADLINE_SECONDS`.
- Si es último paso: `isFinished = true`, `countdown = 0`, `resetTimer`.
- Añade evento a `state.events`:
  - Manual: `{ type: 'CLIENT/CONFIRM', payload: { side, action, championId }, countdownAt }`.
  - Automático: `{ type: 'CONFIRM', payload: { side, action, championId, reason: 'timeout' }, countdownAt: 0 }`.
- Persiste: `updateRoomState(roomId, state, io)` → emite `SERVER/STATE`.
- Si no es último paso: reinicia timer para el siguiente paso.

DB:
- UPDATE `rooms.state` (con `events`).
Eventos servidor → cliente:
- `SERVER/STATE` tras persistir.
- `SERVER/TICK` continúa en el siguiente paso (si no terminó).

### 5) Cambio de nombre de equipo (SET_TEAM_NAME)

Cliente envía `CLIENT/SET_TEAM_NAME` con `{ side, name }`.

Servidor (handleSetTeamName):
- Normaliza y aplica el nombre.
- Añade evento a `state.events` con `{ type: 'CLIENT/SET_TEAM_NAME', payload: { side, name }, countdownAt }`.
- Persiste: `updateRoomState(roomId, state, io)` → emite `SERVER/STATE`.

DB:
- UPDATE `rooms.state` (con `events`).
Eventos servidor → cliente:
- `SERVER/STATE` tras persistir.

### 6) Join / Ping

- `CLIENT/JOIN`: el servidor añade el socket a la sala y emite `SERVER/STATE` con el estado actual.
- `CLIENT/PING`: el servidor responde `SERVER/PONG`.

---

## Línea de tiempo típica

1. REST `POST /api/rooms` → INSERT `rooms` (estado inicial) → cliente navega al lobby.
2. `CLIENT/READY` (azul) → añadir a `state.events` → UPDATE `rooms.state` → `SERVER/STATE`.
3. `CLIENT/READY` (rojo) → añadir a `state.events` → UPDATE `rooms.state` → `SERVER/STATE` → start timer → `SERVER/TICK` cada 1s → guardado de eventos habilitado.
4. `CLIENT/SELECT` → añadir a `state.events` → UPDATE `rooms.state` → `SERVER/STATE`.
5. `CLIENT/CONFIRM` (o auto-confirm al expirar) → añadir a `state.events` → UPDATE `rooms.state` → `SERVER/STATE` → reinicio de timer si procede.
6. Repetir 4-5 hasta `isFinished = true` → `resetTimer`.

---

## Paso TICK y reglas de countdown

- El servidor emite `SERVER/TICK` cada 1 segundo mientras `timer` está activo.
- En cada TICK:
  - `countdown = max(0, ceil((deadlineMs - now)/1000))`.
  - Si `countdown` llega a `0`, el servidor confirma el paso (auto-confirm) y:
    - Si NO es el último paso: avanza a siguiente paso, pone `pending=true` al siguiente y resetea `countdown` a `DEFAULT_DEADLINE_SECONDS`.
    - Si es el último: marca `isFinished=true`, pone `countdown=0` y detiene el `timer`.
- Al confirmar manualmente (CLIENT/CONFIRM) se aplica el mismo avance que en auto-confirm.
- Al iniciar un paso nuevo (tras confirmación), `countdown` se reinicia a `DEFAULT_DEADLINE_SECONDS`.
- Cada `updateRoomState` emite `SERVER/STATE`; los TICKs intermedios emiten `SERVER/TICK` sin escribir en DB.

Nota: `SERVER/TICK` no se persiste en la tabla `events` (solo es broadcast en tiempo real).

---

## Consulta del historial de eventos

- Socket: `socket.emit('room:events', { roomId }, (rows) => { /* ... */ })`
- Servidor: maneja `room:events` devolviendo `state.events` del room: `[{ seq, at, source, type, payload, countdownAt }, ...]`.

---

## Consideraciones y límites

- Antes de que el draft inicie (sin ambos READY), no se guardan eventos en la tabla `events`.
- Cada `updateRoomState` emite `SERVER/STATE` a todos los sockets en la sala, garantizando sincronización tras cada persistencia.
- `SERVER/TICK` solo se emite mientras el `timer` está activo; se detiene al terminar el draft o al pausar por confirmación.
- Validaciones en servidor evitan SELECT/CONFIRM fuera de turno o de tipo incorrecto.

---

## Ejemplos de snapshots de estado (DraftState)

A continuación se muestran snapshots JSON ilustrativos del `DraftState` en momentos clave. Estos objetos son los que se guardan dentro de `rooms.state`.

### A) Tras crear la sala (antes de READY)

```json
{
  "roomId": "ABCD1234",
  "currentSide": "blue",
  "currentStepId": 0,
  "countdown": 30,
  "isFinished": false,
  "teams": {
    "blue": { "name": "Blue", "ready": false },
    "red": { "name": "Red", "ready": false }
  },
  "steps": [
    { "id": 0, "type": "ban", "side": "blue", "place": 0, "pending": true,  "championId": null },
    { "id": 1, "type": "ban", "side": "red",  "place": 0, "pending": false, "championId": null },
    { "id": 2, "type": "ban", "side": "blue", "place": 1, "pending": false, "championId": null }
    // ... resto de pasos
  ]
}
```

### B) Un equipo marca READY (timer aún parado si falta el otro)

```json
{
  "roomId": "ABCD1234",
  "currentSide": "blue",
  "currentStepId": 0,
  "countdown": 30,
  "isFinished": false,
  "teams": {
    "blue": { "name": "Blue", "ready": true },
    "red": { "name": "Red", "ready": false }
  },
  "steps": [
    { "id": 0, "type": "ban", "side": "blue", "place": 0, "pending": true,  "championId": null },
    { "id": 1, "type": "ban", "side": "red",  "place": 0, "pending": false, "championId": null }
  ]
}
```

### C) Ambos equipos READY (timer iniciado)

```json
{
  "roomId": "ABCD1234",
  "currentSide": "blue",
  "currentStepId": 0,
  "countdown": 29,
  "isFinished": false,
  "teams": {
    "blue": { "name": "Blue", "ready": true },
    "red": { "name": "Red", "ready": true }
  },
  "steps": [
    { "id": 0, "type": "ban", "side": "blue", "place": 0, "pending": true,  "championId": null },
    { "id": 1, "type": "ban", "side": "red",  "place": 0, "pending": false, "championId": null }
  ]
}
```

### D) Tras un SELECT válido en el paso actual

```json
{
  "roomId": "ABCD1234",
  "currentSide": "blue",
  "currentStepId": 0,
  "countdown": 21,
  "isFinished": false,
  "teams": {
    "blue": { "name": "Blue", "ready": true },
    "red": { "name": "Red", "ready": true }
  },
  "steps": [
    { "id": 0, "type": "ban", "side": "blue", "place": 0, "pending": true,  "championId": 12 },
    { "id": 1, "type": "ban", "side": "red",  "place": 0, "pending": false, "championId": null }
  ]
}
```

### E) Tras CONFIRM (manual o auto)

```json
{
  "roomId": "ABCD1234",
  "currentSide": "red",
  "currentStepId": 1,
  "countdown": 30,
  "isFinished": false,
  "teams": {
    "blue": { "name": "Blue", "ready": true },
    "red": { "name": "Red", "ready": true }
  },
  "steps": [
    { "id": 0, "type": "ban", "side": "blue", "place": 0, "pending": false, "championId": 12 },
    { "id": 1, "type": "ban", "side": "red",  "place": 0, "pending": true,  "championId": null }
  ]
}
```

### F) Draft finalizado

```json
{
  "roomId": "ABCD1234",
  "currentSide": "red",
  "currentStepId": 19,
  "countdown": 0,
  "isFinished": true,
  "teams": {
    "blue": { "name": "Blue", "ready": true },
    "red": { "name": "Red", "ready": true }
  },
  "steps": [
    // ... todos los pasos con pending=false y championId asignado según corresponda
  ]
}
```

---

## Ejemplos de eventos en `room.state.events`

Supone `roomId = "ABCD1234"` y `seq` creciente por sala.

### READY (cuando se enciende el timer)

```json
{
  "seq": 1,
  "at": "2025-09-15T12:00:05.000Z",
  "source": "client",
  "type": "CLIENT/READY",
  "payload": { "side": "red" },
  "countdownAt": 30
}
```

### Tras SELECT válido

```json
{
  "seq": 2,
  "at": "2025-09-15T12:00:15.000Z",
  "source": "client",
  "type": "CLIENT/SELECT",
  "payload": { "side": "blue", "action": "ban", "championId": 12 },
  "countdownAt": 21
}
```

### Tras CONFIRM manual

```json
{
  "seq": 3,
  "at": "2025-09-15T12:00:16.000Z",
  "source": "client",
  "type": "CLIENT/CONFIRM",
  "payload": { "side": "blue", "action": "ban", "championId": 12 },
  "countdownAt": 30
}
```

### Tras CONFIRM automático (por timeout)

```json
{
  "seq": 4,
  "at": "2025-09-15T12:00:30.000Z",
  "source": "server",
  "type": "CONFIRM",
  "payload": { "side": "red", "action": "ban", "championId": null, "reason": "timeout" },
  "countdownAt": 0
}
```

Notas:
- En confirmación automática el `payload` es minimal y `countdownAt = 0`.
- READY que enciende el timer típicamente tiene `countdownAt = DEFAULT_DEADLINE_SECONDS`.


---

## Especificación de la interfaz por fase

A continuación se detalla el comportamiento esperado de la UI en cada estado del flujo.

Terminología:
- "Botón principal": CTA visible en el panel de control (Ready / Confirmar / Finalizado).
- "Grid de campeones": rejilla desde donde se hacen picks/bans.
- "Componente de bans": listado/tiles donde se visualizan bans ya aplicados.

### 1) Antes de READY (ningún equipo listo)

- Botón principal (lado local):
  - Texto: "Ready"
  - Estado: Enabled
  - Acción: emite `CLIENT/READY { side }`
- Grid de campeones: Disabled (no hay timer ni paso activo)
- Campeones de pasos anteriores: N/A
- Componente de bans: Solo visual, sin interacción
- Timer/Countdown: Oculto o mostrado como `30` estático; no decrece

### 2) Un equipo READY (esperando al otro)

- Equipo que ya pulsó Ready:
  - Botón: "Esperando..." (Disabled)
  - Grid: Disabled
- Equipo que falta por Ready (si es el cliente actual):
  - Botón: "Ready" (Enabled)
  - Grid: Disabled
- Componente de bans: Visual, sin interacción
- Timer: Oculto o sin decremento

### 3) Ambos READY, inicio de paso (turno del lado actual)

- Lado en turno (coincide con `state.currentSide` y `steps[currentStepId].pending === true`):
  - Botón: "Confirmar"
  - Estado del botón: Disabled hasta que haya una selección válida (`championId != null`)
  - Grid de campeones: Enabled
    - Campeones ya pickeados o baneados en pasos previos: Disabled + en blanco y negro + tooltip "Unavailable"
    - Campeones disponibles: Enabled, a color, hover permitido
    - Campeón seleccionado actualmente: Highlight (borde/overlay). Se puede cambiar antes de confirmar
  - Acción al pulsar confirmar: emite `CLIENT/CONFIRM { side, action }`
- Lado no en turno:
  - Botón: "Esperando..." (Disabled)
  - Grid: Disabled
- Componente de bans:
  - Muestra los bans ya aplicados
  - El ban del paso actual (si el tipo es ban) se muestra como "en curso" (estado pending) con marca de turno
- Timer: Visible, decrementando por `SERVER/TICK`. Reset a 30 al empezar cada paso

### 4) Durante la selección (antes de confirmar)

- Lado en turno puede cambiar la selección libremente:
  - Grid: Enabled; seleccionar otro campeón reemplaza `championId` local y emite `CLIENT/SELECT { side, action, championId }`
  - Botón Confirmar: Enabled solo si hay `championId`
- Campeones ya usados (pick o ban previos): Disabled + gris + tooltip
- Timer: Decrece; al llegar a 0 el servidor auto-confirma el paso con el `championId` actual (puede ser `null` si no hubo selección)

### 5) Tras confirmar un paso (avance al siguiente)

- UI reacciona a `SERVER/STATE` del siguiente paso:
  - Si no es último paso: cambia `currentStepId`, marca siguiente `pending=true`, reinicia `countdown` a 30
  - Si fue último: `isFinished=true`, `countdown=0`
- Lado en turno del nuevo paso: pasa a estado descrito en la sección 3
- Grid: según turno y disponibilidad; campeones usados quedan Disabled + gris
- Componente de bans: actualiza el ban confirmado y resalta el siguiente si aplica
- Timer: reiniciado a 30 o detenido si finalizado

### 6) Auto-confirm (timeout)

- Cuando `countdown` llega a 0:
  - Servidor auto-confirma el paso y emite `SERVER/STATE` con el avance
  - UI debe comportarse igual que tras una confirmación manual
  - Se guarda `events` con `type = "CONFIRM"` (servidor)

### 7) Draft finalizado (`isFinished = true`)

- Botón principal: Texto "Finalizado" (Disabled)
- Grid de campeones: Disabled completo
- Campeones: todos en su estado final (usados: Disabled + gris; no usados: a color pero Disabled)
- Componente de bans: solo visualización final
- Timer: `countdown = 0`; no hay `SERVER/TICK`

---

## Estados de UI resumidos por rol

- Si `isFinished` → todo Disabled, botón "Finalizado".
- Si NO es tu turno o el paso no está `pending` → botón "Esperando...", grid Disabled.
- Si es tu turno y el paso está `pending` → grid Enabled; botón "Confirmar" Enabled solo si hay selección válida.
- En lobby (antes de ambos READY) → botón "Ready" Enabled (si no lo has pulsado), grid Disabled.

---

## Servidor como reductor (Reducer)

En esta arquitectura el servidor actúa como un reductor: recibe acciones vía Socket.io, calcula un nuevo `DraftState` de forma determinista y luego ejecuta efectos colaterales (persistencia, emisiones, timers, event logging).

### Acciones (domain actions)

- `CLIENT/JOIN` { roomId }
- `CLIENT/READY` { side }
- `CLIENT/SELECT` { side, action, championId }
- `CLIENT/CONFIRM` { side, action }
- `CLIENT/SET_TEAM_NAME` { side, name }
- `SERVER/TICK` { now } (disparada por el timer del servidor)
- `SERVER/AUTO_CONFIRM` {} (derivada cuando `countdown` llega a 0)

### Firma del reductor

```ts
type DomainAction =
  | { type: 'CLIENT/JOIN'; payload: { roomId: string } }
  | { type: 'CLIENT/READY'; payload: { side: UserSide } }
  | { type: 'CLIENT/SELECT'; payload: { side: UserSide; action: DraftType; championId: number | null } }
  | { type: 'CLIENT/CONFIRM'; payload: { side: UserSide; action: DraftType } }
  | { type: 'CLIENT/SET_TEAM_NAME'; payload: { side: UserSide; name: string } }
  | { type: 'SERVER/TICK'; payload: { now: number } }
  | { type: 'SERVER/AUTO_CONFIRM' };

type ReducerResult = {
  state: DraftState;
  effects: Array<
    | { kind: 'persist' }
    | { kind: 'emit-state' }
    | { kind: 'emit-tick' }
    | { kind: 'start-timer' }
    | { kind: 'stop-timer' }
    | { kind: 'log-event'; eventType: string; payload: Record<string, any> }
  >;
};

function reduce(state: DraftState, action: DomainAction): ReducerResult;
```

El reductor NO realiza IO. Solo calcula `state` y una lista de `effects` a ejecutar por el orquestador (servicio de eventos).

### Orden recomendado de ejecución (por el orquestador)

1) Validar y reducir: `const { state: next, effects } = reduce(curr, action)`
2) Persistir: si hay `persist` en `effects` → `updateRoomState(roomId, next, io)`
3) Emitir estado: si hay `emit-state` → `io.to(roomId).emit('message', { type: 'SERVER/STATE', payload: { state: next } })`
4) Timers: `start-timer` o `stop-timer` según corresponda
5) Logging de dominio: `log-event` → `saveEvent(...)` (conforme reglas: solo si `started` y excluyendo `PING/JOIN`)
6) TICK: si hay `emit-tick` lo emite el lazo del timer; el reductor no persiste en TICK

### Mapeo de acciones a efectos

- `CLIENT/JOIN` → effects: [`emit-state`]
- `CLIENT/READY` → reduce `teams[side].ready=true`; si ambos READY → [`persist`, `emit-state`, `start-timer`, `log-event('CLIENT/READY',{state})`]; si no → [`persist`, `emit-state`]
- `CLIENT/SELECT` → reduce `steps[current].championId=payload.championId` → [`persist`, `emit-state`, `log-event('CLIENT/SELECT',{state})`]
- `CLIENT/CONFIRM` → avanza paso (o finaliza) → [`persist`, `emit-state`, `log-event('CLIENT/CONFIRM',{state})`, `start-timer` si hay siguiente o `stop-timer` si finaliza]
- `CLIENT/SET_TEAM_NAME` → actualiza nombre → [`persist`, `emit-state`, `log-event('CLIENT/SET_TEAM_NAME',{state})`]
- `SERVER/TICK` → actualiza `countdown` (sin persistir) → [`emit-tick`]; si llega a 0 → orquestador dispara `SERVER/AUTO_CONFIRM`
- `SERVER/AUTO_CONFIRM` → igual que `CLIENT/CONFIRM` pero `log-event('CONFIRM',{ side, action, championId })`

### Invariantes clave del reductor

- Nunca cambia `steps` fuera de turno ni si `isFinished=true`
- En cada CONFIRM: `pending=false` en el paso actual; si hay siguiente paso: `pending=true` en el siguiente
- `countdown` se reinicia a `DEFAULT_DEADLINE_SECONDS` al comenzar un paso; queda `0` al finalizar
- Los campeones seleccionados en pasos previos no vuelven a estar disponibles


