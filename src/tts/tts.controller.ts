import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TtsService } from './tts.service';

const FILE = /^([a-f0-9]{32})\.mp3$/;

/**
 * GET /api/tts/<key>.mp3 — only audio the server already made for a wish or an MC line;
 * never synthesizes from the URL, so nobody can use the server as a free reader.
 */
@Controller('tts')
export class TtsController {
  constructor(private readonly tts: TtsService) {}

  @Get(':file')
  file(
    @Param('file') file: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): void {
    const key = FILE.exec(file)?.[1];
    const mp3 = key ? this.tts.get(key) : undefined;
    if (!mp3) throw new NotFoundException();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    // The web app (another origin) plays it in an <audio> element; helmet defaults to same-origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Safari asks for byte ranges first (bytes=0-1) and gives up on a plain 200.
    res.setHeader('Accept-Ranges', 'bytes');
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    if (!m || (m[1] === '' && m[2] === '')) {
      res.send(mp3);
      return;
    }
    const size = mp3.length;
    // "bytes=-N" is the last N bytes; "bytes=A-" runs to the end.
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end =
      m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
      return;
    }
    res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.send(mp3.subarray(start, end + 1));
  }
}
