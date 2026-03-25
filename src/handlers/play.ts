import { WebSocket } from 'ws';
import { Game, PlayerAnswer, QuestionPayload, StartGamePayload } from '../types.js';
import { players, games, playerGame, gameTimers } from '../store.js';
import { send, broadcast } from '../utils/messages.js';

export function handlePlay(ws: WebSocket, type: string, data: unknown): void {
  if (type === 'start_game') {
    handleStartGame(ws, data);
  }
}

function handleStartGame(ws: WebSocket, data: unknown): void {
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

  const payload = data as StartGamePayload | null;

  if (!payload || typeof payload.gameId !== 'string') {
    return;
  }

  let game: Game | undefined;

  for (const g of games.values()) {
    if (g.id === payload.gameId) {
      game = g;
      break;
    }
  }

  if (game === undefined || game.hostId !== hostName) {
    return;
  }

  if (game.status !== 'waiting' || game.players.length === 0) {
    return;
  }

  game.status = 'in_progress';
  game.currentQuestion = 0;
  game.answers = [];

  sendQuestion(game);
}

export function sendQuestion(game: Game): void {
  const question = game.questions[game.currentQuestion];
  if (question === undefined) {
    return;
  }

  const questionPayload: QuestionPayload = {
    questionNumber: game.currentQuestion + 1,
    totalQuestions: game.questions.length,
    text: question.text,
    options: question.options,
    timeLimitSec: question.timeLimitSec,
  };

  const allClients = game.players
    .map((p) => {
      const storedPlayer = players.get(p.name);
      return storedPlayer?.ws;
    })
    .filter((c): c is WebSocket => c !== undefined);

  broadcast(allClients, 'question', questionPayload);

  game.questionStartedAt = Date.now();

  const timer = setTimeout(() => {
    resolveQuestion(game);
  }, question.timeLimitSec * 1000);

  gameTimers.set(game.id, timer);
}

export function resolveQuestion(game: Game): void {
  const timer = gameTimers.get(game.id);
  if (timer !== undefined) {
    clearTimeout(timer);
    gameTimers.delete(game.id);
  }
}
