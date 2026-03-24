import { WebSocket } from 'ws';

export function send<T>(ws: WebSocket, type: string, data: T): void {
  const message = JSON.stringify({ type, data, id: 0 });
  ws.send(message);
}

export function broadcast<T>(clients: WebSocket[], type: string, data: T): void {
  const message = JSON.stringify({ type, data, id: 0 });
  for (const client of clients) {
    client.send(message);
  }
}
