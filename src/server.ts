// WebSocket server implementation
import { WebSocketServer } from 'ws';

export function startServer(): void {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  const wss = new WebSocketServer({ port });

  console.log(`Server started on port ${port}`);

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      console.log('Received message:', data.toString());
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
}
