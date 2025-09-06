// lib/auth/email.ts
import { randomBytes, createHash } from 'crypto';
import { query } from '@/lib/db';
import { sendVerificationEmail, VerificationPurpose } from '@/lib/mail';

function b64url(bytes: Buffer) {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function issueEmailVerificationToken(
  email: string,
  purpose: VerificationPurpose = 'signup',
  ttlHours = 24,
  verificationBaseUrl: string // например, "https://site.tld/api/auth/verify"
) {
  const raw = b64url(randomBytes(32));
  const hash = createHash('sha256').update(raw).digest('hex');

  await query(
    `INSERT INTO auth_email_tokens (token_hash, email, purpose, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)
     ON CONFLICT (token_hash) DO NOTHING`,
    [hash, email.toLowerCase(), purpose, String(ttlHours)]
  );

  const link = `${verificationBaseUrl}?token=${encodeURIComponent(raw)}`;
  await sendVerificationEmail(email, link, purpose);
}

/** Возвращает email, если токен валиден и был помечен как использованный */
export async function consumeEmailVerificationToken(rawToken: string): Promise<string | null> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const res = await query<{ email: string }>(
    `UPDATE auth_email_tokens
       SET used_at = now()
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > now()
     RETURNING email`,
    [tokenHash]
  );

  return res.rowCount ? res.rows[0].email : null;
}
