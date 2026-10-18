# Trợ lý `@DJ` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@DJ` trong chat phòng và `@Music Room` / `/music` trong Slack hiểu câu nói thường: tự tìm và thêm bài cho yêu cầu mơ hồ (kể cả "bài mới / hot của <nghệ sĩ>" tra YouTube thật), trả lời câu hỏi thông tin, và chỉ cách (lớp chỉ dẫn chiếu sáng nút) cho việc người dùng tự làm được; bỏ tab "Hỏi DJ".

**Architecture:** Server có module `src/dj/`: bộ luật thuần (không gọi AI) → nếu không khớp thì một lần gọi `AiService.json` → hành động qua đúng service của web với actor là người hỏi → trả `DjReply` có cấu trúc. Tin trả lời lưu là `ChatMessage` (`kind='dj'`, `payload`) và phát như chat thường; Slack dựng câu chữ từ cùng `DjReply`. Client vẽ tin DJ từ mẫu i18n, có lớp chỉ dẫn `GuideSpotlight` tìm nút qua `data-guide`.

**Tech Stack:** NestJS 11 + Socket.IO + Prisma 7 (Postgres), youtubei.js 18; Next.js 16 + React 19 + Tailwind 4; zod contracts dùng chung.

**Spec:** `docs/specs/2026-10-18-dj-chat-design.md` (mockup: `music-room-client/.superpowers/brainstorm/dj-chat/`)

## Global Constraints

- Không test tự động (quy ước dự án). Mỗi task kết thúc bằng `npm run lint && npm run typecheck` ở repo đã đổi (server: `npx eslint --fix <file>` để định dạng — không dùng `npx prettier`); client chạy `npm run build` chỉ khi không có `next dev` đang chạy song song cùng thư mục `.next`.
- Không commit / push / mở PR khi người dùng chưa cho phép. Nhánh: server `feat/dj-chat` từ `origin/develop`, client `feat/dj-chat` từ `origin/develop`.
- DB dev phải là `localhost:55432/musicroom` (kiểm tra `.env` dòng 1 trước khi `prisma migrate`). Không thao tác trên Neon / prod.
- Trước khi bump `CONTRACTS_VERSION`: `git fetch origin && git show origin/develop:src/contracts/version.ts` (server) — đồng đội có thể đã bump; bump lên số kế tiếp của bản mới nhất.
- Mọi chữ hiện cho người dùng có ở cả `vi.ts` và `en.ts` (client) — riêng `content` lưu DB và câu Slack là tiếng Việt (`chat-text.ts` như hiện tại).
- Biểu tượng chỉ lucide (`Disc3`, `Pointer`, `Undo2`, `Music`); không emoji / ký tự unicode làm biểu tượng.
- Tương phản WCAG AA trên 13 chủ đề (sáng: hifi82, Sài Gòn…; tối: còn lại).
- AI chỉ chuỗi miễn phí sẵn có (`AiService.json`), tối đa **1 lần gọi AI / yêu cầu**; câu theo luật **0 lần**. Lượt AI: `DJ_AI_PER_HOUR` (mặc định 10) / thành viên / giờ.
- Hành động của DJ luôn đi qua service của web với actor là người hỏi (`QueueService.add`, `QueueService.remove`) — không đường tắt quyền.
- Câu DJ hiện cho người dùng dựng từ mẫu có sẵn + dữ liệu; không hiện chữ tự do do AI viết.
- Dev chạy: server `npm run start:dev` (cổng 3001), client `NEXT_PUBLIC_SERVER_URL=http://localhost:3001 npm run dev` (cổng 3000). Không `npm run build` server khi `nest start --watch` đang chạy.
- Sổ tiến độ: `music-room-client/.superpowers/sdd/2026-10-18-dj-chat-plan/progress.md` (ngoài repo).

## Review Focus

