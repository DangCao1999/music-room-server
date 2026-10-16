# Chặn bài trong phòng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quản trị viên chặn một video YouTube trong phòng (qua ngay / gỡ khỏi hàng chờ, không ai thêm lại được), xem và bỏ chặn trong tab "Đã chặn".

**Architecture:** Bảng `BlockedTrack` (roomId, trackId). `BlockService` (server) xử lý 3 lệnh socket; `QueueService.checkAddable` là chốt chặn chung cho mọi đường thêm bài, radio / dự phòng / tổng kết lọc thêm. Snapshot gửi `room.blockedTrackIds` để web đánh dấu "Đã chặn"; danh sách đầy đủ chỉ qua lệnh admin `track:blocked`.

**Tech Stack:** NestJS 11, Prisma (Postgres), Socket.IO, zod contracts (đồng bộ sang client), Next.js 16 / React 19 / Tailwind 4.

**Spec:** `docs/specs/2026-10-16-block-tracks-design.md`

## Global Constraints

- Chỉ `role === 'ADMIN'` chặn / bỏ chặn / xem danh sách; `canControl` không đủ → `FORBIDDEN`.
- Chặn theo `Track.id` (`youtube:<11 ký tự>`), mỗi phòng một danh sách; quản trị viên cũng không thêm được bài bị chặn.
- Lỗi mới `TRACK_BLOCKED`: "Bài này đã bị quản trị viên chặn trong phòng."
- Activity: `track_block` → `đã chặn "<tên bài>"`, `track_unblock` → `đã bỏ chặn "<tên bài>"` (tác giả = admin, không nêu người thêm bài).
- Bump `CONTRACTS_VERSION` `2026-10-16.2` → `2026-10-16.3` — `git fetch` server `origin/develop` ngay trước khi bump; nếu số đã bị dùng thì lấy số kế tiếp.
- Không viết test tự động; kiểm bằng `npm run lint`, `npx tsc --noEmit`, `npm run build` và probe trên dev. DB phải là `localhost:55432/musicroom` (kiểm `.env` trước mọi lệnh Prisma).
- Không commit / push / PR khi người dùng chưa cho phép.
- Không có rate limit riêng cho 3 lệnh mới. Bỏ chặn không cần xác nhận.

## Review Focus

