import { WebSocketServer, WebSocket } from 'ws';
import { handleAuth } from './handlers/auth.js';
import { handleGame } from './handlers/game.js';
import { handlePlay } from './handlers/play.js';
import { WsMessage } from './types.js';
import { players, playerGame, games, gameTimers } from './store.js';
import { broadcast } from './utils/messages.js';

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
            game.players = game.players.filter((p) => p.name !== disconnectedPlayerName);

            if (game.players.length === 0) {
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

              broadcast(remainingClients, 'update_players', { players: updatedPlayers });
            }
          }
        }
      }
    });
  });
}
