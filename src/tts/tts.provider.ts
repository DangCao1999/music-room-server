import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { Lang, Voice } from '../contracts';

/** Edge neural voices per language and the voice the sender picked. MC lines use `male`. */
export const VOICE_NAMES: Record<Lang, Record<Voice, string>> = {
  vi: { male: 'vi-VN-NamMinhNeural', female: 'vi-VN-HoaiMyNeural' },
  en: { male: 'en-US-AndrewNeural', female: 'en-US-AvaNeural' },
};

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;

/** Turns text into mp3. One implementation today (Edge); kept narrow so another service can replace it. */
export interface TtsProvider {
  synthesize(text: string, voiceName: string): Promise<Buffer>;
  /** Whether it can work here at all (checked once at boot); the reason when it cannot. */
  check(): Promise<string | null>;
}

/**
 * Microsoft Edge "Read Aloud" (unofficial, free) through the Python `edge-tts` package,
 * installed into `.python/` by `npm run tts:install` (version pinned in tts-requirements.txt).
 * Edge changes its handshake now and then; edge-tts keeps up, so a new version is the fix.
 */
export class EdgeTtsProvider implements TtsProvider {
  constructor(private readonly python = 'python3') {}

  /** edge-tts needs Python 3.10+ and the package from `npm run tts:install` (same interpreter). */
  check(): Promise<string | null> {
    const script =
      'import sys\nassert sys.version_info >= (3, 10), "Python %d.%d < 3.10" % sys.version_info[:2]\nimport edge_tts';
    return new Promise((resolve) => {
      execFile(
        this.python,
        ['-c', script],
        { env: this.env(), timeout: TIMEOUT_MS },
        (error, _stdout, stderr) =>
          resolve(
            error
              ? (String(stderr).trim().split('\n').pop() ?? '') || error.message
              : null,
          ),
      );
    });
  }

  /** Only what Python and HTTPS need: never the server's secrets (DATABASE_URL, JWT_SECRET, AI keys). */
  private env(): NodeJS.ProcessEnv {
    const pass = [
      'PATH',
      'HOME',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'SSL_CERT_FILE',
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'NO_PROXY',
    ];
    const env: NodeJS.ProcessEnv = {
      PYTHONPATH: join(process.cwd(), '.python'),
    };
    for (const k of pass)
      if (process.env[k] !== undefined) env[k] = process.env[k];
    return env;
  }

  synthesize(text: string, voiceName: string): Promise<Buffer> {
    const env = this.env();
    // `--text=…` keeps a line that starts with "-" from being read as an option.
    const args = [
      '-m',
      'edge_tts',
      `--voice=${voiceName}`,
      `--text=${text}`,
      '--write-media=-',
    ];
    return new Promise((resolve, reject) => {
      execFile(
        this.python,
        args,
        { env, timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES, encoding: 'buffer' },
        (error, stdout, stderr) => {
          if (error) {
            // Not error.message: it repeats the command line, i.e. the wish text.
            const why = stderr.toString().trim().split('\n').pop() ?? '';
            const how = error.killed
              ? `timed out after ${TIMEOUT_MS} ms`
              : `exit ${String(error.code)}`;
            reject(new Error(`edge-tts ${how}${why ? `: ${why}` : ''}`));
          } else if (stdout.length === 0)
            reject(new Error('edge-tts returned no audio'));
          else resolve(stdout);
        },
      );
    });
  }
}
