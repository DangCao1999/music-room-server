import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//.test(v));

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().refine((v) => /^postgres(ql)?:\/\//.test(v)),
    PUBLIC_URL: httpUrl,
    SETUP_PASSWORD: optionalString,
    YOUTUBE_API_KEY: optionalString,
    JWT_SECRET: optionalString.refine((v) => v === undefined || v.length >= 32),
    DATA_DIR: z.string().default('/data'),
    /** R-43: room:create / room:join / host:register per IP per minute. */
    JOIN_LIMIT_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(20),
    /**
     * Browser origins allowed besides PUBLIC_URL. Each entry is reduced to its origin, so
     * "https://app.vercel.app/" (trailing slash) still matches the browser's Origin header.
     */
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(httpUrl)
          .transform((list) => list.map((u) => new URL(u).origin)),
      ),
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
    /** Dev/E2E only: deterministic fake YouTube, no network. Refused in production. */
    YOUTUBE_FAKE: z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
  })
  .refine((e) => !(e.YOUTUBE_FAKE && e.NODE_ENV === 'production'), {
    path: ['YOUTUBE_FAKE'],
  });

export type Env = z.infer<typeof EnvSchema>;

const HINTS: Record<string, string> = {
  DATABASE_URL: 'phải là URL postgresql://…',
  PUBLIC_URL: 'phải là URL http/https',
  JWT_SECRET: 'tối thiểu 32 ký tự, hoặc để trống để tự sinh',
  PORT: 'phải là số cổng 1–65535',
  NODE_ENV: 'development | production | test',
  CORS_ORIGINS:
    'danh sách URL http/https ngăn bằng dấu phẩy, ví dụ https://app.vercel.app',
  YOUTUBE_FAKE: 'không được bật khi NODE_ENV=production',
};

export class EnvError extends Error {}

/** Validates process.env once at boot; a bad value stops the server with a clear message (R-46). */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(raw);
  if (result.success) return result.data;
  const keys = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
  throw new EnvError(
    keys
      .map(
        (k) =>
          `Biến môi trường không hợp lệ: ${k}${HINTS[k] ? ` (${HINTS[k]})` : ''}`,
      )
      .join('\n'),
  );
}

export const ENV = Symbol('ENV');
