import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { AiService } from './ai.service';
import { blockedWords } from './moderation';

const SYSTEM = `You check short messages that a speaker will read aloud in an office (Vietnamese or English).
Answer only JSON: {"ok": boolean}.
ok is false for insults, harassment, sexual content, hate, threats or slurs, including spelled-around forms.
Jokes, teasing between colleagues and birthday wishes are fine.`;

/** AI4: wishes are read aloud, so they pass the word list and then an AI check. */
@Injectable()
export class ModerationService {
  constructor(private readonly ai: AiService) {}

  /** Throws MESSAGE_BLOCKED. If the AI does not answer, the word list alone decides. */
  async checkWish(text: string | null | undefined): Promise<void> {
    if (!text) return;
    if (blockedWords(text).length) throw new AppError('MESSAGE_BLOCKED');
    const verdict = await this.ai.json<{ ok?: boolean }>(
      'moderation',
      SYSTEM,
      JSON.stringify({ message: text }),
      { timeoutMs: 5000 },
    );
    if (verdict && verdict.ok === false) throw new AppError('MESSAGE_BLOCKED');
  }
}
