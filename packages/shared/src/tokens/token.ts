import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

const REFRESH_TOKEN_BYTES = 32;

const REFRESH_HASH_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
}

export function hashRefreshToken(token: string): Promise<string> {
  return hash(token, REFRESH_HASH_OPTIONS);
}

export function verifyRefreshToken(stored: string, token: string): Promise<boolean> {
  return verify(stored, token);
}
