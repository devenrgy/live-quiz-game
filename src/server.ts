import { createServer } from 'http';
import { createReadStream } from 'fs';
import { extname, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { handleAuth } from './handlers/auth.js';
import { handleGame } from './handlers/game.js';
import { handlePlay } from './handlers/play.js';
import { WsMessage } from './types.js';
import { players, playerGame, games, gameTimers } from './store.js';
import { broadcast } from './utils/messages.js';
import { GameCancelledPayload } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = __dirname;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

export function startServer(): void {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

  const httpServer = createServer((req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    const urlPath = req.url ?? '/index.html';
    const safePath = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = join(rootDir, 'public', safePath);

    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    const stream = createReadStream(filePath, { flags: 'r' });

    stream.on('error', () => {
      res.statusCode = 404;
      res.end('Not Found');
    });

    res.setHeader('Content-Type', contentType + '; charset=utf-8');
    stream.pipe(res);
  });

  const wss = new WebSocketServer({ server: httpServer });

  httpServer.listen(port, () => {
    process.stdout.write(`Server started on port ${port}\n`);
  });

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
        case 'pause_game':
        case 'resume_game':
          handlePlay(ws, message.type, message.data);
          break;
      }
    });

    ws.on('close', () => {
      let disconnectedPlayerName: string | undefined;

      for (const [name, player] of players.entries()) {
        if (player.ws === ws) {
          disconnectedPlayerName = name;
          break;
        }
      }

      if (disconnectedPlayerName !== undefined) {
        players.delete(disconnectedPlayerName);

        const gameId = playerGame.get(disconnectedPlayerName);

        if (gameId !== undefined) {
          playerGame.delete(disconnectedPlayerName);

          const game = games.get(gameId);

          if (game !== undefined) {
            const isHost = game.hostId === disconnectedPlayerName;

            game.players = game.players.filter((p) => p.name !== disconnectedPlayerName);

            if (isHost) {
              const timer = gameTimers.get(gameId);
              if (timer !== undefined) {
                clearTimeout(timer);
                gameTimers.delete(gameId);
              }

              const remainingClients = game.players
                .map((p) => {
                  const storedPlayer = players.get(p.name);
                  return storedPlayer?.ws;
                })
                .filter((c): c is WebSocket => c !== undefined);

              if (remainingClients.length > 0) {
                const cancelledData: GameCancelledPayload = {
                  reason: 'Host disconnected',
                };
                broadcast(remainingClients, 'game_cancelled', cancelledData);
              }

              games.delete(gameId);
            } else if (game.players.length === 0) {
              const timer = gameTimers.get(gameId);
              if (timer !== undefined) {
                clearTimeout(timer);
                gameTimers.delete(gameId);
              }
              games.delete(gameId);
            } else {
              const remainingClients = game.players
                .map((p) => {
                  const storedPlayer = players.get(p.name);
                  return storedPlayer?.ws;
                })
                .filter((c): c is WebSocket => c !== undefined);

              const updatedPlayers = game.players.map((p) => ({
                name: p.name,
                index: p.index,
                score: p.score,
              }));

              broadcast(remainingClients, 'update_players', updatedPlayers);
            }
          }
        }
      }
    });
  });
}
