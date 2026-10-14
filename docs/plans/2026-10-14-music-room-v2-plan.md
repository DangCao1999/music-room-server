# Kế hoạch triển khai Music Room v2

> **Cho người (hoặc agent) thực thi:** dùng `superpowers:executing-plans` để làm lần lượt từng task (đã chọn cách **Native**, theo yêu cầu "làm luôn, bỏ qua điểm dừng"). Các bước đánh dấu bằng ô `- [ ]`.
> **Không commit khi chưa được cho phép.** Bước cuối mỗi task là *đề xuất commit message*, không chạy `git commit`.

**Mục tiêu:** Đưa nhánh `develop` của hai repo lên Music Room v2 theo spec: an toàn danh tính, lưu bền bằng Postgres, hàng chờ công bằng, máy phát có lease, tìm kiếm YouTube, đóng gói self-host, giao diện điện thoại 3 tab tiếng Việt.

**Kiến trúc:**
- Server NestJS 11 có một gateway Socket.IO duy nhất. Gateway kiểm tra payload bằng Zod rồi gọi các service miền: `rooms`, `members`, `queue`, `playback`, `music`, `social`.
- Mọi thay đổi trạng thái phòng đi qua `RoomStateService.mutate(roomId, fn)`: chạy trong transaction, khóa dòng `PlaybackState`, tăng `version`, rồi phát snapshot sau khi commit.
- Client Next.js 16 dùng một `RoomProvider`, một kho snapshot có kiểm tra `version`, gọi lệnh bằng `emitWithAck`, và có `PlayerEngine` riêng cho máy phát.

**Công nghệ:**
- Server: NestJS 11.1, Socket.IO 4.8, Prisma 7.10 (`prisma-client`, `moduleFormat = "cjs"`, `@prisma/adapter-pg`), PostgreSQL 16, Zod 4, jose 6, `@node-rs/argon2` 2, Jest 30 + ts-jest, Testcontainers 12, nock 15.
- Client: Next.js 16.1.1 (giữ nguyên), React 19.2, `socket.io-client` 4.8, `qrcode.react` 4, Vitest, Playwright 1.64.
- Hạ tầng: Caddy 2.

**Tài liệu liên quan:**
- Spec: `docs/specs/2026-10-14-music-room-mvp-design.md`
- Yêu cầu và mô hình: `docs/requirements/2026-10-14-music-room-v2-yeu-cau.md`
- Ma trận case: `docs/qa/2026-10-14-music-room-v2-test-matrix.md`

## Ràng buộc chung (áp dụng cho mọi task)

- Thông điệp người dùng lấy **nguyên văn** từ §2.6 của tài liệu yêu cầu, và nằm trong `src/i18n/vi.ts` của client. Server chỉ trả **mã lỗi** kèm tham số.
- Không tin bất kỳ id người gửi nào trong payload. Schema Zod của mọi lệnh đặt ở chế độ `.strict()`.
- Không thêm phụ thuộc biên dịch native: Xcode CLT trên máy dev đã cũ.
- Prettier: `singleQuote`, `trailingComma: all`. ESLint của server cấu hình `recommendedTypeChecked`.
- Tên sự kiện socket, mã lỗi, `CONTRACTS_VERSION` lấy từ `src/contracts`. Client copy nguyên thư mục này từ server.
- Mọi phép tính thời gian ở server đi qua interface `Clock` để test dùng đồng hồ giả được.
- Giới hạn số: lấy đúng giá trị ở R-03…R-47 của tài liệu yêu cầu.

## Điểm cần review kỹ

Đây là những tình huống mà task không có test riêng, nhưng dễ làm người dùng gặp lỗi nhất:

1. **Điện thoại khóa màn hình, socket bị treo nhưng không ngắt.** Người dùng mong máy đó được tính là offline sau ping timeout (25 giây + 20 giây), và phiếu bỏ qua được tính lại. Test bổ sung trong task S7 (presence): mô phỏng client ngừng trả lời ping.
2. **Máy phát bị tab nền bóp hiệu năng, `progress` gửi trễ hơn 20 giây.** Người dùng mong không mất lease khi vẫn đang phát. Giữ silent-audio keep-alive như code cũ, và chỉ kết thúc lease khi socket đã ngắt hoặc quá 20 giây (task C6).
3. **Tiêu đề video chứa ký tự RTL hoặc emoji kết hợp.** Người dùng mong giao diện không bị vỡ. Dùng CSS `unicode-bidi: plaintext` và `truncate` (task C4).
4. **Hai admin cùng lưu cài đặt.** Người dùng mong bản lưu sau thắng và mọi máy đều thấy bản đó. Ghi trong cùng transaction `mutate`; test ở S9.
5. **Server khởi động lại đúng lúc một bài vừa hết.** Người dùng mong không mất bài nào. `PlaybackService.restore()` tính lại `positionSec`; nếu vị trí đã vượt thời lượng thì gọi `advance` ngay. Test ở S8.

---

## Cấu trúc file

### Server (`music-room-server`)

```
prisma/schema.prisma                 Mô hình §6 spec (thêm Member.leftAt, Member.displayNameKey nullable)
prisma.config.ts                     Cấu hình Prisma CLI
src/main.ts                          Bootstrap: ConsoleLogger json, Helmet, CORS, Socket.IO adapter (maxHttpBufferSize 1e5)
src/app.module.ts
src/contracts/                       ★ dùng chung với client
  version.ts                         CONTRACTS_VERSION
  errors.ts                          ErrorCode union + type Ack
  schemas.ts                         Zod schema cho từng lệnh, RoomSettings, giới hạn độ dài
  snapshot.ts                        Kiểu RoomSnapshot, MemberView, QueueItemView, TrackSummary
  events.ts                          Tên sự kiện C2S/S2C, map payload
  index.ts
src/common/
  app-error.ts                       class AppError(code, params?)
  clock.ts                           interface Clock { now(): number }, SystemClock
  rate-limiter.ts                    Cửa sổ trượt trong bộ nhớ, key → hits
  text.ts                            normalizeName, nameKey, normalizeQuery, stripControl
src/config/env.ts                    Zod parse process.env → Env; lỗi thì in rõ biến sai và thoát
src/prisma/prisma.service.ts, prisma.module.ts
src/auth/
  token.service.ts                   sign/verify JWT HS256 (jose); secret lấy từ env hoặc /data/jwt-secret
  pin.service.ts                     hash/verify argon2id + khóa sau 5 lần sai/15 phút (theo IP + phòng)
src/rooms/room-code.ts, rooms.service.ts
src/members/members.service.ts       join, rejoin, leave, kick, setPermissions
src/members/presence.service.ts      memberId → Set<socketId>; isOnline
src/queue/fair-queue.ts              orderQueue() thuần
src/queue/queue.service.ts           add, remove, pin, heart, setMessage
src/playback/
  skip-votes.ts                      requiredVotes(), countVotes() thuần
  lease.ts                           Lease giữ trong bộ nhớ + đồng bộ PlaybackState.playerMemberId
  fallback.ts                        pickFallback(ids, recent) thuần
  playback.service.ts                advance(), control(), report(), hẹn giờ, restore()
src/state/room-state.service.ts      mutate(roomId, fn) → transaction + FOR UPDATE + version++ + phát snapshot sau khi commit
src/state/snapshot.service.ts        dựng RoomSnapshot (đã sắp xếp, ước tính vị trí, serverTime)
src/music/
  link-parser.ts                     parseYouTubeInput()
  iso-duration.ts                    parseIsoDuration()
  music-provider.ts                  interface MusicProvider, TrackInfo
  youtube.provider.ts                Data API + oEmbed + thử lại + phân loại lỗi
  track-cache.service.ts             upsert/lấy Track (7 ngày)
  search.service.ts                  SearchCache 24 giờ + giới hạn tần suất
src/social/social.service.ts         chat, reaction, dj, nhật ký (giữ 200 mục)
src/realtime/
  realtime.gateway.ts                @SubscribeMessage cho mọi lệnh → withAck(schema, handler)
  ws-auth.ts                         middleware bắt tay: token → socket.data.member
  broadcaster.ts                     emitRoom(roomId, event, data), emitToMember, emitToSocket
src/health/health.controller.ts      GET /api/health
test/integration/
  setup.ts                           Testcontainers Postgres + prisma migrate + dựng app + helper tạo client
  *.e2e-spec.ts                      theo nhóm case (rooms, auth, permissions, queue, playback, player, search, social, settings, security, persistence, concurrency, health, ratelimit, presence)
deploy/docker-compose.yml, Caddyfile, .env.example, README.md
Dockerfile, .dockerignore
.github/workflows/ci.yml
```

