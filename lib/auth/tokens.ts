// lib/auth/tokens.ts
import crypto from 'crypto';

export function createPlainToken(len = 32) {
  // base64url без символов +/=
  return crypto.randomBytes(len).toString('base64url');
}
export function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
