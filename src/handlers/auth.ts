import { WebSocket } from 'ws';
import { RegPayload, RegResponsePayload } from '../types.js';
import { players } from '../store.js';
import { generatePlayerIndex, hashPassword } from '../store.js';
import { send } from '../utils/messages.js';

export function handleAuth(ws: WebSocket, data: unknown): void {
  const payload = data as RegPayload | null;

  if (!payload || typeof payload.name !== 'string' || typeof payload.password !== 'string') {
    const errorResponse: RegResponsePayload = {
      name: '',
      index: '',
      error: true,
      errorText: 'Invalid registration payload',
    };
    send(ws, 'reg', errorResponse);
    return;
  }

  const { name, password } = payload;

  if (name.length === 0) {
    const errorResponse: RegResponsePayload = {
      name: '',
      index: '',
      error: true,
      errorText: 'Name cannot be empty',
    };
    send(ws, 'reg', errorResponse);
    return;
  }

  const existingPlayer = players.get(name);

  if (existingPlayer !== undefined) {
    const passwordHash = hashPassword(password);

    if (existingPlayer.passwordHash === passwordHash) {
      existingPlayer.ws = ws;
      const response: RegResponsePayload = {
        name: existingPlayer.name,
        index: existingPlayer.index,
        error: false,
        errorText: '',
      };
      send(ws, 'reg', response);
    } else {
      const errorResponse: RegResponsePayload = {
        name: existingPlayer.name,
        index: existingPlayer.index,
        error: true,
        errorText: 'Password does not match',
      };
      send(ws, 'reg', errorResponse);
    }
    return;
  }

  const index = generatePlayerIndex();
  const passwordHash = hashPassword(password);

  const newPlayer = {
    name,
    index,
    score: 0,
    passwordHash,
    ws,
  };

  players.set(name, newPlayer);

  const response: RegResponsePayload = {
    name,
    index,
    error: false,
    errorText: '',
  };
  send(ws, 'reg', response);
}
