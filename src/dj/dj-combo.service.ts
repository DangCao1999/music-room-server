import { Injectable } from '@nestjs/common';
import { DjService } from '../ai/dj.service';
import { AppError } from '../common/app-error';
import {
  type DjAction,
  type DjStep,
  type ErrorCode,
  normalizeQuery,
  type QueueItemView,
} from '../contracts';
import type { Member } from '../generated/prisma/client';
import { LibraryService } from '../library/library.service';
import { InnerTubeProvider } from '../music/innertube.provider';
import { SearchService } from '../music/search.service';
import { PlaybackService } from '../playback/playback.service';
import { QueueService } from '../queue/queue.service';
import type { Actor } from '../state/room-state.service';
import { SnapshotService } from '../state/snapshot.service';
import { etaSec } from './dj-eta';
import { findFresh } from './dj-fresh';
import type { Pin, Plan, PlanStep, Target } from './dj-plan';

/** The song cannot go in, but the next candidate might. */
const TRY_NEXT: ErrorCode[] = [
  'ALREADY_QUEUED',
  'TRACK_BLOCKED',
  'TRACK_TOO_LONG',
  'PLAYED_RECENTLY',
  'TRACK_NOT_EMBEDDABLE',
  'TRACK_NOT_FOUND',
  'TRACK_LIVE',
];
/**
 * A song asked for by name: only another upload of the same song that can play. Never around a
 * block, and "đã phát gần đây" / "đang chờ" are the answer, not a reason to pick another version.
 */
const TRY_NEXT_EXACT: ErrorCode[] = [
  'TRACK_TOO_LONG',
  'TRACK_NOT_EMBEDDABLE',
  'TRACK_NOT_FOUND',
  'TRACK_LIVE',
];
/** No further song of this request can go in. */
const STOP_ADDING: ErrorCode[] = ['QUEUE_LIMIT', 'FORBIDDEN', 'RATE_LIMITED'];
/** Candidates tried beyond the songs wanted (each try is one of the asker's adds). */
const SPARE_TRIES = 4;

export type AiPicks = (
  text: string,
  count: number,
) => Promise<{ artist: string; song: string }[] | null>;

interface Run {
  me: Member;
  actor: Actor;
  steps: DjStep[];
  /** Sent with the first song that goes in. */
  wish?: string;
  /** The asker can add no more (queue limit…). */
  full: boolean;
  aiPicks: AiPicks;
}

function failed(action: DjAction, e: unknown): DjStep {
  if (e instanceof AppError)
    return {
      action,
      ok: false,
      errorCode: e.code,
      ...(e.params ? { errorParams: e.params } : {}),
    };
  throw e;
}

function matches(item: QueueItemView, title: string): boolean {
  const q = normalizeQuery(title);
  return Boolean(q) && normalizeQuery(item.track.title).includes(q);
}

/**
 * Carries out a combo plan (dj-plan) as the asker, step by step, through the same services as
 * the room page: every right and limit applies. Never throws for a refused step: it is
 * reported in the answer, and the next steps still run.
 */
@Injectable()
export class DjComboService {
  constructor(
    private readonly queue: QueueService,
    private readonly playback: PlaybackService,
    private readonly library: LibraryService,
    private readonly snapshots: SnapshotService,
    private readonly search: SearchService,
    private readonly innertube: InnerTubeProvider,
    private readonly dj: DjService,
  ) {}

  async run(
    plan: Plan,
    me: Member,
    actor: Actor,
    aiPicks: AiPicks,
  ): Promise<DjStep[]> {
    const run: Run = {
      me,
      actor,
      steps: [],
      wish: plan.wish,
      full: false,
      aiPicks,
    };
    for (const step of plan.steps) await this.step(run, step);
    return run.steps;
  }

