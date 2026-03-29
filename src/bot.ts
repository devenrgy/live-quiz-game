import { WebSocket } from 'ws';

const roomCode = process.env.ROOM_CODE;

if (!roomCode) {
  process.stderr.write('ROOM_CODE environment variable is required\n');
  process.exit(1);
}

const wsUrl = process.env.WS_URL ?? 'ws://localhost:8080';
const botName = 'Bot';
const botPassword = 'bot-password';

const ws = new WebSocket(wsUrl);

let gameId = '';
let currentQuestionIndex = 0;

ws.on('open', () => {
  const regMessage = JSON.stringify({
    type: 'reg',
    data: {
      name: botName,
      password: botPassword,
    },
    id: 0,
  });
  ws.send(regMessage);
});

ws.on('message', (raw) => {
  let message: { type: string; data: unknown; id: number };
  try {
    message = JSON.parse(raw.toString()) as { type: string; data: unknown; id: number };
  } catch {
    return;
  }

  const { type, data } = message;

  if (type === 'reg') {
    const regData = data as { error: boolean; errorText: string } | null;
    if (regData !== null && regData.error) {
      process.stderr.write(`Registration failed: ${regData.errorText}\n`);
      ws.close();
      return;
    }

    const joinMessage = JSON.stringify({
      type: 'join_game',
      data: {
        code: roomCode,
      },
      id: 0,
    });
    ws.send(joinMessage);
  } else if (type === 'game_joined') {
    const joinedData = data as { gameId: string } | null;
    if (joinedData !== null && joinedData.gameId) {
      gameId = joinedData.gameId;
    }
  } else if (type === 'question') {
    const questionData = data as { timeLimitSec: number; options: [string, string, string, string]; questionNumber: number } | null;
    if (questionData === null) {
      return;
    }

    const timeLimitSec = questionData.timeLimitSec;
    const delayMs = Math.floor(Math.random() * timeLimitSec * 1000);

    setTimeout(() => {
      const randomAnswer = Math.floor(Math.random() * 4);
      const answerMessage = JSON.stringify({
        type: 'answer',
        data: {
          gameId,
          questionIndex: currentQuestionIndex,
          answerIndex: randomAnswer,
        },
        id: 0,
      });
      ws.send(answerMessage);
    }, delayMs);
  } else if (type === 'question_result') {
    const resultData = data as { questionIndex: number } | null;
    if (resultData !== null && typeof resultData.questionIndex === 'number') {
      currentQuestionIndex = resultData.questionIndex + 1;
    }
  } else if (type === 'game_finished') {
    ws.close();
  } else if (type === 'game_cancelled') {
    ws.close();
  }
});

ws.on('error', (err) => {
  process.stderr.write(`WebSocket error: ${err.message}\n`);
});

ws.on('close', () => {
  process.stdout.write('Bot disconnected\n');
});
