import {
  Body,
  Controller,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { parseYouTubeVideo, type Reaction, REACTIONS } from '../../contracts';
import { ChatNotifierService } from '../chat-notifier.service';
import { type ChatUser, ChatRoomService } from '../chat-room.service';
import { CHAT, chatError } from '../chat-text';
import { SlackApi } from './slack-api.service';
import { nowMessage, queueMessage, searchMessage } from './slack-blocks';
import { verifySlackSignature } from './slack-verify';

type Form = Record<string, string | undefined>;
type Reply = Record<string, unknown>;

const ephemeral = (text: string, extra: Reply = {}): Reply => ({
  response_type: 'ephemeral',
  text,
  ...extra,
});

/**
 * Đợt 3: Slack's "/music" slash command and the buttons on its messages. Every request is
 * checked against the app's signing secret; slow work answers through `response_url` so
 * Slack always gets its reply within 3 seconds.
 */
@Controller('slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(
    private readonly slack: SlackApi,
    private readonly chat: ChatRoomService,
    private readonly notifier: ChatNotifierService,
  ) {}

  private verify(req: RawBodyRequest<Request>): void {
    if (!this.slack.enabled) throw new NotFoundException();
    const ok = verifySlackSignature(
      this.slack.signingSecret,
      req.rawBody,
      req.header('x-slack-request-timestamp'),
      req.header('x-slack-signature'),
    );
    if (!ok) throw new UnauthorizedException();
  }

  private async user(
    teamId: string,
    userId: string,
    fallbackName: string,
  ): Promise<ChatUser> {
    const p = await this.slack.profile(userId, fallbackName);
    return { platform: 'slack', teamId, userId, name: p.name, email: p.email };
  }

  // ------------------------------------------------------------ /music

  @Post('commands')
  @HttpCode(200)
  async command(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Form,
  ): Promise<Reply> {
    this.verify(req);
    const teamId = body.team_id ?? '';
    const channelId = body.channel_id ?? '';
    const [sub = '', ...rest] = (body.text ?? '').trim().split(/\s+/);
    const arg = rest.join(' ').trim();
    try {
      switch (sub.toLowerCase()) {
        case 'help':
          return ephemeral(CHAT.help);
        case 'connect': {
          const [code, pin] = rest;
          if (!code || !pin) return ephemeral(CHAT.connectUsage);
          const room = await this.chat.connect(
            'slack',
            teamId,
            channelId,
            code,
            pin,
          );
          const link = await this.chat.link('slack', teamId, channelId);
          if (link) this.notifier.forget(link.roomId);
          return {
            response_type: 'in_channel',
            text: CHAT.connected(room.name, room.code),
          };
        }
        case 'disconnect': {
          if (!rest[0]) return ephemeral(CHAT.disconnectUsage);
          const link = await this.chat.link('slack', teamId, channelId);
          await this.chat.disconnect('slack', teamId, channelId, rest[0]);
          if (link) this.notifier.forget(link.roomId);
          return { response_type: 'in_channel', text: CHAT.disconnected };
        }
      }

      const link = await this.chat.link('slack', teamId, channelId);
      if (!link) return ephemeral(CHAT.notLinked);
      const roomId = link.roomId;

      switch (sub.toLowerCase()) {
        case '':
        case 'now': {
          const view = await this.chat.now(roomId);
          if (!view) return ephemeral(CHAT.notLinked);
          return { response_type: 'in_channel', ...nowMessage(view) };
        }
        case 'queue': {
          const view = await this.chat.now(roomId);
          return ephemeral(view ? queueMessage(view) : CHAT.queueEmpty);
        }
        case 'skip': {
          const user = await this.user(
            teamId,
            body.user_id ?? '',
            body.user_name ?? 'Slack',
          );
          await this.chat.vote(roomId, user, true);
          return ephemeral(CHAT.voted(true));
        }
        case 'add': {
          if (!arg) return ephemeral(CHAT.addUsage);
          const user = await this.user(
            teamId,
            body.user_id ?? '',
            body.user_name ?? 'Slack',
          );
          if (parseYouTubeVideo(arg)) {
            const r = await this.chat.add(roomId, user, arg);
            return ephemeral(CHAT.added(r.title));
          }
          // Searching can take a moment: answer now, results follow.
          const url = body.response_url ?? '';
          void this.chat
            .find(roomId, user, arg)
            .then((results) =>
              this.slack.respond(url, {
                replace_original: true,
                ...searchMessage(arg, results),
              }),
            )
            .catch((e: unknown) =>
              this.slack.respond(url, {
                replace_original: true,
                text: chatError(e),
              }),
            );
          return ephemeral(CHAT.searching(arg));
        }
        default:
          return ephemeral(CHAT.help);
      }
    } catch (e) {
      return ephemeral(chatError(e));
    }
  }

  // ------------------------------------------------------------ buttons

  @Post('interactions')
  @HttpCode(200)
  interactions(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Form,
  ): string {
    this.verify(req);
    let p: SlackAction;
    try {
      p = JSON.parse(body.payload ?? '{}') as SlackAction;
    } catch {
      return '';
    }
    if (p.type !== 'block_actions' || !p.actions?.length) return '';
    // Acknowledge at once; the outcome is reported through response_url.
    void this.handleAction(p).catch((e: unknown) =>
      this.logger.warn(`slack action failed: ${String(e)}`),
    );
    return '';
  }

  private async handleAction(p: SlackAction): Promise<void> {
    const a = p.actions![0];
    const reply = (text: string, replace = false) =>
      p.response_url
        ? this.slack.respond(p.response_url, {
            text,
            replace_original: replace,
          })
        : Promise.resolve();
    if (a.action_id === 'open_room') return;
    const teamId = p.team?.id ?? p.user?.team_id ?? '';
    const channelId = p.channel?.id ?? '';
    const link = await this.chat.link('slack', teamId, channelId);
    if (!link) return reply(CHAT.notLinked);
    try {
      const user = await this.user(
        teamId,
        p.user?.id ?? '',
        p.user?.username ?? p.user?.name ?? 'Slack',
      );
      switch (a.action_id) {
        case 'vote_yes':
        case 'vote_no': {
          const approve = a.action_id === 'vote_yes';
          await this.chat.vote(link.roomId, user, approve, a.value);
          return reply(CHAT.voted(approve));
        }
        case 'react': {
          if (!(REACTIONS as readonly string[]).includes(a.value ?? '')) return;
          await this.chat.react(link.roomId, user, a.value as Reaction);
          return;
        }
        case 'add': {
          const r = await this.chat.add(
            link.roomId,
            user,
            `https://youtu.be/${a.value ?? ''}`,
          );
          return reply(CHAT.added(r.title), true);
        }
      }
    } catch (e) {
      await reply(chatError(e));
    }
  }
}

interface SlackAction {
  type?: string;
  user?: { id?: string; username?: string; name?: string; team_id?: string };
  team?: { id?: string };
  channel?: { id?: string };
  response_url?: string;
  actions?: { action_id?: string; value?: string }[];
}