1. Chặn bài đang phát **khi cuộc bỏ phiếu đang mở** → bài qua ngay, phiếu đóng, thẻ bỏ phiếu Slack đổi thành "Đã qua bài" (Task 2 probe bước "chặn giữa lúc bỏ phiếu").
2. Thêm lại bằng **link dạng khác** (`youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, có `&t=`) vẫn `TRACK_BLOCKED`, và bị từ chối **trước** khi tra YouTube (Task 2 probe).
3. Client cũ chưa nhận snapshot mới bấm "Thêm" bài vừa bị chặn → server từ chối, toast hiện đúng câu tiếng Việt (Task 3 kiểm tay).
4. `queue:add-many` (playlist / nhập danh sách) chứa bài bị chặn → các bài khác vẫn vào, bài bị chặn nằm trong `skipped` với `TRACK_BLOCKED` và client hiện lý do (Task 2 probe + Task 3 kiểm tay).
5. Chặn hai lần / bỏ chặn bài không bị chặn → thành công, không lỗi, không ghi activity trùng (Task 2 probe).

---

### Task 1: Dữ liệu và contracts

**Files:**
- Modify: `prisma/schema.prisma` (model `BlockedTrack` như spec; quan hệ ngược `blockedTracks BlockedTrack[]` trên `Room` và `Track`)
- Create: `prisma/migrations/<timestamp>_blocked_tracks/migration.sql` (sinh bằng `npx prisma migrate dev --name blocked_tracks`)
- Modify: `src/contracts/errors.ts` (thêm `'TRACK_BLOCKED'` vào `ERROR_CODES`)
- Modify: `src/contracts/snapshot.ts` (`BlockedTrackView`; `RoomSnapshot.room.blockedTrackIds: string[]`)
- Modify: `src/contracts/schemas.ts` (C2S: `'track:block'`, `'track:unblock'`: `z.strictObject({ trackId: TrackIdSchema })`; `'track:blocked'`: `z.strictObject({})`)
- Modify: `src/contracts/events.ts` (`CommandResults['track:blocked']: { items: BlockedTrackView[] }`)
- Modify: `src/contracts/version.ts` (bump)

**Interfaces:**
- Produces: `interface BlockedTrackView { track: TrackSummary; blockedByName: string; blockedAt: string }`; Prisma `tx.blockedTrack`; command names `track:block | track:unblock | track:blocked`.

- [ ] **Step 1:** Kiểm DB đích: `grep '^DATABASE_URL' .env` phải là `localhost:55432/musicroom`.
- [ ] **Step 2:** Sửa schema, chạy `npx prisma migrate dev --name blocked_tracks`. Expected: migration mới tạo bảng `BlockedTrack` + unique `(roomId, trackId)`; `prisma generate` chạy xong.
- [ ] **Step 3:** Sửa contracts + bump version (fetch `origin/develop` trước).
- [ ] **Step 4:** `npx tsc --noEmit` — lỗi duy nhất được phép là snapshot thiếu `blockedTrackIds` (Task 2 lấp).

### Task 2: Server — chặn, chốt mọi đường thêm bài

**Files:**
- Create: `src/queue/block.service.ts` — `BlockService`
- Modify: `src/realtime/realtime.gateway.ts` (3 handler theo mẫu `member:kick`)
- Modify: `src/app.module.ts` (provider)
- Modify: `src/queue/queue.service.ts` (`checkAddable` + kiểm sớm trong `add`)
- Modify: `src/state/snapshot.service.ts` (`blockedTrackIds`)
- Modify: radio `SuggestService.radioPick` / `eligible()` và `PlaybackService.createFallbackItem` (loại bài bị chặn)
- Modify: `src/library/library.service.ts` (recap: bỏ bài bị chặn khỏi `topSongs` và dữ liệu đưa AI)
- Modify: `src/chat/chat-text.ts` (`TRACK_BLOCKED` như Global Constraints)
- Create (scratchpad, không vào repo): `probe-block.cjs`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `BlockService.block(actor: Actor, trackId: string): Promise<void>`
  - `BlockService.unblock(actor: Actor, trackId: string): Promise<void>`
  - `BlockService.list(actor: Actor): Promise<{ items: BlockedTrackView[] }>` (mới nhất trước)
  - `isBlocked(tx: Tx, roomId: string, trackId: string): Promise<boolean>` export từ `block.service.ts` (dùng lại trong queue / radio / fallback).

- [ ] **Step 1: `block`** trong `state.mutate`: admin check → upsert `BlockedTrack` (đã có → return, không log) → `QUEUED` cùng trackId → `REMOVED` → nếu `playbackState.currentItemId` là item của trackId đó thì `playback.advance(tx, ctx, roomId, currentItemId, 'skip')` → log `track_block`. Track không tồn tại → `TRACK_NOT_FOUND`.
- [ ] **Step 2: `unblock`**: admin check → `deleteMany` → chỉ log `track_unblock` khi xoá được 1 dòng. **`list`**: admin check → `findMany` + track, `orderBy createdAt desc`, map sang `BlockedTrackView` (dùng mapper `TrackSummary` sẵn có).
- [ ] **Step 3:** `checkAddable` gọi `isBlocked` đầu tiên → `TRACK_BLOCKED`. `add`: sau `resolveVideoId`, trước `tracks.resolve`, kiểm `isBlocked(this.prisma, roomId, 'youtube:'+videoId)`.
- [ ] **Step 4:** Radio, dự phòng, recap, snapshot `blockedTrackIds` (sắp xếp ổn định để snapshot so sánh được), câu Slack.
- [ ] **Step 5:** `npx tsc --noEmit && npm run lint` sạch (ngoài 2 cảnh báo cũ ở `youtube-account.service.ts`).
- [ ] **Step 6: Probe** `probe-block.cjs` (server dev + Slack giả như các probe Slack trước), in ✔/✘ cho:
  - thành viên gọi 3 lệnh → `FORBIDDEN`; `canControl` (được cấp quyền điều khiển) cũng `FORBIDDEN`
  - admin chặn bài trong hàng chờ → item `REMOVED`, `blockedTrackIds` có id, activity `đã chặn "…"`
  - thêm lại bằng `youtu.be/ID`, `youtube.com/watch?v=ID&t=30`, `youtube.com/shorts/ID` → `TRACK_BLOCKED`; admin thêm → `TRACK_BLOCKED`
  - `queue:add-many` [bị chặn, bài khác] → bài khác vào, `skipped` = `[{trackId, reason:'TRACK_BLOCKED'}]`
  - chặn giữa lúc bỏ phiếu: mở phiếu rồi admin chặn bài đang phát → `nowPlaying` đổi bài, thẻ Slack giả nhận `chat.update` "Đã qua bài"
  - chặn lần 2 → ok, không thêm dòng activity; bỏ chặn → ok, thêm được lại; bỏ chặn lần 2 → ok
  - Slack giả `/music add <link bị chặn>` → câu "Bài này đã bị quản trị viên chặn trong phòng."
  - `track:blocked` trả về đúng thứ tự mới nhất trước với `blockedByName`

### Task 3: Client

**Files (repo `music-room-client`):**
- Sync: `npm run contracts:sync`
- Modify: `src/i18n/vi.ts` (khối `block` + `errors.TRACK_BLOCKED`)
- Create: `src/components/room/BlockDialog.tsx` — hộp xác nhận dùng `Dialog`
- Create: `src/components/room/BlockedList.tsx` — tab "Đã chặn"
- Modify: `src/components/room/NowPlayingCard.tsx` (nút ⋯ cho admin → sheet có "Chặn bài này trong phòng")
- Modify: `src/components/room/QueueList.tsx` (`ItemMenu`: thêm `SheetAction` chặn, admin)
- Modify: `src/components/room/LibraryLists.tsx` (`PlayedList`: ⋯ cho admin) và `TrackRow.tsx` (trạng thái "Đã chặn")
- Modify: `src/components/room/AddTrackPanel.tsx` (tab `blocked` chỉ admin, nhãn có số bài)

**Interfaces:**
- Consumes: `act('track:block' | 'track:unblock', { trackId })`, `request('track:blocked', {})` → `{ items: BlockedTrackView[] }`, `snapshot.room.blockedTrackIds`.
- Produces: `<BlockDialog track={TrackSummary} playing={boolean} onClose />`; `<BlockedList />`; `TrackRow` tự đọc `blockedTrackIds` từ store (không thêm prop).

Chuỗi (`vi.block`, nguyên văn):
- `menu`: 'Chặn bài này trong phòng'
- `title(t)`: `Chặn "${t}"?`
- `bodyPlaying`: 'Bài đang phát sẽ qua ngay.' · `bodyQueued`: 'Bài sẽ được gỡ khỏi hàng chờ.' · `bodyRest`: 'Từ giờ không ai thêm lại được video này trong phòng, kể cả từ Slack.' · `where`: 'Bỏ chặn ở Thêm bài → Đã chặn.'
- `confirm`: 'Chặn bài' · `cancel`: 'Huỷ' · `done(t)`: `Đã chặn "${t}"` · `undone(t)`: `Đã bỏ chặn "${t}"`
- `tab`: 'Đã chặn' · `unblock`: 'Bỏ chặn' · `by(name, when)`: `${name} chặn · ${when}` · `empty`: 'Chưa chặn bài nào. Chặn từ menu ⋯ của bài đang phát hoặc trong hàng chờ.' · `label`: 'Đã chặn'

- [ ] **Step 1:** Sync contracts; `npx tsc --noEmit` chỉ báo các chỗ cần sửa.
- [ ] **Step 2:** Chuỗi, `BlockDialog`, menu ở Đang phát / hàng chờ / Đã phát (chỉ `me.role === 'ADMIN'`).
- [ ] **Step 3:** `TrackRow` "Đã chặn": nút tắt, icon `Ban`, nhãn `vi.block.label`; các hàng gợi ý không dùng `TrackRow` (`Suggestions`, `DjAsk`, `TasteCard`) cũng tắt nút thêm theo cùng cách; `BlockedList` gọi lại `track:blocked` khi `blockedTrackIds` đổi; tab chỉ admin.
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit && npm run build` sạch.
- [ ] **Step 5: Trình duyệt** (dev, hai tab: admin + thành viên): menu ⋯ ở cả ba chỗ, hộp xác nhận đúng câu (đang phát / đang chờ), qua bài ngay, tab Đã chặn admin thấy / thành viên không, nhãn "Đã chặn" trên kết quả tìm kiếm và Đã phát ở tab thành viên, bỏ chặn → nhãn biến mất; Review Focus 3 và 4.
