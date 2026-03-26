export type GameStatus = 'waiting' | 'in_progress' | 'finished' | 'paused';

export interface Player {
  name: string;
  index: string;
  score: number;
}

export interface Question {
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  timeLimitSec: number;
}

export interface Game {
  id: string;
  code: string;
  hostId: string;
  questions: Question[];
  players: Player[];
  currentQuestion: number;
  status: GameStatus;
  questionStartedAt?: number;
  answers: PlayerAnswer[];
  isResolving: boolean;
  pausedAt?: number;
  timeRemainingAtPause?: number;
}

export interface PlayerAnswer {
  playerId: string;
  answerIndex: number;
  answeredAt: number;
}

export interface RegPayload {
  name: string;
  password: string;
}

export interface RegResponsePayload {
  name: string;
  index: string;
  error: boolean;
  errorText: string;
}

export interface CreateGamePayload {
  questions: Question[];
}

export interface CreateGameResponsePayload {
  gameId: string;
  code: string;
}

export interface JoinGamePayload {
  code: string;
}

export interface JoinGameResponsePayload {
  gameId: string;
}

export interface PlayerJoinedPayload {
  playerName: string;
  playerCount: number;
}

export interface UpdatePlayersPayload {
  players: Player[];
}

export interface StartGamePayload {
  gameId: string;
}

export interface QuestionPayload {
  questionNumber: number;
  totalQuestions: number;
  text: string;
  options: [string, string, string, string];
  timeLimitSec: number;
}

export interface AnswerPayload {
  gameId: string;
  questionIndex: number;
  answerIndex: number;
}

export interface AnswerAcceptedPayload {
  questionIndex: number;
}

export interface QuestionResultPayload {
  questionIndex: number;
  correctIndex: number;
  playerResults: {
    name: string;
    answered: boolean;
    correct: boolean;
    pointsEarned: number;
    totalScore: number;
  }[];
}

export interface GameFinishedPayload {
  scoreboard: {
    name: string;
    score: number;
    rank: number;
  }[];
}

export interface GameCancelledPayload {
  reason: string;
}

export interface PauseGamePayload {
  gameId: string;
}

export interface ResumeGamePayload {
  gameId: string;
}

export interface WsMessage<T> {
  type: string;
  data: T;
  id: 0;
}