  private async step(run: Run, s: PlanStep): Promise<void> {
    switch (s.do) {
      case 'add':
        for (const title of s.titles)
          await this.addSongs(run, this.searchIds(run, title), 1, {
            pin: s.pin,
            query: title,
            exact: true,
          });
        return;
      case 'addArtist': {
        const { videos, verified } = await findFresh(
          { innertube: this.innertube, search: this.search },
          run.me.id,
          s.artist,
          s.mode,
        );
        return this.addSongs(
          run,
          videos.map((v) => v.externalId),
          s.count,
          {
            pin: s.pin,
            query: s.artist,
            fresh: s.mode !== 'top' && verified ? s.mode : null,
          },
        );
      }
      case 'addVague': {
        const picks = await run.aiPicks(s.text, s.count);
        if (picks === null) {
          run.steps.push({ action: 'add', ok: false, reason: 'busy' });
          return;
        }
        return this.addSongs(run, this.pickIds(run, picks), s.count, {
          pin: s.pin,
          query: s.text,
        });
      }
      case 'addFrom': {
        const tracks =
          s.source === 'played'
            ? (await this.library.roomLibrary(run.actor, 'recent')).items.map(
                (i) => i.track,
              )
            : (await this.library.listFavorites(run.actor)).tracks;
        return this.addSongs(
          run,
          tracks.map((t) => t.externalId),
          s.count,
          { pin: s.pin },
        );
      }
      case 'heart':
        return this.heart(run, s.target);
      case 'remove':
        return this.remove(run, s.target);
      case 'replace':
        return this.replace(run, s.from, s.to);
      case 'skip':
        return this.skip(run);
      case 'pause':
      case 'resume':
        return this.control(run, s.do);
    }
  }

  // ------------------------------------------------------------------ adding

  /** A song by name: results whose title holds the name first ("Một Nhà" before "MỘT ft …"). */
  private async *searchIds(run: Run, query: string): AsyncGenerator<string> {
    const { results } = await this.search.search(run.me.id, query);
    const q = normalizeQuery(query);
    const named = (title: string) => normalizeQuery(title).includes(q);
    const ranked = [
      ...results.filter((r) => named(r.title)),
      ...results.filter((r) => !named(r.title)),
    ];
    for (const r of ranked.slice(0, 3)) yield r.externalId;
  }

  /** Lazily: the next pick is looked up only when the previous one could not go in. */
  private async *pickIds(
    run: Run,
    picks: { artist: string; song: string }[],
  ): AsyncGenerator<string> {
    for (const p of picks) {
      const known = await this.dj.findKnown(p.artist, p.song);
      if (known) {
        yield known.externalId;
        continue;
      }
      const { results } = await this.search.search(
        run.me.id,
        `${p.artist} ${p.song}`,
      );
      if (results[0]) yield results[0].externalId;
    }
  }

  /** Adds up to `count` of the candidates, as the asker; reports each song (or why none). */
  private async addSongs(
    run: Run,
    ids: Iterable<string> | AsyncIterable<string>,
    count: number,
    opts: {
      pin?: Pin;
      query?: string;
      fresh?: 'latest' | 'popular' | null;
      /** Asked for by name (see TRY_NEXT_EXACT). */
      exact?: boolean;
    },
  ): Promise<void> {
    if (run.full) return;
    let added = 0;
    let tries = 0;
    for await (const id of ids) {
      if (added >= count || ++tries > count + SPARE_TRIES) break;
      const wish = run.wish;
      try {
        const { queueItemId } = await this.queue.add(run.actor, {
          input: `https://www.youtube.com/watch?v=${id}`,
          ...(wish ? { wishMessage: wish } : {}),
        });
        if (wish) run.wish = undefined;
        added++;
        const step = await this.placed(run, queueItemId);
        run.steps.push({
          ...step,
          ...(wish ? { wish } : {}),
          fresh: opts.fresh ?? null,
        });
        if (opts.pin && added === 1 && step.position !== 0)
          await this.pin(run, queueItemId, step, opts.pin === 'now');
      } catch (e) {
        const next = opts.exact ? TRY_NEXT_EXACT : TRY_NEXT;
        if (e instanceof AppError && next.includes(e.code)) continue;
        run.steps.push({
          ...failed('add', e),
          ...(opts.query ? { query: opts.query } : {}),
        });
        if (e instanceof AppError && STOP_ADDING.includes(e.code))
          run.full = true;
        return;
      }
    }
    if (added < count)
      run.steps.push({
        action: 'add',
        ok: false,
        reason: 'notFound',
        ...(opts.query ? { query: opts.query } : {}),
        // "2 bài chill" but only one could go in.
        ...(added ? { got: added, wanted: count } : {}),
      });
  }

