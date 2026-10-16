import { createHmac, timingSafeEqual } from 'node:crypto';

/** Requests older than this are refused, so a captured request cannot be replayed later. */
const MAX_AGE_SEC = 5 * 60;

/**
 * Slack request signing (v0): HMAC-SHA256 of `v0:<timestamp>:<raw body>` with the app's
 * signing secret, sent as `X-Slack-Signature`. https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  secret: string,
  rawBody: Buffer | string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!rawBody || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > MAX_AGE_SEC)
    return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const mine = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
  const a = Buffer.from(mine);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
