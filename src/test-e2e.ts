import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:8080';

interface Message {
  type: string;
  data: unknown;
  id: number;
}

function createMessage(type: string, data: unknown): string {
  return JSON.stringify({ type, data, id: 0 });
}

class MessageCollector {
  private messages: Message[] = [];
  private waiters: Array<{ type: string; resolve: (msg: Message) => void }> = [];

  constructor(ws: WebSocket) {
    ws.on('message', (raw: Buffer) => {
      const message = JSON.parse(raw.toString()) as Message;
      const waiterIndex = this.waiters.findIndex((w) => w.type === message.type);
      if (waiterIndex !== -1) {
        const waiter = this.waiters.splice(waiterIndex, 1)[0];
        if (waiter !== undefined) {
          waiter.resolve(message);
          return;
        }
      }
      this.messages.push(message);
    });
  }

  async waitFor(type: string): Promise<Message> {
    const existingIndex = this.messages.findIndex((m) => m.type === type);
    if (existingIndex !== -1) {
      const existing = this.messages[existingIndex]!;
      this.messages.splice(existingIndex, 1);
      return existing;
    }
    return new Promise((resolve) => {
      this.waiters.push({ type, resolve });
    });
  }
}

async function runTest(): Promise<void> {
  console.log('Starting end-to-end test...\n');

  const timestamp = Date.now();
  const hostName = `Host_${timestamp}`;
  const player1Name = `Player1_${timestamp}`;
  const player2Name = `Player2_${timestamp}`;

  const hostWs = new WebSocket(SERVER_URL);
  const player1Ws = new WebSocket(SERVER_URL);
  const player2Ws = new WebSocket(SERVER_URL);

  await Promise.all([
    new Promise<void>((resolve) => hostWs.on('open', resolve)),
    new Promise<void>((resolve) => player1Ws.on('open', resolve)),
    new Promise<void>((resolve) => player2Ws.on('open', resolve)),
  ]);

  const hostCollector = new MessageCollector(hostWs);
  const player1Collector = new MessageCollector(player1Ws);
  const player2Collector = new MessageCollector(player2Ws);

  console.log('1. Registering host...');
  hostWs.send(createMessage('reg', { name: hostName, password: 'host123' }));
  const hostReg = await hostCollector.waitFor('reg');
  console.log('Host registered:', JSON.stringify(hostReg.data));

  console.log('\n2. Creating game...');
  const questions = [
    {
      text: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
      timeLimitSec: 2,
    },
    {
      text: 'What is the capital of France?',
      options: ['London', 'Berlin', 'Paris', 'Madrid'],
      correctIndex: 2,
      timeLimitSec: 2,
    },
  ];
  hostWs.send(createMessage('create_game', { questions }));
  const gameCreated = await hostCollector.waitFor('game_created');
  const gameData = gameCreated.data as { gameId: string; code: string };
  console.log('Game created:', JSON.stringify(gameData));

  console.log('\n3. Registering player1...');
  player1Ws.send(createMessage('reg', { name: player1Name, password: 'pass1' }));
  const player1Reg = await player1Collector.waitFor('reg');
  console.log('Player1 registered:', JSON.stringify(player1Reg.data));

  console.log('\n4. Player1 joining game...');
  const hostPlayerJoined1 = hostCollector.waitFor('player_joined');
  const hostUpdatePlayers1 = hostCollector.waitFor('update_players');
  player1Ws.send(createMessage('join_game', { code: gameData.code }));
  const player1Join = await player1Collector.waitFor('game_joined');
  console.log('Player1 joined:', JSON.stringify(player1Join.data));
  await hostPlayerJoined1;
  await hostUpdatePlayers1;
  console.log('Host received broadcasts');

  console.log('\n5. Registering player2...');
  player2Ws.send(createMessage('reg', { name: player2Name, password: 'pass2' }));
  const player2Reg = await player2Collector.waitFor('reg');
  console.log('Player2 registered:', JSON.stringify(player2Reg.data));

  console.log('\n6. Player2 joining game...');
  const hostPlayerJoined2 = hostCollector.waitFor('player_joined');
  const hostUpdatePlayers2 = hostCollector.waitFor('update_players');
  player2Ws.send(createMessage('join_game', { code: gameData.code }));
  const player2Join = await player2Collector.waitFor('game_joined');
  console.log('Player2 joined:', JSON.stringify(player2Join.data));
  await hostPlayerJoined2;
  await hostUpdatePlayers2;
  console.log('Host received broadcasts');

  console.log('\n7. Host starting game...');
  const hostQ1 = hostCollector.waitFor('question');
  const player1Q1 = player1Collector.waitFor('question');
  const player2Q1 = player2Collector.waitFor('question');
  hostWs.send(createMessage('start_game', { gameId: gameData.gameId }));
  await hostQ1;
  await player1Q1;
  await player2Q1;
  console.log('All received question 1');

  console.log('\n8. Players submitting answers...');
  player1Ws.send(createMessage('answer', { gameId: gameData.gameId, questionIndex: 0, answerIndex: 1 }));
  await player1Collector.waitFor('answer_accepted');
  player2Ws.send(createMessage('answer', { gameId: gameData.gameId, questionIndex: 0, answerIndex: 2 }));
  await player2Collector.waitFor('answer_accepted');
  console.log('Players answers accepted');

  console.log('\n9. Waiting for question result...');
  const hostRes1 = hostCollector.waitFor('question_result');
  const player1Res1 = player1Collector.waitFor('question_result');
  const player2Res1 = player2Collector.waitFor('question_result');
  await hostRes1;
  await player1Res1;
  await player2Res1;
  console.log('All received question_result');

  console.log('\n10. Waiting for next question...');
  const hostQ2 = hostCollector.waitFor('question');
  const player1Q2 = player1Collector.waitFor('question');
  const player2Q2 = player2Collector.waitFor('question');
  await hostQ2;
  await player1Q2;
  await player2Q2;
  console.log('All received question 2');

  console.log('\n11. Players submitting answers for question 2...');
  player1Ws.send(createMessage('answer', { gameId: gameData.gameId, questionIndex: 1, answerIndex: 2 }));
  await player1Collector.waitFor('answer_accepted');
  player2Ws.send(createMessage('answer', { gameId: gameData.gameId, questionIndex: 1, answerIndex: 2 }));
  await player2Collector.waitFor('answer_accepted');
  console.log('Players answers accepted');

  console.log('\n12. Waiting for game finished...');
  const hostFin = hostCollector.waitFor('game_finished');
  const player1Fin = player1Collector.waitFor('game_finished');
  const player2Fin = player2Collector.waitFor('game_finished');
  await hostFin;
  await player1Fin;
  await player2Fin;
  console.log('All received game_finished');

  hostWs.close();
  player1Ws.close();
  player2Ws.close();

  console.log('\n=== End-to-end test completed successfully! ===');
  process.exit(0);
}

runTest().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
