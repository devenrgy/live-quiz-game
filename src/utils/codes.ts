import { games } from '../store.js';

const CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateCode(): string {
  let code: string;
  do {
    let result = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      const randomIndex = Math.floor(Math.random() * CODE_CHARS.length);
      result += CODE_CHARS[randomIndex]!;
    }
    code = result;
  } while (games.has(code));

  return code;
}