**File bị xóa:** `src/rooms/rooms.gateway.ts`, `src/rooms/rooms.service.ts`, `src/rooms/types.ts` cùng các file spec mẫu, `src/app.controller.ts`, `src/app.service.ts`. Logic của chúng được chuyển sang các module mới.

### Client (`music-room-client`)

```
src/contracts/                       copy từ server (npm run contracts:sync)
src/i18n/vi.ts                       Toàn bộ chuỗi giao diện + errorMessage(code, params)
src/lib/
  socket.ts                          io() cùng origin, auth: { token }, emitWithAck có timeout 8 giây
  session-store.ts                   token theo mã phòng; fallback sang bộ nhớ khi localStorage bị chặn
  room-store.ts                      applySnapshot(prev, next) chỉ nhận version lớn hơn
  time.ts                            clockOffset, estimatePosition, formatDuration, formatClock
  add-input.ts                       classifyInput(): 'link' | 'query' | 'empty'
  youtube-id.ts                      parse id phía client (khớp với server)
src/context/RoomContext.tsx          Viết lại: kết nối, snapshot, các action trả về Ack
src/app/page.tsx                     Trang chủ: Tạo phòng / Vào phòng
src/app/r/[code]/page.tsx            Màn hình thành viên 3 tab
src/app/r/[code]/host/page.tsx       Màn hình máy phát
next.config.ts                       redirects: /room/:id → /r/:id (308), rewrites khi dev: /api, /socket.io → localhost:3001
src/components/room/                 Chỉnh sửa và bổ sung: BottomTabs, NowPlayingCard, QueueList, AddTrackTab, PeopleTab, SettingsPanel, AdminClaimDialog, ChatList, DJSoundboard, WishModal, ActivityLogPopup, Banners
src/components/player/               PlayerEngine (YoutubePlayer + TTS + DJ + báo cáo), HostScreen
e2e/                                 Playwright: create-join, reload, queue, playback, security, reconnect
vitest.config.ts, playwright.config.ts
Dockerfile, .dockerignore
```

---

## Giai đoạn và task

> **Thực thi gộp GĐ1 và GĐ2.** Vì triển khai liền một mạch, mình không dựng tầng xác thực trên bộ nhớ RAM rồi sau đó viết lại. Danh tính và lưu trữ được làm cùng lúc. Khi mở PR vẫn có thể tách thành nhiều commit theo giai đoạn.

### GĐ0: Dọn repo

#### Task S0: Vệ sinh server

**Files:**
- Modify: `.gitignore` (thêm `src/generated/`, `coverage/`, `.env*`, giữ lại `!.env.example`)
- Modify: `package.json` (thêm script `typecheck`, `test:int`, `prisma:generate`)
- Remove from index: `node_modules/`, `dist/` (đã làm)

**Case:** hạ tầng cho mọi case.

- [ ] Bỏ `uuid`, thay bằng `crypto.randomUUID()` (đây là nguyên nhân 2 bộ test hỏng).
- [ ] Chạy `npm run build && npx jest`. Kỳ vọng: xanh.
- [ ] Đề xuất commit: `chore: untrack node_modules and dist, drop uuid for crypto.randomUUID`.

#### Task C0: Vệ sinh client

**Files:** `src/lib/socket.ts` (bỏ URL Render ghi cứng), `next.config.ts`, `.gitignore`.

- [ ] Chạy `npx tsc --noEmit`. Kỳ vọng: qua.
- [ ] Đề xuất commit: `chore: read socket url from env, add dev proxy`.

### GĐ1 + GĐ2: Contracts, danh tính, lưu trữ

#### Task S1: Contracts và thông điệp lỗi

**Files:** tạo `src/contracts/*`. Test: `src/contracts/contracts.spec.ts`.

**Interfaces sinh ra:**
- `CONTRACTS_VERSION: string`
- `type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | … | 'TRACK_NOT_FOUND' | 'TRACK_LIVE'`
- `type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; params?: Record<string, string | number> } }`
- `C2S` (map tên lệnh → schema Zod)
- `RoomSettingsSchema`, `DEFAULT_SETTINGS`
- `RoomSnapshot`

