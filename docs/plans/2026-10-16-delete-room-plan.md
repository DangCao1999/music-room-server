# Xoá phòng và dọn phòng mồ côi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ phòng xoá được phòng của mình; phòng mồ côi 30 ngày không ai dùng thì server tự xoá.

**Architecture:** Cột `Room.lastUsedAt` do một `RoomActivityService.touch()` (giới hạn 10 phút) cập nhật từ mọi lệnh có người làm (gateway) và mọi thao tác Slack. `RoomDeletionService` xoá một phòng theo một trình tự duy nhất (báo + ngắt socket → xoá dòng `Room` (cascade) → phát sự kiện "phòng đã xoá" để các service dọn bộ nhớ → báo Slack), dùng cho cả xoá tay lẫn dọn mồ côi hằng ngày.

**Tech Stack:** NestJS 11, Prisma (Postgres), Socket.IO, zod contracts, Next.js 16 / React 19 / Tailwind 4.

**Spec:** `docs/specs/2026-10-16-delete-room-design.md`

## Global Constraints

- Chỉ chủ phòng (`member.userId === room.ownerId`, hoặc tài khoản đăng nhập `=== room.ownerId` từ trang chủ) xoá được; còn lại `FORBIDDEN`. Không dùng PIN.
- Xác nhận xoá bằng mã phòng: server so khớp `normalizeRoomCode(input.code) === room.code`; sai → `VALIDATION`.
- Mồ côi: `ownerId IS NULL` và `lastUsedAt < now − 30 ngày` và không ai online → xoá. Hằng số `ORPHAN_ROOM_DAYS = 30`, mỗi lần chạy tối đa `ORPHAN_BATCH = 200` phòng; chạy 5 phút sau khi khởi động rồi mỗi 24 giờ.
- "Đang dùng" chỉ tính việc người làm; radio / dự phòng / timer tự chuyển bài **không** tính.
- `touch` ghi DB tối đa mỗi 10 phút / phòng (`TOUCH_EVERY_MS = 10 * 60_000`).
- Lý do ngắt phiên mới: `'room_deleted'`. Toast client: `Phòng ${name} đã bị chủ phòng xoá.` (không tên: `Phòng đã bị chủ phòng xoá.`). Xoá thành công: `Đã xoá phòng ${name}`.
- Bump `CONTRACTS_VERSION` → `2026-10-16.4` (fetch server `origin/develop` ngay trước; số đã dùng thì lấy số kế).
- Không test tự động; kiểm bằng lint / typecheck / build + probe trên dev (`localhost:55432`). Không đụng production. Không commit khi chưa được phép.

## Review Focus

1. Phòng đang có máy phát mở (không ai khác) nhưng `lastUsedAt` cũ → **không** bị dọn (presence tính cả máy phát) — Task 2 probe.
2. Timer phát / bỏ phiếu / MC của phòng vừa xoá bắn sau khi xoá → không lỗi, không tạo lại dữ liệu — Task 2 probe (xoá phòng đang phát, chờ qua mốc timer, log không có lỗi).
3. Thành viên mở phòng ở 2 tab + máy phát: cả 3 nhận `room_deleted` và rời phòng, không vòng lặp nối lại — Task 2 probe + Task 3 trình duyệt.
4. Slack: phòng có kênh nối và thẻ bỏ phiếu đang mở → kênh nhận tin, thẻ đổi thành "Phòng đã bị xoá"; sau đó `/music` ở kênh đó trả "chưa nối" — Task 2 probe (Slack giả).
5. Tạo phòng mới trùng mã với phòng vừa xoá (mã được giải phóng) không lỗi; `me:rooms` không còn phòng đã xoá — Task 2 probe.

---

### Task 1: Dữ liệu và contracts

**Files:**
- Modify: `prisma/schema.prisma` (`Room.lastUsedAt DateTime @default(now())`, `@@index([ownerId, lastUsedAt])`)
- Create: `prisma/migrations/<ts>_room_last_used/migration.sql` — tạo bằng `prisma migrate dev --create-only`, rồi **thêm** câu backfill:
  `UPDATE "Room" r SET "lastUsedAt" = GREATEST(r."createdAt", COALESCE((SELECT max("lastSeenAt") FROM "Member" WHERE "roomId" = r.id), r."createdAt"), COALESCE((SELECT max("addedAt") FROM "QueueItem" WHERE "roomId" = r.id AND "addedById" IS NOT NULL), r."createdAt"), COALESCE((SELECT max("createdAt") FROM "ActivityLog" WHERE "roomId" = r.id AND "memberId" IS NOT NULL), r."createdAt"));`