1. Câu có chữ "dj" bình thường ("dj hôm nay chọn bài hay ghê", email `dj@x.com`) không gọi DJ — chỉ `@DJ` là một từ riêng. → Task 2 bước kiểm tra luật.
2. Câu tên bài rõ ràng ("bật bài Nàng Thơ") phải ra `guide add` (0 lần AI) chứ không thêm bài; câu có từ mơ hồ / "mới" mới tới AI hoặc tra thật. → Task 2, Task 4.
3. Người hỏi đầy hàng chờ (`QUEUE_LIMIT`) / bài bị chặn / vừa phát: DJ thử bài kế, hết bài thì nói đúng lý do — không thêm vượt giới hạn. → Task 4.
4. Tất cả nhà cung cấp AI đang nghỉ (Gemini 429 đã thấy trên dev): DJ trả `busy` trong vài giây, phần luật vẫn chạy. → Task 4.
5. Slack: `@Music Room skip giúp tôi` không còn bỏ phiếu; `skip` đứng một mình vẫn bỏ phiếu; `add Nàng Thơ` vẫn là lệnh cứng. → Task 5.
6. "Chỉ cho tôi" khi nút đích không có (không phải quản trị viên, chủ đề không có nút, bài đã đổi) → chỉ hiện câu, không lớp phủ kẹt. → Task 7.

---

### Task 1: Contracts, migration, view (server)

**Files:**
- Create: `src/contracts/dj.ts`
- Modify: `src/contracts/index.ts` (export), `src/contracts/snapshot.ts:246` (`ChatMessageView`), `src/contracts/schemas.ts:275` (bỏ `dj:ask`), `src/contracts/events.ts:64` (bỏ kết quả `dj:ask`), `src/contracts/constants.ts` (bỏ `LIMITS.djPrompt` nếu không còn dùng), `src/contracts/version.ts`
- Modify: `prisma/schema.prisma` (`ChatMessage`), `src/state/views.ts:79` (`toChatView`), `src/config/env.ts` (`DJ_AI_PER_HOUR`)
- Create: `prisma/migrations/<ts>_chat_message_kind/migration.sql` (do `prisma migrate dev` sinh)

**Interfaces:**
- Produces (`src/contracts/dj.ts`):
  ```ts
  export const GUIDE_TARGETS = ['skip','save','heart','pause','lyrics','listen','share','mini','add','myItem','block'] as const;
  export type GuideTarget = (typeof GUIDE_TARGETS)[number];
  export const INFO_KINDS = ['nowPlaying','whoPicked','myNext','queueLength','myCount'] as const;
  export type InfoKind = (typeof INFO_KINDS)[number];
  export interface DjInfo { kind: InfoKind; title?: string; pickedBy?: string | null; ahead?: number; etaSec?: number | null; count?: number; totalSec?: number | null; queueItemId?: string }
  export type DjReplyKind = 'guide' | 'info' | 'added' | 'hello' | 'other' | 'busy' | 'denied' | 'error';
  export interface DjReply {
    kind: DjReplyKind;
    forMemberId: string; forName: string;
    guide?: GuideTarget; query?: string; queueItemId?: string;   // guide add → query; guide myItem / added → queueItemId
    info?: DjInfo;
    track?: TrackSummary; position?: number; etaSec?: number | null; fresh?: 'latest' | 'popular' | null;  // added
    errorCode?: ErrorCode; retryAfterSec?: number;               // denied / error / busy
  }
  ```
- Produces: `ChatMessageView` thêm `kind?: 'dj'` và `dj?: DjReply`; Prisma `ChatMessage.kind String @default("member")`, `ChatMessage.payload Json?`; `env.DJ_AI_PER_HOUR: number` (zod `z.coerce.number().int().min(1).default(10)`).

- [ ] **Step 1:** Kiểm tra `.env` dòng 1 là `localhost:55432`; `git fetch origin` và đọc `CONTRACTS_VERSION` trên `origin/develop`.
- [ ] **Step 2:** Viết `dj.ts`, sửa `ChatMessageView`, bỏ `dj:ask` (schema + result), bump `CONTRACTS_VERSION`.
- [ ] **Step 3:** Thêm 2 cột vào `ChatMessage`; `npx prisma migrate dev --name chat_message_kind`.
- [ ] **Step 4:** `toChatView`: `kind === 'dj'` → thêm `kind: 'dj', dj: payload as DjReply`; tin thường giữ nguyên hình dạng cũ (không thêm trường).
- [ ] **Step 5:** `npm run lint && npm run typecheck` — Expected: chỉ còn lỗi ở chỗ đang gọi `dj:ask` (gateway, `DjService.ask`) — để Task 4 sửa; không lỗi nào khác.

### Task 2: Bộ luật (server, thuần)

**Files:**
- Create: `src/dj/dj-rules.ts`