**Case:** TC-006, TC-007, TC-012, TC-018, TC-054, TC-086, TC-087, TC-144, TC-161, TC-181…TC-184.

- [ ] Viết test biên cho từng schema (giá trị dưới / đúng / trên biên). Chạy và xác nhận test **đỏ**.
- [ ] Viết các schema.
- [ ] Chạy lại và xác nhận test **xanh**.

#### Task S2: Phần thuần (TDD)

**Files:**
- `src/common/text.ts`
- `src/rooms/room-code.ts`
- `src/queue/fair-queue.ts`
- `src/playback/skip-votes.ts`
- `src/playback/fallback.ts`
- `src/music/link-parser.ts`
- `src/music/iso-duration.ts`
- `src/common/rate-limiter.ts`
- Mỗi file kèm một file `*.spec.ts`

**Interfaces:**
- `orderQueue(items: FairItem[], lastPlayedAt: Map<string, number | null>): FairItem[]`, với `FairItem = { id; addedById: string | null; addedAt: number; pinnedAt: number | null; hearts: number }`.
- `requiredVotes(onlineVoters: number, threshold: number): number`
- `parseYouTubeInput(s: string): { videoId: string } | null`
- `parseIsoDuration(s: string): number | null`
- `pickFallback(ids: string[], recent: string[], rnd: () => number): string | null`
- `class RateLimiter { hit(key, limit, windowMs, now): { ok: true } | { ok: false; retryAfterSec: number } }`

**Case:** TC-008, TC-009, TC-017, TC-019, TC-052, TC-053, TC-070…TC-077, TC-093…TC-095, TC-105, TC-107, TC-143.

- [ ] Viết test đỏ, cài đặt, chạy test xanh cho từng file.

#### Task S3: Env, Prisma, schema và migration

**Files:** `src/config/env.ts` (+ spec), `prisma/schema.prisma`, `prisma.config.ts`, `src/prisma/*`, migration `prisma/migrations/<ts>_init`.

**Case:** TC-191.

- [ ] Viết `env.spec` cho trường hợp thiếu biến hoặc sai định dạng.
- [ ] Viết schema, sinh migration bằng Postgres chạy trong Docker (`prisma migrate dev --name init`).
- [ ] Chạy `npx prisma validate`.

#### Task S4: Auth (token, PIN, khóa)

**Files:** `src/auth/token.service.ts`, `src/auth/pin.service.ts` (+ spec, dùng đồng hồ giả).

**Interfaces:**
- `TokenService.sign({ memberId, roomId, tokenVersion }): Promise<string>`
- `TokenService.verify(token): Promise<Claims | null>`
- `PinService.hash(pin)`, `PinService.verify(hash, pin)`
- `PinGuard.check(key): { locked: false; remaining } | { locked: true; minutes }`, `PinGuard.fail(key)`, `PinGuard.reset(key)`

**Case:** TC-021, TC-031…TC-033.

#### Task S5: Room state, snapshot, broadcaster

**Files:** `src/state/room-state.service.ts`, `src/state/snapshot.service.ts`, `src/realtime/broadcaster.ts`.

**Interface:** `mutate<T>(roomId: string, fn: (tx: Tx, ctx: MutateCtx) => Promise<T>): Promise<T>`
- Khóa bằng `SELECT … FROM "PlaybackState" WHERE "roomId"=$1 FOR UPDATE`.
- `ctx.afterCommit(cb)` để lên lịch các hiệu ứng phụ như `player:command` hay hẹn giờ.
- Sau khi commit: `version++` rồi phát `room:update`.

**Case:** TC-066, TC-092, TC-193 (phía server), TC-197.

#### Task S6: Rooms, members, presence và gateway

**Files:** `src/rooms/rooms.service.ts`, `src/members/*`, `src/realtime/ws-auth.ts`, `src/realtime/realtime.gateway.ts`, `src/health/health.controller.ts`, `src/main.ts`, `src/app.module.ts`.

**Hành vi chính:**
- Hàm `withAck(schema, handler)`: kiểm tra payload, bắt `AppError` để trả `{ ok: false }`, bắt lỗi lạ để ghi log và trả `INTERNAL`.
- Giới hạn tần suất theo IP cho `create`, `join`, `host:register`.
- Gói tin vượt `maxHttpBufferSize` bị ngắt kết nối.

