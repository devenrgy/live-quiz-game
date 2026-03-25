import { createHash } from 'crypto';
import { WebSocket } from 'ws';
import { Player, Game } from './types.js';

export interface StoredPlayer extends Player {
  passwordHash: string;
  ws: WebSocket;
}

export const players = new Map<string, StoredPlayer>();
export const games = new Map<string, Game>();
export const playerGame = new Map<string, string>();
export const gameTimers = new Map<string, NodeJS.Timeout>();

let playerIndexCounter = 0;

export function generatePlayerIndex(): string {
  playerIndexCounter += 1;
  return playerIndexCounter.toString();
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}
