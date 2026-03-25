import { WebSocket } from 'ws';
import {
  CreateGamePayload,
  CreateGameResponsePayload,
  Game,
  JoinGamePayload,
  JoinGameResponsePayload,
  PlayerJoinedPayload,
  Question,
  UpdatePlayersPayload,
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
    answers: [],
    isResolving: false,
  };

  games.set(code, game);
  playerGame.set(hostName, gameId);

  const response: CreateGameResponsePayload = {
    gameId,
    code,
  };
  send(ws, 'create_game', response);
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
    const errorResponse: JoinGameResponsePayload = {
      gameId: '',
    };
    send(ws, 'join_game', errorResponse);
    return;
  }

  const existingGameId = playerGame.get(playerName);
  if (existingGameId !== undefined) {
    const errorResponse: JoinGameResponsePayload = {
      gameId: '',
    };
    send(ws, 'join_game', errorResponse);
    return;
  }

  const payload = data as JoinGamePayload | null;

  if (!payload || typeof payload.code !== 'string') {
    const errorResponse: JoinGameResponsePayload = {
      gameId: '',
    };
    send(ws, 'join_game', errorResponse);
    return;
  }

  const game = games.get(payload.code);

  if (game === undefined || game.status !== 'waiting') {
    const errorResponse: JoinGameResponsePayload = {
      gameId: '',
    };
    send(ws, 'join_game', errorResponse);
    return;
  }

  const player = players.get(playerName);
  if (player === undefined) {
    const errorResponse: JoinGameResponsePayload = {
      gameId: '',
    };
    send(ws, 'join_game', errorResponse);
    return;
  }

  game.players.push({
    name: player.name,
    index: player.index,
    score: player.score,
  });
  playerGame.set(playerName, game.id);

  const joinResponse: JoinGameResponsePayload = {
    gameId: game.id,
  };
  send(ws, 'join_game', joinResponse);

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

  const updatePlayersData: UpdatePlayersPayload = {
    players: updatedPlayers,
  };
  broadcast(allClients, 'update_players', updatePlayersData);
}