**Case:** TC-001…TC-026, TC-030…TC-042, PM-01…PM-18, TC-190, TC-194, TC-195, TC-197, TC-198.

#### Task S7: Queue service

**Files:** `src/queue/queue.service.ts`.

**Case:** TC-050, TC-051, TC-055…TC-062, TC-066, TC-080…TC-088, TC-185.

#### Task S8: Playback, lease, hẹn giờ, khôi phục

**Files:** `src/playback/playback.service.ts`, `src/playback/lease.ts`.

**Case:** TC-090…TC-108, TC-120…TC-125, TC-129, TC-130.

#### Task S9: Music (YouTube provider, cache, search) và settings

**Files:** `src/music/youtube.provider.ts`, `track-cache.service.ts`, `search.service.ts` (+ spec dùng nock).

**Case:** TC-059…TC-065, TC-140…TC-150, TC-180, TC-185.

#### Task S10: Social

**Files:** `src/social/social.service.ts`.

**Case:** TC-160…TC-169.

#### Task S11: Integration test toàn bộ

**Files:** `test/integration/*`.

- [ ] Chạy `npm run test:int` (cần Docker). Kỳ vọng: xanh.
- [ ] Ghi kết quả vào ma trận case.

### GĐ3–GĐ5 phía client và GĐ7: giao diện

#### Task C1: Contracts, i18n và lib thuần (Vitest)

**Files:** `src/contracts` (copy), `src/i18n/vi.ts`, `src/lib/*` (+ `*.test.ts`).

**Case:** TC-022, TC-109, TC-148, TC-183 (đổi đơn vị), TC-192, TC-193, TC-201.

#### Task C2: RoomContext mới

**Hành vi:**
- Kết nối kèm token.
- Áp dụng snapshot theo `version`.
- Mọi action trả về `Promise<Ack>`; hiện toast bằng `errorMessage()`.
- Banner kết nối lại và banner lệch phiên bản.

#### Task C3: Trang chủ (Tạo phòng / Vào phòng)

**Case:** TC-001…TC-007, TC-011…TC-014.

#### Task C4: Màn hình thành viên 3 tab

**Nội dung:** BottomTabs, NowPlayingCard, QueueList (vòng, ghim, ❤️, xóa, lời chúc), AddTrackTab (tìm kiếm hoặc dán link), PeopleTab (danh sách, menu quyền, nhận quyền quản trị, cài đặt, chat, DJ).

**Case:** TC-015, TC-016, TC-020, TC-024, TC-030, TC-035, TC-039, TC-042, TC-050…TC-088, TC-093…TC-102, TC-140…TC-148, TC-160…TC-185.

#### Task C5: Màn hình máy phát và PlayerEngine

**Nội dung:**
- Nhập PIN, QR code.
- Báo cáo `started`, `progress` (mỗi 5 giây), `ended`, `error`.
- Nút "Bắt đầu phát".
- TTS và DJ chỉ chạy khi máy đang là máy phát.
- Thông báo `player_replaced`.

**Case:** TC-120…TC-131.

#### Task C6: Chuyển hướng link cũ và Playwright E2E

**Case:** TC-196, TC-062, TC-078, TC-163, TC-200.

### GĐ6: Self-host

#### Task D1: Dockerfile cho hai repo, `deploy/`, CI

**Files:** `Dockerfile` (multi-stage, user không phải root, HEALTHCHECK), `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/.env.example`, `deploy/README.md`, `.github/workflows/ci.yml`.

**Case:** TC-202.

- [ ] `docker compose -f deploy/docker-compose.yml up --build` dựng được cục bộ (build image từ thư mục nguồn của hai repo). Kiểm tra bằng Browser pane.

### Kiểm chứng và báo cáo

- [ ] Chạy toàn bộ test tự động, rồi chạy tay các case `M` trên Browser pane.
- [ ] Ghi kết quả thật vào ma trận case.
- [ ] Mời một reviewer độc lập kiểm tra toàn bộ nhánh (`pr-review-toolkit:code-reviewer` hoặc `code-review`). Sửa các phát hiện P1 và P2.
- [ ] Viết báo cáo cuối theo mục 7 của quy trình.