- Modify contracts (`src/contracts/*`): `RevokeReason` + `'room_deleted'`; `RoomSnapshot.room.ownerUserId: string | null`; C2S `'room:delete': z.strictObject({ code: RoomCodeSchema })`, `'me:room-delete': z.strictObject({ code: RoomCodeSchema })`; version bump.

**Interfaces — Produces:** `prisma.room.lastUsedAt`; commands `room:delete`, `me:room-delete` (result `{}`); `snapshot.room.ownerUserId`.

- [ ] DB đích là `localhost:55432/musicroom`; tạo + sửa + `prisma migrate dev` (áp) + `prisma generate`.
- [ ] Kiểm: `SELECT count(*) FROM "Room" WHERE "lastUsedAt" < "createdAt"` = 0.
- [ ] `npx tsc --noEmit` chỉ báo snapshot thiếu `ownerUserId`.

### Task 2: Server

**Files:**
- Create: `src/rooms/room-activity.service.ts` — `RoomActivityService.touch(roomId: string): void` (fire-and-forget, nhớ mốc ghi gần nhất trong bộ nhớ, `updateMany where lastUsedAt < now−10min`)
- Create: `src/rooms/room-deletion.service.ts` — `RoomDeletionService`
- Modify: `src/state/room-state.service.ts` — `onDeleted(listener: (roomId: string) => void): void`, `emitDeleted(roomId: string): void`
- Modify (đăng ký `onDeleted` để dọn map theo `roomId`): `PlaybackService` (timers, voteTimers), `LeaseService`, `PresenceService` (membersByRoom, chatVoters), `McService`, `ChatNotifierService` (votes, chains, linkCache), `SlackHomeService` (viewers, shown, timers); và `PlaybackService.onTimer` / vote timer bỏ qua êm nếu phòng không còn.
- Modify: `src/realtime/realtime.gateway.ts` — trong `run()` sau handler thành công có `actor`: `activity.touch(actor.roomId)` trừ `player:report`, `player:heartbeat`; khi nối lại phiên (resume) cũng touch; handler `room:delete`, `me:room-delete`.
- Modify Slack: `ChatRoomService.member()` và `now()` → touch; `SlackHomeService.publish(..., redraw=false)` → touch phòng đang hiển thị; `submit` / `modalAction` → touch.
- Modify: `src/state/snapshot.service.ts` — `ownerUserId`.
- Modify: `src/app.module.ts`.
- Create (scratchpad): `probe-delete-room.cjs`.

**Interfaces — Produces:**
- `RoomDeletionService.deleteByOwner(actor: Actor, code: string): Promise<void>` (từ trong phòng)
- `RoomDeletionService.deleteByAccount(userId: string, code: string): Promise<void>` (trang chủ)
- `RoomDeletionService.deleteRoom(roomId: string, why: 'owner' | 'orphan'): Promise<void>` — trình tự: (1) lấy `name`, `code`, links Slack + thẻ bỏ phiếu đang mở; (2) `broadcaster` gửi `session:revoked {reason:'room_deleted'}` cho mọi socket của phòng (thành viên + máy phát) rồi ngắt; (3) `prisma.room.delete`; (4) `state.emitDeleted(roomId)`; (5) (chỉ `owner`) Slack: tin "🎶 Phòng *<tên>* đã bị xoá nên kênh này đã tự bỏ nối." vào từng link (thread nếu có), sửa thẻ bỏ phiếu thành "Phòng đã bị xoá" không nút; lỗi Slack chỉ log; (6) `Logger.log` `room deleted (<why>): <code> "<name>"`.
- `RoomDeletionService.sweepOrphans(now = new Date()): Promise<number>` — chọn tối đa 200 phòng `ownerId null`, `lastUsedAt < now−30d`, bỏ phòng có `presence.onlineMembers(roomId).size > 0`; xoá lần lượt; log tổng.

