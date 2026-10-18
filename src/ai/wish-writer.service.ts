import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { LIMITS, type Lang } from '../contracts';
import { AiService } from './ai.service';

const system = (language: Lang) =>
  `Bạn là MC của chiếc loa phát nhạc chung trong một văn phòng.
Viết MỘT lời chúc ngắn (tối đa 25 từ) mà người chọn bài gửi tới cả phòng; loa sẽ đọc to ngay trước bài hát.
- Viết bằng ${language === 'en' ? 'tiếng Anh (English)' : 'tiếng Việt có dấu'}.
- Vui, ấm áp, lịch sự nơi công sở; có thể nhắc khéo tới tên bài hoặc không khí của bài.
- Nếu có "hint" (người gửi tự gõ), giữ đúng ý và mọi tên riêng trong đó; viết lại cho hay hơn.
- Không thêm tên người nào khác, không emoji, không hashtag, không dấu ngoặc kép.
Trả lời đúng JSON: {"text": <string>}.`;

/** "Nhờ MC viết": the AI drafts a wish; the sender edits it, and it is checked (AI4) when saved. */
@Injectable()
export class WishWriterService {
  constructor(private readonly ai: AiService) {}

  async write(
    track: { title: string; artist: string | null; song: string | null },
    hint: string | undefined,
    language: Lang = 'vi',
  ): Promise<string> {
    if (!this.ai.enabled) throw new AppError('AI_UNAVAILABLE');
    const answer = await this.ai.json<{ text?: string }>(
      'wish',
      system(language),
      JSON.stringify({
        song: track.song ?? track.title,
        artist: track.artist ?? undefined,
        hint: hint?.trim() || undefined,
      }),
      { temperature: 0.9 },
    );
    const text =
      typeof answer?.text === 'string'
        ? answer.text.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim()
        : '';
    if (!text) throw new AppError('AI_UNAVAILABLE');
    return text.slice(0, LIMITS.wish);
  }
}
