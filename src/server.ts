import { WebSocketServer, WebSocket } from 'ws';
import { handleAuth } from './handlers/auth.js';
import { handleGame } from './handlers/game.js';
import { handlePlay } from './handlers/play.js';
import { WsMessage } from './types.js';

export function startServer(): void {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  const wss = new WebSocketServer({ port });

  console.log(`Server started on port ${port}`);

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let message: WsMessage<unknown>;
      try {
        message = JSON.parse(raw.toString()) as WsMessage<unknown>;
      } catch {
        return;
      }

      if (!message.type || message.data === undefined) {
        return;
      }

      switch (message.type) {
        case 'reg':
          handleAuth(ws, message.data);
          break;
        case 'create_game':
        case 'join_game':
          handleGame(ws, message.type, message.data);
          break;
        case 'start_game':
        case 'answer':
          handlePlay(ws, message.type, message.data);
          break;
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
}