**Interfaces:**
- Produces:
  ```ts
  export function extractDjRequest(content: string): string | null;   // null = không có @DJ (từ riêng, không phân biệt hoa thường); '' = chỉ có @DJ
  export type RuleMatch =
    | { kind: 'guide'; guide: GuideTarget; query?: string }
    | { kind: 'info'; info: InfoKind }
    | { kind: 'hello' }
    | { kind: 'fresh'; artist: string; mode: 'latest' | 'popular' };
  export function matchRules(request: string): RuleMatch | null;      // null = mơ hồ → AI
  export function isSlackCommand(text: string): boolean;              // dạng lệnh cứng theo bảng của spec
  ```
- Quy ước: chuẩn hoá bằng `normalizeQuery` (contracts) trước khi so khớp; từ khoá vi (có / không dấu) + en. "Thêm/bật/mở bài <tên>" là `guide add` với `query = <tên>` chỉ khi `<tên>` không chứa từ mơ hồ (`moi, moi nhat, trending, hot, giong, chill, vui, buon, vai bai, gi do, nao do, ngau nhien, random, latest, new, popular, something, some`); `fresh` khi có mẫu "bài (mới|mới nhất|vừa ra) của <X>" → `latest`, "(trending|hot|đang hot) của <X>" → `popular`, "<X> có bài (gì) mới" → `latest`. `isSlackCommand`: `''`, `skip|now|queue|help|here` đứng một mình (cho phép `.!?` cuối), `add <link YouTube>`, `add <≤8 từ không có từ mơ hồ>`, mọi câu bắt đầu bằng `connect`/`disconnect`.

- [ ] **Step 1:** Viết `dj-rules.ts`.
- [ ] **Step 2:** Kiểm tra bằng script tạm (không commit) `scratchpad/dj-rules-check.ts` chạy `npx tsx`: các ca sau phải ra đúng:
  - `extractDjRequest('@DJ skip giúp tôi')` → `'skip giúp tôi'`; `extractDjRequest('@dj')` → `''`; `extractDjRequest('dj hôm nay hay ghê')` → `null`; `extractDjRequest('mail dj@x.com')` → `null`.
  - `matchRules('skip giúp tôi bài này')` → `{kind:'guide',guide:'skip'}`; `matchRules('next bài đi')` → guide skip; `matchRules('lưu bài này')` → guide save.
  - `matchRules('bật bài Nàng Thơ')` → `{kind:'guide',guide:'add',query:'Nàng Thơ'}`; `matchRules('bật vài bài chill')` → `null`.
  - `matchRules('còn bao nhiêu bài nữa tới bài của tôi')` → info myNext; `matchRules('bài này của ai')` → info whoPicked; `matchRules('đang phát bài gì')` → info nowPlaying.
  - `matchRules('bật dùm bài mới trending của Jack')` → `{kind:'fresh',artist:'Jack',mode:'popular'}`; `matchRules('bài mới nhất của Sơn Tùng')` → fresh latest.
  - `matchRules('')` → hello; `matchRules('bài gì giống bài đang phát')` → `null`.
  - `isSlackCommand('skip')` true; `isSlackCommand('skip giúp tôi bài này')` false; `isSlackCommand('add Nàng Thơ')` true; `isSlackCommand('add bài mới trending của Jack')` false; `isSlackCommand('connect ABC 1234')` true.
- [ ] **Step 3:** `npm run lint` (file mới sạch).

### Task 3: Tra bài mới thật (server)

**Files:**
- Modify: `src/music/innertube.provider.ts:64` (`search`)
- Create: `src/dj/dj-fresh.ts`

**Interfaces:**
- Consumes: `InnerTubeProvider`, `SearchService.search(memberId, q)` (fallback).
- Produces:
  - `InnerTubeProvider.search(q: string, max: number, filters?: { upload_date?: 'week'|'month'|'year'; prioritize?: 'popularity' }): Promise<{ videos: FoundVideo[]; more: boolean }>` — truyền `filters` vào `yt.search(q, { type: 'video', ...filters })`; gọi cũ không đổi hành vi.
  - `findFresh(deps, artist: string, mode: 'latest'|'popular'): Promise<{ videos: FoundVideo[]; verified: boolean }>` trong `dj-fresh.ts`: `latest` → `{upload_date:'month'}`, rỗng thì `{upload_date:'year'}`; `popular` → `{upload_date:'year', prioritize:'popularity'}`; lọc: 60–600 s, tiêu đề hoặc kênh chứa tên nghệ sĩ (so `normalizeQuery`), bỏ tiêu đề có `reaction|live|full album|tổng hợp|playlist|karaoke|cover|lyrics?`; ưu tiên kênh có `official|vevo|topic` hoặc trùng tên nghệ sĩ. InnerTube lỗi / không khả dụng → `SearchService.search` với `"<artist> mới nhất"`, `verified: false`.

