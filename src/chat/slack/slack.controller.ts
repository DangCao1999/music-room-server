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
import { type Reaction, REACTIONS } from '../../contracts';
import { type ChatUser, ChatRoomService } from '../chat-room.service';
import { CHAT, chatError } from '../chat-text';
import { SlackApi } from './slack-api.service';
import {
  SlackCommands,
  type SlackCtx,
  type SlackOut,
} from './slack-commands.service';
import { verifySlackSignature } from './slack-verify';

type Form = Record<string, string | undefined>;
type Reply = Record<string, unknown>;

/** Event ids already handled (Slack resends an event it thinks we missed). */
const SEEN_MAX = 500;

/**
 * Đợt 3: Slack's "/music" slash command, "@Music Room" mentions (they also work inside
 * threads, where slash commands cannot be typed) and the buttons on the bot's messages.
 * Every request is checked against the app's signing secret; Slack always gets its reply
 * within 3 seconds and slow work follows separately.
 */
@Controller('slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);
  private readonly seen = new Set<string>();

  constructor(
    private readonly slack: SlackApi,
    private readonly chat: ChatRoomService,
    private readonly commands: SlackCommands,
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

  // ------------------------------------------------------------ /music

  @Post('commands')
  @HttpCode(200)
  async command(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Form,
  ): Promise<Reply> {
    this.verify(req);
    const ctx: SlackCtx = {
      teamId: body.team_id ?? '',
      channelId: body.channel_id ?? '',
      userId: body.user_id ?? '',
      userName: body.user_name ?? '',
      mention: false,
      threadTs: null,
    };
    const answer = await this.commands.run(ctx, body.text ?? '');
    const url = body.response_url;
    if (answer.later && url)
      void answer.later.then((out) =>
        this.slack.respond(url, {
          replace_original: true,
          text: out.text,
          ...(out.blocks ? { blocks: out.blocks } : {}),
        }),
      );
    return asResponse(answer.now);
  }

  // ------------------------------------------------------------ @Music Room (Events API)

  @Post('events')
  @HttpCode(200)
  events(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: SlackEventBody,
  ): Reply | string {
    this.verify(req);
    if (body.type === 'url_verification')
      return { challenge: body.challenge ?? '' };
    // A retry means Slack did not see our 200 in time; the first delivery is being handled.
    if (req.header('x-slack-retry-num')) return '';
    const e = body.event;
    if (body.type !== 'event_callback' || e?.type !== 'app_mention' || e.bot_id)
      return '';
    if (body.event_id) {
      if (this.seen.has(body.event_id)) return '';
      this.seen.add(body.event_id);
      if (this.seen.size > SEEN_MAX)
        this.seen.delete(this.seen.values().next().value as string);
    }
    void this.mention(body.team_id ?? e.team ?? '', e).catch((err: unknown) =>
      this.logger.warn(`slack mention failed: ${String(err)}`),
    );
    return '';
  }

  private async mention(teamId: string, e: SlackMention): Promise<void> {
    const channel = e.channel ?? '';
    const user = e.user ?? '';
    // Answer in the thread it was typed in, or start one under the mention.
    const threadTs = e.thread_ts ?? e.ts ?? null;
    const text = (e.text ?? '').replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, ' ').trim();
    const ctx: SlackCtx = {
      teamId,
      channelId: channel,
      userId: user,
      // An app_mention event has no name: users.info provides it (or a placeholder).
      userName: '',
      mention: true,
      threadTs,
    };
    const deliver = (out: SlackOut) =>
      out.visibility === 'public'
        ? this.slack
            .post(channel, out.text, out.blocks ?? [], threadTs)
            .then(() => undefined)
        : this.slack.postEphemeral(
            channel,
            user,
            out.text,
            out.blocks ?? [],
            threadTs,
          );
    const answer = await this.commands.run(ctx, text);
    await deliver(answer.now);
    if (answer.later) await deliver(await answer.later);
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

  private async user(
    teamId: string,
    userId: string,
    fallbackName: string,
  ): Promise<ChatUser> {
    const p = await this.slack.profile(userId);
    return {
      platform: 'slack',
      teamId,
      userId,
      name: p.name || fallbackName,
      email: p.email,
    };
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
        p.user?.username ?? p.user?.name ?? '',
      );
      // react_heart / react_fire / react_clap: the emoji is in the value.
      const action = a.action_id?.startsWith('react_') ? 'react' : a.action_id;
      switch (action) {
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

function asResponse(out: SlackOut): Reply {
  return {
    response_type: out.visibility === 'public' ? 'in_channel' : 'ephemeral',
    text: out.text,
    ...(out.blocks ? { blocks: out.blocks } : {}),
  };
}

interface SlackMention {
  type?: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  team?: string;
  bot_id?: string;
}

interface SlackEventBody {
  type?: string;
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event?: SlackMention;
}

interface SlackAction {
  type?: string;
  user?: { id?: string; username?: string; name?: string; team_id?: string };
  team?: { id?: string };
  channel?: { id?: string };
  response_url?: string;
  actions?: { action_id?: string; value?: string }[];
}
