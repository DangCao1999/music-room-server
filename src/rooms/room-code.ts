import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET } from '../contracts';

/** 6 chars from an alphabet without look-alikes (0/O, 1/I) — R-02. */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