- [ ] **Step 1:** Mở rộng `search` với `filters`; viết `findFresh`.
- [ ] **Step 2:** Script tạm gọi `findFresh` (InnerTube thật) cho `('Sơn Tùng M-TP','latest')` và `('Jack','popular')` — Expected: mỗi lần ≥ 1 video, `verified: true`, tiêu đề / kênh chứa tên nghệ sĩ, không có "reaction" / "live".
- [ ] **Step 3:** `npm run lint && npm run typecheck`.

### Task 4: Bộ não DJ + chat phòng (server)

**Files:**
- Create: `src/dj/dj-brain.service.ts`, `src/dj/dj-text.ts`, `src/dj/dj.module.ts`
- Modify: `src/ai/dj.service.ts` (bỏ `ask`, tách `knownTitles(roomId)` + `resolvePicks(roomId, picks, settings)` dùng chung), `src/social/social.service.ts` (`postDj`), `src/realtime/realtime.gateway.ts` (`chat:send` gọi DJ; bỏ `dj:ask`, `DJ_LIMIT`), `src/app.module.ts`

**Interfaces:**
- Consumes: Task 1 types, Task 2 `extractDjRequest` / `matchRules`, Task 3 `findFresh`, `AiService.json`, `QueueService.add(actor,{input})`, `SnapshotService.build(roomId)`, `RateLimiter`.
- Produces:
  - `DjBrainService.handle(input: { roomId: string; memberId: string; request: string; platform: 'room' | 'slack' }): Promise<DjReply>` — luật → (nếu `null`) AI 1 lần → hành động. Tuần tự theo `memberId` (map Promise). Không bao giờ ném lỗi ra ngoài: lỗi biết được → `denied`/`error` kèm `errorCode`, AI `null` → `busy`, hết lượt AI → `busy` kèm `retryAfterSec`.
  - `DjBrainService.onRoomChat(actor: Actor, content: string): void` — nhận `content` **đã qua `maskBlocked`** (`SocialService.chat` trả về chữ đã lưu: đổi chữ ký thành `Promise<string>`); `extractDjRequest`; có thì `handle(...)` rồi `social.postDj(roomId, reply)`; chạy nền, bắt mọi lỗi (log). `AiService.enabled === false` và luật không khớp → `other` (không tính lượt).
  - `SocialService.postDj(roomId: string, reply: DjReply): Promise<void>` — lưu `ChatMessage{memberId:'dj', displayName:'DJ', kind:'dj', payload: reply, content: djText(reply)}`, phát `chat:receive`, cắt lịch sử `KEEP_CHAT` như `chat`.
  - `djText(reply: DjReply): string` (`dj-text.ts`) — câu tiếng Việt cho `content` / Slack.
  - AI prompt (`dj-brain.service.ts`): system tiếng Việt yêu cầu JSON `{intent, guide?, info?, fresh?:{artist,mode}, items?:[{artist,song}] ≤5}` với danh sách mã `GUIDE_TARGETS` / `INFO_KINDS`; user = `JSON.stringify({request, nowPlaying, known: knownTitles})`; `temperature: 0.2`, `timeoutMs: 12000`. Mã lạ → `other`.