- [ ] Dịch vụ + đăng ký dọn bộ nhớ + gateway + Slack + snapshot; `tsc` + `lint` sạch.
- [ ] Probe (server dev với Slack giả), in ✔/✘:
  - chủ phòng (tạo phòng sau khi `auth:google`… nếu không đăng nhập được trên dev thì gán `ownerId` trực tiếp vào DB dev cho phòng thử) xoá bằng `room:delete` đúng mã → ok; sai mã → `VALIDATION`; quản trị viên bằng PIN / thành viên → `FORBIDDEN`
  - 2 socket thành viên + 1 socket máy phát cùng nhận `session:revoked {room_deleted}` và bị ngắt
  - `/api/rooms/<code>/preview` → 404; không còn dòng `Member` / `QueueItem` / `ChatLink` của phòng
  - Slack giả: tin báo đã đăng, thẻ bỏ phiếu đã sửa; `/music` ở kênh đó → "chưa nối"
  - chờ qua mốc timer phát của phòng đã xoá → log server không có lỗi
  - `me:room-delete` từ tài khoản chủ (không ở trong phòng) xoá được; tài khoản khác → `FORBIDDEN`
  - dọn mồ côi: lùi `lastUsedAt` 31 ngày cho (a) phòng mồ côi không ai online → bị xoá, (b) phòng có chủ → giữ, (c) phòng mồ côi có socket online → giữ, (d) phòng mồ côi 20 ngày → giữ; gọi `sweepOrphans` (qua một lệnh / script dev, không thêm API công khai)
  - `touch`: lệnh Slack (`/music now`) làm `lastUsedAt` mới; radio tự thêm bài thì không
  - tạo phòng mới (mã ngẫu nhiên) sau đó vẫn chạy; `me:rooms` không còn phòng đã xoá

### Task 3: Client

**Files (repo `music-room-client`):**
- Sync: `npm run contracts:sync`
- Modify: `src/i18n/vi.ts` (khối `deleteRoom` + `banners.roomDeleted`)
- Create: `src/components/room/DeleteRoomDialog.tsx` — `<DeleteRoomDialog name code onConfirm onClose />` (ô gõ mã, nút đỏ bật khi khớp, không phân biệt hoa thường)
- Modify: `src/components/room/SettingsPanel.tsx` — mục "Xoá phòng" cuối khung, chỉ khi `user?.id === snapshot.room.ownerUserId`; gọi `room:delete`
- Modify: `src/components/account/AccountPanel.tsx` (Phòng của tôi) — phòng `isOwner` có ⋯ → "Xoá phòng…" → `me:room-delete`, rồi tải lại danh sách
- Modify: `src/state/room-store.ts` + `src/app/r/[code]/page.tsx` + `host/page.tsx` — `revoked === 'room_deleted'` → toast + về trang chủ (`router.replace('/')`)
- Modify: phòng mồ côi — dòng nhắc cho quản trị viên khi `ownerUserId === null` (có nút đóng, nhớ trong `sessionStorage`), đặt cùng chỗ các banner hiện có

Chuỗi (`vi.deleteRoom`, nguyên văn):
- `section`: 'Xoá phòng' · `sectionHint`: 'Xoá hẳn phòng này cùng hàng chờ, lịch sử và chat. Không khôi phục được.' · `open`: 'Xoá phòng…'
- `title(name)`: `Xoá phòng "${name}"?`
- `body`: 'Hàng chờ, lịch sử, chat và danh sách chặn của phòng sẽ mất hẳn, không khôi phục được. Mọi người đang trong phòng sẽ được đưa về trang chủ. Kênh Slack đang nối sẽ tự bỏ nối.'
- `typeCode(code)`: `Gõ mã phòng ${code} để xác nhận` · `confirm`: 'Xoá phòng' · `cancel`: 'Huỷ'
- `done(name)`: `Đã xoá phòng ${name}` · `menu`: 'Xoá phòng…'
- `orphanNotice`: 'Phòng chưa có chủ nên sẽ tự xoá sau 30 ngày không ai dùng. Người tạo phòng đăng nhập Google để giữ phòng.'
- `banners.roomDeleted(name?)`: có tên → `Phòng ${name} đã bị chủ phòng xoá.`, không → 'Phòng đã bị chủ phòng xoá.'

- [ ] Sync, chuỗi, dialog, Cài đặt phòng, Phòng của tôi, xử lý `room_deleted`, dòng nhắc mồ côi.
- [ ] `npm run lint && npx tsc --noEmit && npm run build` sạch.
- [ ] Trình duyệt (dev): nút xoá chỉ với chủ phòng; gõ sai mã → nút tắt; xoá → về trang chủ + toast; tab khác của phòng → về trang chủ + toast "đã bị chủ phòng xoá"; dòng nhắc mồ côi chỉ hiện với quản trị viên.