  /** Where the song went: on air at once (idle room, position 0) or its place in the queue. */
  private async placed(run: Run, queueItemId: string): Promise<DjStep> {
    const snap = await this.snapshots.build(run.actor.roomId);
    if (snap?.nowPlaying?.item.id === queueItemId)
      return {
        action: 'add',
        ok: true,
        queueItemId,
        track: snap.nowPlaying.item.track,
        position: 0,
        etaSec: 0,
      };
    const at = snap?.queue.findIndex((q) => q.id === queueItemId) ?? -1;
    return {
      action: 'add',
      ok: true,
      queueItemId,
      ...(at >= 0 ? { track: snap!.queue[at].track } : {}),
      position: at >= 0 ? at + 1 : undefined,
      etaSec: snap && at >= 0 ? etaSec(snap, at) : null,
    };
  }

  /** "Ngay sau bài này" (pin next) / "luôn" (pin next and skip to it): control rights. */
  private async pin(
    run: Run,
    queueItemId: string,
    added: DjStep,
    now: boolean,
  ): Promise<void> {
    try {
      await this.queue.pinNext(run.actor, queueItemId);
      if (now) {
        const snap = await this.snapshots.build(run.actor.roomId);
        const np = snap?.nowPlaying;
        if (np)
          await this.playback.control(run.actor, {
            action: 'skip',
            queueItemId: np.item.id,
          });
      }
      run.steps.push({
        action: 'pin',
        ok: true,
        queueItemId,
        ...(added.track ? { track: added.track } : {}),
        now,
      });
    } catch (e) {
      run.steps.push({
        ...failed('pin', e),
        ...(added.track ? { track: added.track } : {}),
      });
    }
  }

  // ------------------------------------------------------------------ the queue

  private async queueNow(run: Run): Promise<QueueItemView[]> {
    return (await this.snapshots.build(run.actor.roomId))?.queue ?? [];
  }

  /** The queue songs a heart / remove means, in queue order. */
  private pick(queue: QueueItemView[], t: Target, me: Member): QueueItemView[] {
    let items = queue;
    if (t.mine) items = items.filter((q) => q.addedBy?.id === me.id);
    if (t.by) {
      const who = normalizeQuery(t.by);
      items = items.filter((q) =>
        normalizeQuery(q.addedBy?.displayName ?? '').includes(who),
      );
    }
    if (t.titles?.length)
      items = items.filter((q) => t.titles!.some((title) => matches(q, title)));
    if (t.last) items = items.slice(-t.last);
    return items;
  }

  /** One heart per member in this room (QueueService.heart moves it): the first match gets it. */
  private async heart(run: Run, t: Target): Promise<void> {
    const items = this.pick(await this.queueNow(run), t, run.me);
    const first = items[0];
    if (!first) {
      run.steps.push({
        action: 'heart',
        ok: false,
        reason: 'notFound',
        ...(t.titles ? { query: t.titles.join(', ') } : {}),
      });
      return;
    }
    const base = {
      action: 'heart' as const,
      queueItemId: first.id,
      track: first.track,
    };
    // Hearting again would take the heart back.
    if (first.heartedBy.includes(run.me.id)) {
      run.steps.push({ ...base, ok: true, reason: 'alreadyHearted' });
      return;
    }
    try {
      await this.queue.heart(run.actor, first.id);
      run.steps.push({
        ...base,
        ok: true,
        ...(items.length > 1 || t.all || t.by || t.mine
          ? { reason: 'oneHeart' as const }
          : {}),
      });
    } catch (e) {
      run.steps.push({ ...failed('heart', e), track: first.track });
    }
  }