- Hành động:
  - `fresh` → `findFresh` → thêm video đầu tiên thêm được (`QueueService.add(actor, {input: 'https://youtu.be/<id>'})`); lỗi `ALREADY_QUEUED|TRACK_BLOCKED|TRACK_TOO_LONG|PLAYED_RECENTLY` → thử video kế; `QUEUE_LIMIT|RATE_LIMITED` → dừng, `denied`. Thành công → `added` với `fresh: verified ? mode : null`, `position`/`etaSec` tính từ snapshot sau khi thêm (thứ tự `snap.queue`, ETA như `etaTimes` của client: phần còn lại bài đang phát + độ dài các bài trước).
  - `items` → `resolvePicks` (thư viện phòng) rồi `SearchService.search(memberId, "<artist> <song>")` lấy kết quả đầu; thêm như trên.
  - `info` → số liệu từ snapshot (`myNext`: bài đầu tiên của người hỏi trong `snap.queue`, `ahead` = số bài đứng trước, `etaSec`; không có → `info.queueItemId` rỗng, client nói "chưa có bài").
  - `guide` → `{kind:'guide', guide, query?}`; `block` khi người hỏi không phải ADMIN → `denied` (`FORBIDDEN`); `myItem` kèm `queueItemId` bài đầu tiên của người hỏi.
- Lượt AI: `limiter.hit('dj-ai:'+memberId, env.DJ_AI_PER_HOUR, 3600_000)` **chỉ trước khi gọi AI**.

- [ ] **Step 1:** Tách `DjService` (bỏ `ask`), viết `dj-text.ts`, `dj-brain.service.ts`, `dj.module.ts`, `postDj`; gateway: `const saved = await this.social.chat(...)` rồi `this.dj.onRoomChat(actor, saved)`; bỏ handler `dj:ask` và `DJ_LIMIT`.
- [ ] **Step 2:** `npm run lint && npm run typecheck` — Expected: sạch.
- [ ] **Step 3:** Thử trên dev (server `start:dev` đang chạy, phòng E5SHXD, gửi chat bằng script socket tạm `scratchpad/dj-say.cjs <CODE> "<câu>"` in ra tin `chat:receive` của DJ): `@DJ skip giúp tôi` → guide skip, log `AiService` không có dòng mới; `@DJ còn bao nhiêu bài nữa tới bài của tôi` → info myNext; `@DJ bài mới nhất của Sơn Tùng` → added, `fresh:'latest'`; `@DJ bật vài bài chill` → AI gọi 1 lần (log), added hoặc busy; tắt key AI giả lập (đổi `GEMINI_API_KEY` sai trên dev? không — dùng lúc Gemini đang 429 và không có key khác) → busy; gửi 11 câu mơ hồ trong 1 giờ → câu thứ 11 busy kèm `retryAfterSec`.

### Task 5: Slack (server)

**Files:**
- Modify: `src/chat/slack/slack-commands.service.ts:59` (`run`), `src/chat/chat-text.ts:71` (`CHAT.help`), `src/chat/slack/slack-blocks.ts` (dựng `SlackOut` từ `DjReply`), `src/chat/chat-room.service.ts` (cho mượn `member` + `actor` cho DJ: `asMember(roomId, user): Promise<{ member: Member; actor: Actor }>`), `src/chat/chat.module.ts` (import `DjModule`)

**Interfaces:**
- Consumes: Task 2 `isSlackCommand`, Task 4 `DjBrainService.handle`, `djText`.
- Produces: `djSlackOut(reply: DjReply): SlackOut` — `added` → `public`, câu "Đã thêm <bài> cho <người hỏi>, đứng thứ N"; `guide` → `ephemeral`, câu + lệnh tương ứng (`skip`→`/music skip`, `add`→`/music add <query>`, `myItem`/info → `/music queue`), các mã chỉ có trên web → câu + nút `open_room`; luôn kết bằng "Gõ `/music help` để xem mọi lệnh"; `info`/`busy`/`other`/`denied`/`error` → `ephemeral`.

- [ ] **Step 1:** Đầu `run` (sau `help` và `connect`/`disconnect`, sau kiểm tra `link`): nếu `!isSlackCommand(text)` → `{ now: ephemeral('Đang hỏi DJ…'), later: chat.asMember(...).then(m => brain.handle({roomId, memberId: m.member.id, request: text, platform:'slack'})).then(djSlackOut) }`; còn lại giữ switch cũ. Nhánh `default` của switch giữ `help`. Cập nhật `CHAT.help`: liệt kê dạng lệnh ngắn + "Hỏi `@Music Room <câu bất kỳ>` để DJ giúp; câu bạn gửi DJ được chuyển cho AI miễn phí".
- [ ] **Step 2:** `npm run lint && npm run typecheck`.
- [ ] **Step 3:** Script tạm gọi thẳng `SlackCommands.run` qua Nest app context (không cần app Slack thật) với kênh dev đã nối (nếu chưa có `ChatLink` dev → tạo bằng `ChatRoomService.connect` trong script, PIN dev): `skip` → `CHAT.voted`; `skip giúp tôi bài này` → câu chỉ `/music skip`; `add Nàng Thơ` → "Đang tìm…" + 3 kết quả; `add bài mới trending của Jack` → DJ added (public). Xoá `ChatLink` dev đã tạo sau khi thử.

