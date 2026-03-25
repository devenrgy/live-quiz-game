import { WebSocket } from 'ws';
import {
  Game,
  PlayerAnswer,
  QuestionPayload,
  StartGamePayload,
  AnswerPayload,
  AnswerAcceptedPayload,
  QuestionResultPayload,
  GameFinishedPayload,
  Question,
  Player,
} from '../types.js';
import { players, games, playerGame, gameTimers } from '../store.js';
import { send, broadcast } from '../utils/messages.js';

export function handlePlay(ws: WebSocket, type: string, data: unknown): void {
  if (type === 'start_game') {
    handleStartGame(ws, data);
  } else if (type === 'answer') {
    handleAnswer(ws, data);
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

function handleAnswer(ws: WebSocket, data: unknown): void {
  let playerName: string | undefined;

  for (const [name, player] of players.entries()) {
    if (player.ws === ws) {
      playerName = name;
      break;
    }
  }

  if (playerName === undefined) {
    return;
  }

  const payload = data as AnswerPayload | null;

  if (!payload || typeof payload.gameId !== 'string' || typeof payload.questionIndex !== 'number' || typeof payload.answerIndex !== 'number') {
    return;
  }

  const gameId = payload.gameId;
  const questionIndex = payload.questionIndex;
  const answerIndex = payload.answerIndex;

  const storedPlayer = players.get(playerName);
  if (storedPlayer === undefined) {
    return;
  }

  const actualGameId = playerGame.get(playerName);
  if (actualGameId === undefined || actualGameId !== gameId) {
    return;
  }

  const game = games.get(gameId);
  if (game === undefined) {
    return;
  }

  if (game.status !== 'in_progress') {
    return;
  }

  if (questionIndex !== game.currentQuestion) {
    return;
  }

  const hasAnswered = game.answers.some((a) => a.playerId === playerName);
  if (hasAnswered) {
    return;
  }

  const answer: PlayerAnswer = {
    playerId: playerName,
    answerIndex,
    answeredAt: Date.now(),
  };

  game.answers.push(answer);

  const answerAccepted: AnswerAcceptedPayload = {
    questionIndex,
  };

  send(ws, 'answer_accepted', answerAccepted);

  const allPlayersAnswered = game.answers.length === game.players.length;

  if (allPlayersAnswered) {
    resolveQuestion(game);
  }
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

  const question = game.questions[game.currentQuestion];
  if (question === undefined) {
    return;
  }

  const questionIndex = game.currentQuestion;
  const correctIndex = question.correctIndex;

  const playerResults: QuestionResultPayload['playerResults'] = [];

  for (const player of game.players) {
    const answer = game.answers.find((a) => a.playerId === player.name);
    const answered = answer !== undefined;
    const correct = answered && answer.answerIndex === correctIndex;

    let pointsEarned = 0;

    if (correct && answer !== undefined && game.questionStartedAt !== undefined) {
      const elapsedMs = answer.answeredAt - game.questionStartedAt;
      const timeRemainingMs = Math.max(0, question.timeLimitSec * 1000 - elapsedMs);
      pointsEarned = Math.round((1000 * timeRemainingMs) / (question.timeLimitSec * 1000));
    }

    player.score += pointsEarned;

    playerResults.push({
      name: player.name,
      answered,
      correct,
      pointsEarned,
      totalScore: player.score,
    });
  }

  const resultPayload: QuestionResultPayload = {
    questionIndex,
    correctIndex,
    playerResults,
  };

  const allClients = game.players
    .map((p) => {
      const storedPlayer = players.get(p.name);
      return storedPlayer?.ws;
    })
    .filter((c): c is WebSocket => c !== undefined);

  broadcast(allClients, 'question_result', resultPayload);

  game.answers = [];
  game.currentQuestion += 1;

  if (game.currentQuestion < game.questions.length) {
    setTimeout(() => {
      sendQuestion(game);
    }, 3000);
  } else {
    finishGame(game);
  }
}

function finishGame(game: Game): void {
  game.status = 'finished';

  const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);

  const scoreboard: GameFinishedPayload['scoreboard'] = [];

  for (let i = 0; i < sortedPlayers.length; i += 1) {
    const player = sortedPlayers[i]!;
    let rank = i + 1;

    if (i > 0) {
      const prevPlayer = sortedPlayers[i - 1];
      if (prevPlayer !== undefined && prevPlayer.score === player.score) {
        const prevResult = scoreboard[i - 1];
        if (prevResult !== undefined) {
          rank = prevResult.rank;
        }
      }
    }

    scoreboard.push({
      name: player.name,
      score: player.score,
      rank,
    });
  }

  const finishedPayload: GameFinishedPayload = {
    scoreboard,
  };

  const allClients = game.players
    .map((p) => {
      const storedPlayer = players.get(p.name);
      return storedPlayer?.ws;
    })
    .filter((c): c is WebSocket => c !== undefined);

  broadcast(allClients, 'game_finished', finishedPayload);
}
