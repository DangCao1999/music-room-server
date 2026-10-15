import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

/**
 * Free-tier AI, tried in order: Gemini → Groq → OpenRouter (each only with a key).
 * A provider that fails (429, error, timeout) rests for REST_MS and the next one is
 * tried; when none answers the caller gets null and uses its non-AI path. Only song
 * titles and channel names are sent — free tiers may keep prompts.
 */

const TIMEOUT_MS = 15_000;
const REST_MS = 10 * 60_000;
/** Quota, bad key or unknown model: that provider is useless for a while. */
const REST_ON = [401, 403, 404, 429];

export interface AiOptions {
  timeoutMs?: number;
  /** 0.2 for extraction, higher for writing (MC lines, DJ picks). */
  temperature?: number;
}

interface Provider {
  name: string;
  call(
    system: string,
    user: string,
    opts: Required<AiOptions>,
  ): Promise<string>;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

/** OpenAI-compatible chat completions (Groq, OpenRouter). */
function chatCompletions(
  name: string,
  url: string,
  key: string,
  model: string,
): Provider {
  return {
    name,
    async call(system, user, opts) {
      const body = (await post(
        url,
        { authorization: `Bearer ${key}` },
        {
          model,
          temperature: opts.temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        opts.timeoutMs,
      )) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new Error('empty answer');
      return text;
    },
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly providers: Provider[] = [];
  private readonly restingUntil = new Map<string, number>();

  constructor(@Inject(ENV) env: Env) {
    if (env.GEMINI_API_KEY) {
      const key = env.GEMINI_API_KEY;
      const model = env.GEMINI_MODEL;
      this.providers.push({
        name: 'gemini',
        async call(system, user, opts) {
          const body = (await post(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            { 'x-goog-api-key': key },
            {
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: user }] }],
              generationConfig: {
                temperature: opts.temperature,
                responseMimeType: 'application/json',
              },
            },
            opts.timeoutMs,
          )) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const text = body.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('');
          if (!text) throw new Error('empty answer');
          return text;
        },
      });
    }
    if (env.GROQ_API_KEY)
      this.providers.push(
        chatCompletions(
          'groq',
          'https://api.groq.com/openai/v1/chat/completions',
          env.GROQ_API_KEY,
          env.GROQ_MODEL,
        ),
      );
    if (env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL)
      this.providers.push(
        chatCompletions(
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          env.OPENROUTER_API_KEY,
          env.OPENROUTER_MODEL,
        ),
      );
    if (this.providers.length)
      this.logger.log(
        `AI providers: ${this.providers.map((p) => p.name).join(' → ')}`,
      );
  }

  get enabled(): boolean {
    return this.providers.length > 0;
  }

  /** First provider that answers with valid JSON, or null. `task` only names it in logs. */
  async json<T>(
    task: string,
    system: string,
    user: string,
    options: AiOptions = {},
  ): Promise<T | null> {
    const opts = { timeoutMs: TIMEOUT_MS, temperature: 0.2, ...options };
    const now = Date.now();
    for (const p of this.providers) {
      if ((this.restingUntil.get(p.name) ?? 0) > now) continue;
      try {
        const text = await p.call(system, user, opts);
        // Some models wrap JSON in ``` fences despite JSON mode.
        return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T;
      } catch (e) {
        const rest = e instanceof HttpError && REST_ON.includes(e.status);
        if (rest) this.restingUntil.set(p.name, Date.now() + REST_MS);
        this.logger.warn(
          `AI ${task} via ${p.name} failed (${String(e)})${rest ? `; resting it ${REST_MS / 60_000} min` : ''}`,
        );
      }
    }
    return null;
  }
}