### Task 6: Tin DJ trong chat (client)

**Files:**
- Run: `npm run contracts:sync`
- Create: `src/components/room/DjMessage.tsx`, `src/components/room/DjMentionHint.tsx`
- Modify: `src/components/room/Chat.tsx:57` (`Bubble` → `DjMessage` khi `m.kind === 'dj'`; tô `@DJ` trong tin thường), `ChatComposer` (`:129`, gợi ý `@`), `src/components/host/parts.tsx` (`HostChatLines`: tin DJ hiện `content` với tên "DJ"), `src/i18n/vi.ts`, `src/i18n/en.ts` (nhóm `dj`)

**Interfaces:**
- Consumes: Task 1 `DjReply`, `GuideTarget`; Task 7 `showGuide`.
- Produces:
  - `DjMessage({ m }: { m: ChatMessageView })` — tên "DJ" + `Disc3`, bong bóng viền vàng (mockup 1a/2/3a); câu từ `t.dj.*` theo `reply.kind` (dùng `forName` khi người xem không phải người hỏi, "bạn" khi đúng người hỏi); `added` → thẻ bài (`Thumb` 56px, tiêu đề, kênh · thời lượng) + nút "Gỡ bài này" (`Undo2`) chỉ khi `forMemberId === meId` và bài còn trong `snapshot.queue` → `room.send('queue:remove', { queueItemId })`; `guide` / `info myNext` → nút "Chỉ cho tôi" (`Pointer`) → `showGuide({ target, query, queueItemId })`.
  - `DjMentionHint({ value, onPick })` — hiện khi từ đang gõ bắt đầu bằng `@`; dòng "DJ – trợ lý của phòng", 3 câu mẫu, dòng riêng tư; chọn → thay từ đang gõ bằng `@DJ `; Esc / bấm ra ngoài đóng; điều hướng phím ↑↓ Enter.
  - i18n `dj`: `name`, `hint`, `examples[3]`, `privacy`, `guideIntro.<target>`, `guideTitle.<target>`, `guideBody.<target>` (skip có 2 biến thể: `vote` / `now`), `info.<kind>`, `added`, `addedFresh.latest|popular`, `hello`, `other`, `busy`, `busyIn(min)`, `denied`, `notMine`, `undo`, `showMe`.

- [ ] **Step 1:** Sync contracts; viết i18n vi/en, `DjMessage`, `DjMentionHint`; sửa `Chat.tsx`, `HostChatLines`.
- [ ] **Step 2:** `npm run lint && npm run typecheck`.
- [ ] **Step 3:** Dev: gửi các câu ở Task 4 Step 3 từ ô chat phòng; tin DJ hiện đúng mockup 1a/2/3a/4 ở tủ gỗ và hifi82; tin của người khác có `@DJ` được tô; /host hiện dòng DJ.

### Task 7: Lớp chỉ dẫn (client)

**Files:**
- Create: `src/lib/guide.ts`, `src/components/room/GuideSpotlight.tsx`
- Modify: `src/components/room/RoomFrame.tsx` (gắn `GuideSpotlight`; nghe bus để `setTab('room'|'add')` và thu `ChatOverlay` trên điện thoại), `src/lib/find-songs.ts` (`findSongs(query?: string)` điền sẵn ô tìm), `src/components/room/AddTrackPanel.tsx` (nhận query), và thêm `data-guide` / `data-guide-item` ở các nút đích:
  - `skip` (nút bỏ phiếu), `skipNow` (nút chuyển bài ngay), `pause`, `block` (nút ⋯ của bài đang phát): `NowPlayingCard.tsx`, `src/themes/stage/StageControls.tsx`, nút riêng của chủ đề nếu có (grep `voteSkip|skipNow|togglePlay|openBlockMenu` trong `src/themes`).
  - `save`, `mini`, `listen`, `lyrics`: thêm prop `guide?: string` → `data-guide` cho `SaveButton`, `MiniPlayerButton`, `ListenToggle`/`ListenButton`, `LyricsButton`; truyền ở chỗ dùng cho bài đang phát.
  - `share`: nút chia sẻ ở `RoomHeader.tsx`.
  - `heart`: nút tim của mục hàng chờ đầu tiên; `myItem`: `data-guide-item={item.id}` ở phần tử ngoài cùng của mỗi mục hàng chờ trong `QueueList.tsx` và mỗi trình vẽ hàng chờ của chủ đề (grep `queue.map` trong `src/themes`).
  - `add`: ô `#add-input`.

