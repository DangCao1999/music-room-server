import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

export interface SlackProfile {
  /** '' when Slack did not tell us (users.info failed or the user has no name). */
  name: string;
  email: string | null;
}

const PROFILE_TTL_MS = 60 * 60_000;
const TIMEOUT_MS = 5000;

/** The few Slack Web API calls the bot needs, with the workspace's bot token. */
@Injectable()
export class SlackApi {
  private readonly logger = new Logger(SlackApi.name);
  private readonly profiles = new Map<
    string,
    { at: number; p: SlackProfile }
  >();
  /** Overridable in probes. */
  fetchImpl = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => fetch(input, init);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return Boolean(this.env.SLACK_BOT_TOKEN && this.env.SLACK_SIGNING_SECRET);
  }

  get signingSecret(): string {
    return this.env.SLACK_SIGNING_SECRET ?? '';
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    try {
      const res = await this.fetchImpl(
        `${this.env.SLACK_API_URL.replace(/\/$/, '')}/${method}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            authorization: `Bearer ${this.env.SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string } & T;
      if (!json.ok) {
        this.logger.warn(`slack ${method} failed: ${json.error ?? res.status}`);
        return null;
      }
      return json;
    } catch (e) {
      this.logger.warn(`slack ${method} failed: ${String(e)}`);
      return null;
    }
  }

  /** Returns the message timestamp (its id for updates), or null. */
  async post(
    channel: string,
    text: string,
    blocks: unknown[],
    threadTs?: string | null,
  ): Promise<string | null> {
    const r = await this.call<{ ts: string }>('chat.postMessage', {
      channel,
      text,
      blocks,
      unfurl_links: false,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });
    return r?.ts ?? null;
  }

  /** Only `user` sees it (in the thread when `threadTs` is given). */
  async postEphemeral(
    channel: string,
    user: string,
    text: string,
    blocks: unknown[] = [],
    threadTs?: string | null,
  ): Promise<void> {
    await this.call('chat.postEphemeral', {
      channel,
      user,
      text,
      ...(blocks.length ? { blocks } : {}),
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });
  }

  async update(
    channel: string,
    ts: string,
    text: string,
    blocks: unknown[],
  ): Promise<void> {
    await this.call('chat.update', { channel, ts, text, blocks });
  }

  /** Display name and email (needs users:read and users:read.email), cached for an hour. */
  async profile(userId: string): Promise<SlackProfile> {
    const hit = this.profiles.get(userId);
    if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.p;
    const r = await this.call<{
      user: {
        name?: string;
        real_name?: string;
        profile?: { display_name?: string; real_name?: string; email?: string };
      };
    }>('users.info', { user: userId });
    const u = r?.user;
    const p: SlackProfile = {
      name:
        u?.profile?.display_name ||
        u?.profile?.real_name ||
        u?.real_name ||
        u?.name ||
        '',
      email: u?.profile?.email ?? null,
    };
    if (r && p.name) this.profiles.set(userId, { at: Date.now(), p });
    else
      this.logger.warn(
        `slack users.info gave no name for ${userId} (needs users:read; reinstall the app after changing scopes)`,
      );
    return p;
  }

  /** Replies through a slash command's / button's response_url (ephemeral by default). */
  async respond(
    responseUrl: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.fetchImpl(responseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ response_type: 'ephemeral', ...body }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      this.logger.warn(`slack response_url failed: ${String(e)}`);
    }
  }
}