  private async remove(run: Run, t: Target): Promise<void> {
    const items = this.pick(await this.queueNow(run), t, run.me);
    if (!items.length) {
      run.steps.push({
        action: 'remove',
        ok: false,
        reason: 'notFound',
        ...(t.titles ? { query: t.titles.join(', ') } : {}),
      });
      return;
    }
    const admin = run.me.role === 'ADMIN';
    const others = items.filter((q) => q.addedBy?.id !== run.me.id && !admin);
    for (const q of items) {
      if (others.includes(q)) continue;
      try {
        await this.queue.remove(run.actor, q.id);
        run.steps.push({
          action: 'remove',
          ok: true,
          queueItemId: q.id,
          track: q.track,
        });
      } catch (e) {
        run.steps.push({ ...failed('remove', e), track: q.track });
      }
    }
    // Other people's songs: only the admin removes them.
    if (others.length)
      run.steps.push({
        action: 'remove',
        ok: false,
        reason: 'notMine',
        ...(others.length === 1 ? { track: others[0].track } : {}),
      });
  }

  /** "Đổi bài X của tôi thành Y": remove my X, add Y (with the request's wish, if any). */
  private async replace(run: Run, from: string, to: string): Promise<void> {
    const mine = this.pick(
      await this.queueNow(run),
      { mine: true, titles: [from] },
      run.me,
    );
    if (!mine[0]) {
      run.steps.push({
        action: 'remove',
        ok: false,
        reason: 'notFound',
        query: from,
      });
      return;
    }
    try {
      await this.queue.remove(run.actor, mine[0].id);
      run.steps.push({
        action: 'remove',
        ok: true,
        queueItemId: mine[0].id,
        track: mine[0].track,
      });
    } catch (e) {
      run.steps.push({ ...failed('remove', e), track: mine[0].track });
      return;
    }
    await this.addSongs(run, this.searchIds(run, to), 1, {
      query: to,
      exact: true,
    });
  }

  // ------------------------------------------------------------------ playback

  /** Control rights skip at once; everyone else votes. */
  private async skip(run: Run): Promise<void> {
    const np = (await this.snapshots.build(run.actor.roomId))?.nowPlaying;
    if (!np) {
      run.steps.push({ action: 'skip', ok: false, reason: 'nothingPlaying' });
      return;
    }
    const control = run.me.role === 'ADMIN' || run.me.canControl;
    const action = control ? 'skip' : 'vote';
    try {
      if (control)
        await this.playback.control(run.actor, {
          action: 'skip',
          queueItemId: np.item.id,
        });
      else await this.playback.voteSkip(run.actor, np.item.id);
      run.steps.push({ action, ok: true, track: np.item.track });
    } catch (e) {
      run.steps.push({ ...failed(action, e), track: np.item.track });
    }
  }

  private async control(run: Run, what: 'pause' | 'resume'): Promise<void> {
    const np = (await this.snapshots.build(run.actor.roomId))?.nowPlaying;
    if (!np) {
      run.steps.push({ action: what, ok: false, reason: 'nothingPlaying' });
      return;
    }
    try {
      await this.playback.control(run.actor, {
        action: what === 'pause' ? 'pause' : 'play',
        queueItemId: np.item.id,
      });
      run.steps.push({ action: what, ok: true, track: np.item.track });
    } catch (e) {
      run.steps.push({ ...failed(what, e), track: np.item.track });
    }
  }
}