**Interfaces:**
- Produces:
  - `showGuide(req: { target: GuideTarget; query?: string; queueItemId?: string }): void`, `onGuide(fn): () => void` (`guide.ts`, như `find-songs.ts`).
  - `GuideSpotlight()` — chọn phần tử: `skip` → `[data-guide="skipNow"]` nếu người xem có quyền điều khiển (`me.role==='ADMIN' || me.canControl`) và nút đang hiện, không thì `[data-guide="skip"]`; `myItem` → `[data-guide-item="<id>"]`; còn lại `[data-guide="<target>"]`; lấy phần tử **đang hiện** đầu tiên (`checkVisibility()` và có kích thước). Không có → không phủ (tin DJ vẫn có câu). Có → cuộn giữa màn hình, lớp phủ (vùng sáng bo theo nút, viền vàng, phần còn lại tối 62%), khung hướng dẫn (`Pointer` + tiêu đề + câu + nút "Đã hiểu"), đặt dưới nút nếu đủ chỗ, không thì trên; đặt lại khi cuộn / đổi cỡ. Tắt: "Đã hiểu", bấm ra ngoài, Esc, bấm nút được chiếu sáng (nút vẫn nhận click — vùng sáng `pointer-events: none`). `prefers-reduced-motion` → không chuyển động. Focus vào nút "Đã hiểu" khi mở, trả focus khi đóng.

- [ ] **Step 1:** Viết `guide.ts`, `GuideSpotlight.tsx`, nối `RoomFrame`, mở rộng `find-songs.ts` / `AddTrackPanel`, thêm `data-guide` ở các chỗ trên.
- [ ] **Step 2:** `npm run lint && npm run typecheck`.
- [ ] **Step 3:** Dev, máy có quyền phát và không có quyền: mỗi mã chỉ dẫn × 13 chủ đề ở 1366 / 1920 px và điện thoại 375 px (script lặp `showGuide` qua chủ đề, đo: tìm thấy nút, vùng sáng trùng nút ±2 px, khung hướng dẫn nằm trong màn hình). Ca thiếu nút (`block` khi không phải quản trị viên, `pause` khi không có quyền) → không lớp phủ. Tương phản khung hướng dẫn đạt AA (script `__audit` cũ).

### Task 8: Bỏ "Hỏi DJ" (client)

**Files:**
- Delete: `src/components/room/DjAsk.tsx`
- Modify: `src/components/room/AddTrackPanel.tsx:24,54,64` (bỏ nguồn `'dj'`), `src/i18n/vi.ts`, `src/i18n/en.ts` (bỏ chuỗi chỉ `DjAsk` dùng)

- [ ] **Step 1:** Xoá tab và chuỗi không còn dùng (grep từng khoá trước khi xoá).
- [ ] **Step 2:** `npm run lint && npm run typecheck`; dev: tab thêm bài còn Tìm kiếm / Đã phát / Của tôi / Đã chặn, không lỗi console.

### Task 9: Kiểm tra toàn bộ

- [ ] **Step 1:** Server + client `npm run lint && npm run typecheck`; client `npm run build` (dừng `next dev` trước, chạy lại sau).
- [ ] **Step 2:** Đi lại các ca Review Focus 1–6 trên dev; ghi kết quả vào sổ tiến độ.
- [ ] **Step 3:** Thu dọn dữ liệu thử trên dev (quyền phát "Chủ Test", `ChatLink` dev tạo cho Slack, tin chat thử nếu người dùng muốn).
- [ ] **Step 4:** Cập nhật spec nếu có quyết định mới trong lúc làm (ghi ngày). Không commit — chờ người dùng.
