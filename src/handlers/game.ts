import { WebSocket } from 'ws';
import {
  CreateGamePayload,
  GameCreatedPayload,
  ExportQuestionsPayload,
  Game,
  ImportQuestionsPayload,
  JoinGamePayload,
  GameJoinedPayload,
  PlayerJoinedPayload,
  Question,
  QuestionsExportedPayload,
  QuestionsImportedPayload,
  Player,
} from '../types.js';
import { players, games, playerGame } from '../store.js';
import { generateCode } from '../utils/codes.js';
import { send, broadcast } from '../utils/messages.js';

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
  } else if (type === 'join_game') {
    handleJoinGame(ws, data);
  } else if (type === 'export_questions') {
    handleExportQuestions(ws, data);
  } else if (type === 'import_questions') {
    handleImportQuestions(ws, data);
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
    const errorResponse: GameCreatedPayload = {
      gameId: '',
      code: '',
    };
    send(ws, 'game_created', errorResponse);
    return;
  }

  const payload = data as CreateGamePayload | null;

  if (!payload || !isValidQuestionsArray(payload.questions)) {
    const errorResponse: GameCreatedPayload = {
      gameId: '',
      code: '',
    };
    send(ws, 'game_created', errorResponse);
    return;
  }

  const code = generateCode();
  const gameId = crypto.randomUUID();

  const hostPlayer = players.get(hostName);
  if (hostPlayer === undefined) {
    return;
  }

  const game: Game = {
    id: gameId,
    code,
    hostId: hostName,
    questions: payload.questions,
    players: [{
      name: hostPlayer.name,
      index: hostPlayer.index,
      score: hostPlayer.score,
    }],
    currentQuestion: 0,
    status: 'waiting',
    answers: [],
    isResolving: false,
  };

  games.set(gameId, game);
  playerGame.set(hostName, gameId);

  const response: GameCreatedPayload = {
    gameId,
    code,
  };
  send(ws, 'game_created', response);
}

function handleJoinGame(ws: WebSocket, data: unknown): void {
  let playerName: string | undefined;

  for (const [name, player] of players.entries()) {
    if (player.ws === ws) {
      playerName = name;
      break;
    }
  }

  if (playerName === undefined) {
    const errorResponse: GameJoinedPayload = {
      gameId: '',
    };
    send(ws, 'game_joined', errorResponse);
    return;
  }

  const existingGameId = playerGame.get(playerName);
  if (existingGameId !== undefined) {
    const errorResponse: GameJoinedPayload = {
      gameId: '',
    };
    send(ws, 'game_joined', errorResponse);
    return;
  }

  const payload = data as JoinGamePayload | null;

  if (!payload || typeof payload.code !== 'string') {
    const errorResponse: GameJoinedPayload = {
      gameId: '',
    };
    send(ws, 'game_joined', errorResponse);
    return;
  }

  let game: import('../types.js').Game | undefined;
  for (const g of games.values()) {
    if (g.code === payload.code) {
      game = g;
      break;
    }
  }

  if (game === undefined || game.status !== 'waiting') {
    const errorResponse: GameJoinedPayload = {
      gameId: '',
    };
    send(ws, 'game_joined', errorResponse);
    return;
  }

  const player = players.get(playerName);
  if (player === undefined) {
    const errorResponse: GameJoinedPayload = {
      gameId: '',
    };
    send(ws, 'game_joined', errorResponse);
    return;
  }

  game.players.push({
    name: player.name,
    index: player.index,
    score: player.score,
  });
  playerGame.set(playerName, game.id);

  const joinResponse: GameJoinedPayload = {
    gameId: game.id,
  };
  send(ws, 'game_joined', joinResponse);

  const playerJoinedData: PlayerJoinedPayload = {
    playerName: player.name,
    playerCount: game.players.length,
  };

  const allClients = game.players
    .map((p) => {
      const storedPlayer = players.get(p.name);
      return storedPlayer?.ws;
    })
    .filter((c): c is WebSocket => c !== undefined);

  broadcast(allClients, 'player_joined', playerJoinedData);

  const updatedPlayers = game.players.map((p) => ({
    name: p.name,
    index: p.index,
    score: p.score,
  }));

  broadcast(allClients, 'update_players', updatedPlayers);
}

function handleExportQuestions(ws: WebSocket, data: unknown): void {
  let hostName: string | undefined;

  for (const [name, player] of players.entries()) {
    if (player.ws === ws) {
      hostName = name;
      break;
    }
  }

  if (hostName === undefined) {
    return;
  }

  const payload = data as ExportQuestionsPayload | null;

  if (!payload || typeof payload.gameId !== 'string') {
    return;
  }

  const game = games.get(payload.gameId);

  if (game === undefined || game.hostId !== hostName) {
    return;
  }

  const response: QuestionsExportedPayload = {
    schemaVersion: 1,
    questions: game.questions,
  };
  send(ws, 'questions_exported', response);
}

function handleImportQuestions(ws: WebSocket, data: unknown): void {
  let hostName: string | undefined;

  for (const [name, player] of players.entries()) {
    if (player.ws === ws) {
      hostName = name;
      break;
    }
  }

  if (hostName === undefined) {
    return;
  }

  const payload = data as ImportQuestionsPayload | null;

  if (!payload || typeof payload.gameId !== 'string' || typeof payload.schemaVersion !== 'number' || payload.schemaVersion !== 1 || !isValidQuestionsArray(payload.questions)) {
    return;
  }

  const game = games.get(payload.gameId);

  if (game === undefined || game.hostId !== hostName || game.status !== 'waiting') {
    return;
  }

  game.questions = payload.questions;

  const response: QuestionsImportedPayload = {
    gameId: game.id,
    totalQuestions: game.questions.length,
  };
  send(ws, 'questions_imported', response);
}
