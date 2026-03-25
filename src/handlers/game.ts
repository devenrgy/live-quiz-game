import { WebSocket } from 'ws';
import { CreateGamePayload, CreateGameResponsePayload, Game, Question } from '../types.js';
import { players, games, playerGame } from '../store.js';
import { generateCode } from '../utils/codes.js';
import { send } from '../utils/messages.js';

function isValidQuestion(question: unknown): question is Question {
  if (typeof question !== 'object' || question === null) {
    return false;
  }

  const q = question as Record<string, unknown>;

  if (typeof q.text !== 'string' || q.text.length === 0) {
    return false;
  }

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return false;
  }

  for (const opt of q.options) {
    if (typeof opt !== 'string' || opt.length === 0) {
      return false;
    }
  }

  if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
    return false;
  }

  if (typeof q.timeLimitSec !== 'number' || !Number.isInteger(q.timeLimitSec) || q.timeLimitSec <= 0) {
    return false;
  }

  return true;
}

function isValidQuestionsArray(questions: unknown): questions is Question[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    return false;
  }

  return questions.every(isValidQuestion);
}

export function handleGame(ws: WebSocket, type: string, data: unknown): void {
  if (type === 'create_game') {
    handleCreateGame(ws, data);
  }
}

function handleCreateGame(ws: WebSocket, data: unknown): void {
  let hostName: string | undefined;

  for (const [name, player] of players.entries()) {
    if (player.ws === ws) {
      hostName = name;
      break;
    }
  }

  if (hostName === undefined) {
    const errorResponse: CreateGameResponsePayload = {
      gameId: '',
      code: '',
    };
    send(ws, 'create_game', errorResponse);
    return;
  }

  const payload = data as CreateGamePayload | null;

  if (!payload || !isValidQuestionsArray(payload.questions)) {
    const errorResponse: CreateGameResponsePayload = {
      gameId: '',
      code: '',
    };
    send(ws, 'create_game', errorResponse);
    return;
  }

  const code = generateCode();
  const gameId = crypto.randomUUID();

  const game: Game = {
    id: gameId,
    code,
    hostId: hostName,
    questions: payload.questions,
    players: [],
    currentQuestion: 0,
    status: 'waiting',
  };

  games.set(code, game);
  playerGame.set(hostName, gameId);

  const response: CreateGameResponsePayload = {
    gameId,
    code,
  };
  send(ws, 'create_game', response);
}
