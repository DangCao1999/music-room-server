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

interface Provider {
  name: string;
  call(system: string, user: string): Promise<string>;
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    async call(system, user) {
      const body = (await post(
        url,
        { authorization: `Bearer ${key}` },
        {
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
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
        async call(system, user) {
          const body = (await post(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            { 'x-goog-api-key': key },
            {
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: user }] }],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
              },
            },
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
  async json<T>(task: string, system: string, user: string): Promise<T | null> {
    const now = Date.now();
    for (const p of this.providers) {
      if ((this.restingUntil.get(p.name) ?? 0) > now) continue;
      try {
        const text = await p.call(system, user);
        // Some models wrap JSON in ``` fences despite JSON mode.
        return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T;
      } catch (e) {
        this.restingUntil.set(p.name, Date.now() + REST_MS);
        this.logger.warn(
          `AI ${task} via ${p.name} failed (${String(e)}); resting it ${REST_MS / 60_000} min`,
        );
      }
    }
    return null;
  }
}
