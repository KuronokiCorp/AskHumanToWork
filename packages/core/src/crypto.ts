import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is required (openssl rand -base64 32)');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes base64');
  return buf;
}

/** AES-256-GCM. Output: base64(iv | authTag | ciphertext) */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateToken(prefix = 'tfa'): string {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ---- Signed action tokens (one-click complete/snooze from emails & push) ----

import { createHmac, timingSafeEqual } from 'node:crypto';

function actionKey(): Buffer {
  // derive a distinct key from ENCRYPTION_KEY so action links can't decrypt anything
  return createHash('sha256').update(key()).update('action-links-v1').digest();
}

/** Sign `${todoId}|${action}` valid until `exp` (epoch seconds). */
export function signAction(todoId: string, action: string, exp: number): string {
  return createHmac('sha256', actionKey())
    .update(`${todoId}|${action}|${exp}`)
    .digest('base64url');
}

export function verifyAction(todoId: string, action: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = signAction(todoId, action, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
