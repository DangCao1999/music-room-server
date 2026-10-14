# Music Room v2: Ổn định hóa & Self-host

- **Ngày:** 2026-10-14
- **Trạng thái:** Bản thảo, chờ duyệt
- **Phạm vi repo:** `music-room-server` (NestJS) và `music-room-client` (Next.js), nhánh nền `develop`
- **Tác giả:** khanh.nguyen.quoc, viết cùng Claude Code (superpowers:brainstorming)

---

## 1. Mục tiêu và tiêu chí thành công

### 1.1 Mục đích

Music Room là ứng dụng mã nguồn mở. Nó cho phép nhân viên trong cùng một văn phòng **cùng chọn nhạc để nghe chung**. Một máy tính trong văn phòng làm **máy phát** (player) và nối với loa Bluetooth. Mọi người dùng điện thoại hoặc laptop để tìm bài, thêm bài vào hàng chờ, thả tim, bỏ phiếu bỏ qua bài, chat và gửi lời chúc.

Về lâu dài, sản phẩm hướng tới bộ tính năng của các ứng dụng nghe nhạc hàng đầu (playlist, thư viện, gợi ý…). Các phần đó là **dự án con riêng** và nằm ngoài spec này.

### 1.2 Tiêu chí thành công của v2

1. Một văn phòng tự cài được bằng `docker compose up -d` cộng với 3 biến môi trường, trong vòng **dưới 15 phút**.
2. Phòng **tồn tại lâu dài**: restart server, mọi người đóng tab hay tải lại trang đều không làm mất phòng, hàng chờ hay danh tính.
3. **Không thể giả danh**: mọi quyền đều được kiểm tra ở server dựa trên token do server cấp.
4. **Không ai chiếm loa được**: hàng chờ xếp lượt công bằng giữa các thành viên.
5. Phát nhạc liên tục **1 giờ** trên máy thật không bị ngắt, kể cả khi mạng chập chờn hoặc máy phát tải lại trang.
6. Các tính năng đang có (chat, reaction, soundboard DJ, lời chúc TTS, nhật ký hoạt động, ❤️) **vẫn hoạt động**.

### 1.3 Các quyết định đã chốt khi brainstorm

| # | Quyết định | Lựa chọn |
|---|---|---|
| D1 | Nguồn nhạc | Interface `MusicProvider` dùng chung. **YouTube là nguồn đầu tiên.** Spotify và thư viện riêng để sau |
| D2 | Cách triển khai | **Self-host trước** (mỗi văn phòng tự chạy bằng Docker). Kiến trúc để ngỏ chế độ cloud cho sau này |
| D3 | Danh tính | **Không cần tài khoản**: nhập tên là vào. Đăng nhập Google để dành cho dự án con "Tài khoản" |
| D4 | Luật hàng chờ | **Xếp lượt công bằng theo vòng + bỏ phiếu bỏ qua.** ❤️ quyết định thứ tự trong cùng một vòng |
| D5 | Kiến trúc | Hai service (Next.js và NestJS) cùng Postgres, chạy bằng Docker Compose |
| D6 | Code nền | **Nâng cấp code có sẵn trên `develop`**, không viết lại |
| D7 | Giao diện điện thoại | 3 tab ở dưới cùng: **Phòng / Thêm bài / Mọi người** |
| D8 | Màn hình máy phát | Route `/r/[code]/host` toàn màn hình: trình phát YouTube bên trái; QR, mã phòng và 2 bài tiếp theo bên phải |

---

## 2. Hiện trạng nhánh `develop` (tính tới 2026-01-10)

### 2.1 Những gì đã có

- **Server:** NestJS 11, `@nestjs/websockets` + Socket.IO 4.8. Có một `RoomsService` (622 dòng) và một `RoomsGateway` (399 dòng). Toàn bộ trạng thái nằm trong `Map` trong RAM. Thông tin bài lấy qua YouTube oEmbed, nên `duration` luôn bằng 0 trừ khi client tự gửi lên. Server hẹn giờ để biết lúc hết bài. Đang deploy lên Render bản miễn phí (`render.yaml`).
- **Client:** Next.js 16.1.1, React 19.2.3, `react-youtube`, `framer-motion`, `lucide-react`. Có một trang phòng `/room/[id]` với khoảng 20 component, `RoomContext` quản lý socket, và địa chỉ server ghi cứng là `https://muzic-room-server.onrender.com`.
- **Tính năng:**
  - Tạo phòng và vào phòng bằng nickname (không trùng tên trong phòng).
  - Hàng chờ: thêm, xóa, kéo đổi thứ tự. Mỗi người tối đa 4 bài.
  - ❤️: mỗi người chỉ thả tim được một bài, hàng chờ xếp theo số tim.
  - Bỏ phiếu bỏ qua bài (cần `floor(n/2)+1` phiếu).
  - Quyền `admin`, `canPlay` (thiết bị phát), `canControl`, `canDj`; chuyển quyền admin cho người khác.
  - Chat, reaction, soundboard DJ (có thời gian chờ 1,5 giây), lời chúc TTS với các kiểu giọng.
  - Nhật ký hoạt động (50 mục gần nhất). Phòng tự đóng sau 1 giờ không hoạt động.

### 2.2 Vấn đề phải xử lý

| Mức độ | Vấn đề | Hậu quả |
|---|---|---|
| 🔴 Nghiêm trọng | Server tin vào `userId`, `adminId`, `requesterId`, `currentAdminId`, `userName` **do client tự gửi lên**, trong khi `room:update` lại phát `userId` của mọi người tới cả phòng | Ai cũng giả danh admin được: chiếm quyền, cấp quyền DJ, xóa bài người khác, chat dưới tên người khác |
| 🔴 Nghiêm trọng | `cors: { origin: '*' }`, không kiểm tra dữ liệu gửi lên | Trang web lạ cũng gửi lệnh được; payload sai định dạng có thể làm hỏng trạng thái phòng |
| 🔴 Nghiêm trọng | Trạng thái chỉ nằm trong RAM; phòng bị xóa khi trống hoặc sau 1 giờ không hoạt động; người dùng bị xóa ngay khi socket ngắt | Restart là mất hết; tải lại trang thì thành người mới; admin tự rơi vào tay `users[0]` |
| 🟡 Trung bình | `node_modules/` (khoảng 29.579 file) và `dist/` bị commit vào git | Repo nặng, diff khó đọc, dễ lệch giữa môi trường |
| 🟡 Trung bình | Thời lượng bài thường bằng 0 vì oEmbed không trả về | Hẹn giờ phía server không hoạt động, phải trông chờ hoàn toàn vào máy phát |
| 🟡 Trung bình | Địa chỉ server ghi cứng trong client, còn nhiều `console.log` gỡ lỗi | Không self-host được nếu không sửa code |
| 🟢 Nhẹ | Test gần như chỉ là file mẫu của Nest | Không có lưới an toàn khi sửa |

---

## 3. Phạm vi

### 3.1 Trong phạm vi v2

Bảo mật danh tính, lưu trữ bền, hàng chờ công bằng, màn hình máy phát, tìm kiếm YouTube, đóng gói self-host, giao diện điện thoại 3 tab, test tự động, dọn repo. Toàn bộ tính năng hiện có được giữ lại.

### 3.2 Ngoài phạm vi (YAGNI)

Đăng nhập Google hoặc email; playlist và thư viện cá nhân; lời bài hát; gợi ý bài; Spotify hay nguồn nhạc khác ngoài YouTube; chế độ cloud cho nhiều tổ chức; ứng dụng mobile native; nhiều server chạy song song (Redis adapter); giao diện tiếng Anh (chuỗi văn bản đã tách sẵn để dịch sau).

---

## 4. Kiến trúc tổng thể

```
 Điện thoại / laptop nhân viên            Máy phát (laptop + loa Bluetooth)
          │  http://<ip>:8080                      │  http://<ip>:8080/r/K7M2QX/host
          ▼                                        ▼
 ┌──────────────────────── Caddy (cổng duy nhất, HTTPS tùy chọn) ────────────────────────┐
 │   /api/*, /socket.io/*  ──────────────►  api (NestJS)  ──►  db (PostgreSQL 16+)       │
 │   mọi đường dẫn khác    ──────────────►  web (Next.js standalone)                     │
 └────────────────────────────────────────────────────────────────────────────────────────┘
                                         api ──► YouTube Data API v3 / oEmbed
```

- **Server là nguồn sự thật duy nhất.** Máy phát chỉ phát theo trạng thái server gửi xuống và báo lại khi đã phát, hết bài hoặc gặp lỗi.
- **Một địa chỉ duy nhất cho người dùng.** Caddy chuyển `/api` và `/socket.io` sang container api, nên không cần CORS. Chọn Caddy thay vì `rewrites` của Next.js vì cách sau không chắc chắn chuyển tiếp được kết nối WebSocket. Caddy còn tự lo HTTPS khi văn phòng muốn mở ra internet.
- **Chỉ chạy một instance api.** Không cần Redis ở v2. Thiết kế giữ ranh giới rõ ràng để sau này gắn `@socket.io/redis-adapter` khi lên cloud.

---

## 5. Thành phần

### 5.1 Server (NestJS): tách `rooms` hiện tại thành các module nhỏ

| Module | Trách nhiệm | Ghi chú khi chuyển từ code cũ |
|---|---|---|
| `config` | Đọc và kiểm tra biến môi trường bằng Zod. Thiếu biến bắt buộc thì không cho khởi động | Mới |
| `prisma` | `PrismaService` và các migration | Mới |
| `auth` | Cấp và kiểm tra token phiên. `WsAuthGuard` gắn `member` vào socket. Băm PIN bằng argon2 | Mới. Thay thế mọi chỗ đang tin vào id do client gửi |
| `rooms` | Tạo phòng (cần `SETUP_PASSWORD` nếu có cấu hình), lấy snapshot phòng, cấu hình phòng | Tách từ `RoomsService` |
| `members` | Vào phòng, kết nối lại, theo dõi online/offline, quyền (`role`, `canPlay`, `canControl`, `canDj`), mời ra khỏi phòng | Tách từ `RoomsService` |
| `queue` | `fair-queue.ts` (**hàm thuần**, không phụ thuộc Nest), thêm/xóa bài, ❤️, "Phát tiếp theo", giới hạn số bài mỗi người | Thay thế việc sắp xếp theo ❤️ và `reorderQueue` |
| `playback` | Trạng thái đang phát, chuyển bài (transaction + `version`), phiếu bỏ qua, hẹn giờ hết bài, cơ chế lease cho máy phát | Tách và gia cố |
| `music` | Interface `MusicProvider`, `YouTubeProvider` (Data API kèm fallback oEmbed), `link-parser.ts`, cache | Thay thế `fetchYoutubeMetadata` |
| `social` | Chat, reaction, soundboard DJ, lời chúc TTS, nhật ký hoạt động. Có giới hạn tần suất | Tách từ gateway |
| `realtime` | Gateway Socket.IO duy nhất: nhận lệnh, kiểm tra bằng Zod, chuyển cho service, trả ack, phát snapshot | Viết lại gateway, **giữ nguyên tên sự kiện** khi có thể |
| `health` | `GET /api/health` trả `{ status, db, contractsVersion }` | Mới |

### 5.2 Client (Next.js)

| Route | Nội dung |
|---|---|
| `/` | Tạo phòng (tên phòng, PIN admin, mật khẩu cài đặt nếu instance yêu cầu) hoặc nhập mã để vào phòng |
| `/r/[code]` | Giao diện thành viên, 3 tab: **Phòng** (đang phát, hàng chờ, ❤️, bỏ qua, reaction), **Thêm bài** (tìm kiếm, dán link, lời chúc), **Mọi người** (danh sách online, chat, quyền nếu là admin). Nhật ký hoạt động mở dạng popup như hiện tại |
| `/r/[code]/host` | Màn hình máy phát. Cần PIN admin, sau đó đăng ký thiết bị phát (xem §8.4) |
| `/room/[id]` | Chuyển hướng 308 sang `/r/[id]` để link cũ vẫn dùng được |

- Tận dụng component có sẵn: `QueueList`, `PlaybackControls`, `ChatList`, `ListenerList`, `DJSoundboard`, `WishModal`, `ActivityLogPopup`, `YoutubePlayer`, `SidebarTabs`.
- `RoomContext` được viết lại phần giao tiếp: mỗi lệnh dùng `emitWithAck`, nhận `room:update` kèm `version`, gửi token khi bắt tay socket.
- Địa chỉ socket lấy **cùng origin** với trang web (`io()` không truyền URL). Biến `NEXT_PUBLIC_WS_URL` chỉ còn dùng khi chạy dev hoặc demo trên Render.
- Mọi chuỗi giao diện nằm trong `src/i18n/vi.ts`.

### 5.3 Contracts dùng chung

- Thư mục `src/contracts/` có ở **cả hai repo**, nội dung giống hệt nhau. Repo server là bản gốc; client đồng bộ bằng `npm run contracts:sync` (copy từ thư mục `../music-room-server`).
- Nội dung gồm schema Zod cho payload của mọi lệnh, kiểu `Ack`, kiểu `RoomSnapshot`, và hằng số `CONTRACTS_VERSION`.
- Khi kết nối, client so `CONTRACTS_VERSION` của mình với giá trị server trả về. Nếu lệch thì hiện thông báo "Có phiên bản mới, hãy tải lại trang". Cơ chế này thay cho `ms_client_version` hiện tại.

---

## 6. Mô hình dữ liệu (Prisma, PostgreSQL)

```prisma
model Room {
  id            String   @id @default(cuid())
  code          String   @unique            // 6 ký tự, bảng chữ: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
  name          String
  adminPinHash  String
  settings      Json                         // RoomSettings (xem dưới)
  createdAt     DateTime @default(now())
  members       Member[]
  queueItems    QueueItem[]
  playback      PlaybackState?
  chatMessages  ChatMessage[]
  activityLogs  ActivityLog[]
}

model Member {
  id             String    @id @default(cuid())
  roomId         String
  displayName    String                       // 1–30 ký tự, đã trim
  displayNameKey String                       // lowercase, để kiểm tra trùng tên
  color          String
  role           MemberRole @default(USER)   // ADMIN | USER
  isDevice       Boolean   @default(false)   // true = thiết bị phát /host, không tính phiếu
  canPlay        Boolean   @default(false)
  canControl     Boolean   @default(false)
  canDj          Boolean   @default(false)
  tokenVersion   Int       @default(0)       // tăng khi bị mời ra hoặc thu hồi phiên
  kickedAt       DateTime?
  lastSeenAt     DateTime  @default(now())
  lastPlayedAt   DateTime?                   // lần gần nhất có bài của người này được phát
  createdAt      DateTime  @default(now())
  @@unique([roomId, displayNameKey])
}

model Track {                                // cache thông tin bài theo nguồn
  id           String   @id                  // "youtube:<videoId>"
  provider     String                        // "youtube"
  externalId   String
  title        String
  channel      String?
  durationSec  Int?                          // null = không rõ (lấy qua oEmbed)
  thumbnailUrl String?
  embeddable   Boolean  @default(true)
  fetchedAt    DateTime @default(now())
}

model QueueItem {
  id            String   @id @default(cuid())
  roomId        String
  trackId       String
  addedById     String?                      // null = playlist dự phòng (hệ thống)
  status        QueueStatus                  // QUEUED | PLAYING | PLAYED | SKIPPED | REMOVED
  pinnedAt      DateTime?                    // "Phát tiếp theo"
  wishMessage   String?                      // ≤ 200 ký tự
  voicePreset   String?                      // radio | drama | baby | panic | chipmunk | sleepy
  addedAt       DateTime @default(now())
  startedAt     DateTime?
  endedAt       DateTime?
  hearts        Heart[]
  skipVotes     SkipVote[]
}

model Heart     { queueItemId String; memberId String; @@id([queueItemId, memberId]) }
model SkipVote  { queueItemId String; memberId String; @@id([queueItemId, memberId]) }

model PlaybackState {
  roomId            String   @id
  currentItemId     String?
  status            PlaybackStatus            // IDLE | PLAYING | PAUSED
  positionSec       Float    @default(0)      // vị trí tại thời điểm updatedAt
  updatedAt         DateTime @updatedAt
  version           Int      @default(0)      // tăng sau MỌI thay đổi trạng thái phòng
  playerMemberId    String?                   // ai đang giữ lease phát
  playerLeaseUntil  DateTime?
}

model ChatMessage { id String @id @default(cuid()); roomId String; memberId String; content String; createdAt DateTime @default(now()) }
model ActivityLog { id String @id @default(cuid()); roomId String; memberId String?; type String; message String; metadata Json?; createdAt DateTime @default(now()) }
model SearchCache { key String @id; trackIds String[]; createdAt DateTime @default(now()) }  // key = provider + ":" + từ khóa đã chuẩn hóa
```

**`RoomSettings`** (kiểm tra bằng Zod, có giá trị mặc định):

```ts
{
  skipThreshold: 0.5,            // tỉ lệ thành viên online cần để bỏ qua bài
  maxQueuedPerMember: 4,         // giữ như hiện tại
  maxTrackDurationSec: 600,      // 0 = không giới hạn
  fallbackPlaylistUrl: null,     // playlist YouTube phát khi hàng chờ trống
  allowGuestDj: false,           // thành viên mới có canDj hay không
}
```

**Giới hạn lưu trữ:** mỗi phòng chỉ giữ 200 tin chat và 200 mục nhật ký gần nhất (một job dọn dẹp chạy mỗi giờ). Các `QueueItem` đã phát xong được giữ lại làm lịch sử.

---

## 7. Giao thức realtime

### 7.1 Kết nối

- Client gọi `io({ auth: { token } })`. Nếu chưa có token thì kết nối ẩn danh: chỉ được gọi `room:create`, `room:join`, `room:peek`.
- Server kiểm tra token, đối chiếu `tokenVersion` và `kickedAt`, gắn `socket.data.member`, cho socket vào kênh `room:<roomId>`, rồi gửi ngay một `room:update` chứa toàn bộ snapshot.
- Token: JWT HS256, payload `{ sub: memberId, rid: roomId, tv: tokenVersion }`, hạn 30 ngày. Client lưu ở `localStorage['mr:session:<CODE>']`.
- Ngắt kết nối **không xóa thành viên**, chỉ cập nhật trạng thái online/offline (một thành viên có thể mở nhiều socket cùng lúc).

### 7.2 Lệnh (client → server), tất cả đều có ack

```ts
type Ack<T = void> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };
```

| Sự kiện | Payload (đã bỏ mọi id định danh người gửi) | Quyền cần có |
|---|---|---|
| `room:create` | `{ name, displayName, adminPin, setupPassword? }` → `{ token, code }` | Ai cũng gọi được (nếu instance có `SETUP_PASSWORD` thì phải đúng mật khẩu) |
| `room:peek` | `{ code }` → `{ name, memberCount }` | Ai cũng gọi được |
| `room:join` | `{ code, displayName }` → `{ token }` | Ai cũng gọi được |
| `room:leave` | `{}` | Thành viên |
| `admin:claim` | `{ pin }` → `{ token }` | Thành viên |
| `host:register` | `{ code, pin }` → `{ token }` (tạo thành viên `isDevice=true`, `canPlay=true`) | Ai cũng gọi được, cần đúng PIN |
| `queue:add` | `{ input: string, wishMessage?, voicePreset? }` (`input` là link hoặc `trackId` lấy từ kết quả tìm kiếm) | Thành viên |
| `queue:remove` | `{ queueItemId }` | Người đã thêm bài, hoặc admin |
| `queue:pin-next` | `{ queueItemId }` | Admin hoặc `canControl` |
| `queue:heart` | `{ queueItemId }` (mỗi người một ❤️; thả bài khác thì tim cũ chuyển sang) | Thành viên |
| `queue:set-message` | `{ queueItemId, wishMessage, voicePreset? }` | Người đã thêm bài |
| `queue:vote-skip` | `{ queueItemId }` | Thành viên (không phải thiết bị phát) |
| `search:query` | `{ q }` → `TrackSummary[]` | Thành viên |
| `playback:control` | `{ action: 'play' \| 'pause' \| 'skip' \| 'seek', positionSec? }` | Admin hoặc `canControl` |
| `player:report` | `{ queueItemId, event: 'started' \| 'progress' \| 'ended' \| 'error', positionSec?, errorCode? }` | Chỉ thành viên đang giữ lease phát |
| `permission:set` | `{ memberId, canPlay?, canControl?, canDj?, role? }` | Admin |
| `member:kick` | `{ memberId }` | Admin |
| `room:settings` | `Partial<RoomSettings>` | Admin |
| `chat:send` | `{ content }` (1–500 ký tự) | Thành viên |
| `room:reaction` | `{ emoji }` (thuộc danh sách cho phép) | Thành viên |
| `dj:trigger` | `{ soundType }` (thuộc danh sách cho phép) | `canDj` hoặc admin |

Tên sự kiện của code cũ được giữ lại khi có thể. Các sự kiện bị bỏ: `room:transfer-admin` (thay bằng `permission:set` với `role`), `permission:set-control`, `permission:set-player`, `dj:toggle-permission` (đều gộp vào `permission:set`), `queue:reorder` (thay bằng `queue:pin-next`), `playback:sync` và `track:end` (thay bằng `player:report`), `room:sound-effect` (gộp vào `dj:trigger`).

### 7.3 Sự kiện server → client

| Sự kiện | Nội dung |
|---|---|
| `room:update` | `{ version, room: RoomSnapshot }`, gồm hàng chờ **đã sắp xếp**, bài đang phát, vị trí phát ước tính, danh sách thành viên (chỉ có `id`, tên, màu, quyền, online; **không có token**), cấu hình phòng |
| `chat:receive`, `room:reaction`, `dj:event`, `activity:new` | Giữ như hiện tại, nhưng tên người gửi do **server** điền |
| `player:command` | Gửi riêng cho thiết bị đang giữ lease: `{ queueItemId, videoId, positionSec, status }` |
| `session:revoked` | Bị mời ra khỏi phòng, hoặc thiết bị phát bị thiết bị khác chiếm lease |

- Client chỉ áp dụng `room:update` có `version` lớn hơn bản đang giữ.
- Khi kết nối lại, client luôn nhận một snapshot đầy đủ, nên không cần cơ chế phát lại các sự kiện đã lỡ.

### 7.4 Mã lỗi

`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION`, `ROOM_NOT_FOUND`, `NAME_TAKEN`, `PIN_INVALID`, `PIN_LOCKED`, `SETUP_PASSWORD_INVALID`, `QUEUE_LIMIT`, `TRACK_TOO_LONG`, `TRACK_NOT_EMBEDDABLE`, `LINK_UNSUPPORTED`, `SEARCH_UNAVAILABLE`, `QUOTA_EXCEEDED`, `RATE_LIMITED`, `STALE_ITEM`, `INTERNAL`. Client đổi mã lỗi thành câu tiếng Việt trong `vi.ts`.

---

## 8. Hành vi cốt lõi

### 8.1 Thuật toán xếp lượt công bằng (`fair-queue.ts`)

Hàm thuần: `orderQueue(items: QueuedItem[], members: Map<id, { lastPlayedAt: Date | null }>): QueuedItem[]`

1. **Bài được ghim** (`pinnedAt != null`) đứng đầu, xếp theo `pinnedAt` tăng dần.
2. Các bài còn lại được nhóm theo `addedById`. Trong mỗi nhóm, bài xếp theo `addedAt` tăng dần, và bài thứ *i* (đếm từ 0) thuộc **vòng *i***.
3. Xếp theo vòng tăng dần. Trong cùng một vòng, xếp theo thứ tự:
   1. Số ❤️ **giảm dần**.
   2. `lastPlayedAt` của người thêm **tăng dần**; ai chưa từng có bài được phát (`null`) đứng trước.
   3. `addedAt` tăng dần.
   4. `id`, để thứ tự luôn xác định.
4. Bài từ playlist dự phòng (`addedById = null`) **không** nằm trong hàng chờ. Server chỉ lấy chúng khi hàng chờ trống (§8.2).

Ví dụ (không có ❤️, không ai từng có bài được phát):
- An thêm A1, A2, A3; sau đó Bình thêm B1. Thứ tự: **A1, B1, A2, A3**.
- A1 phát xong, Chi thêm C1. Lúc này `lastPlayedAt` của An là mới nhất. Thứ tự: **B1, C1, A2, A3**. B1 và C1 cùng vòng 0, Bình và Chi đều chưa có bài được phát, Bình thêm trước.
- Nếu C1 có 2 ❤️, thứ tự là: **C1, B1, A2, A3**.

Hàm được gọi mỗi khi tạo snapshot và mỗi khi chọn bài tiếp theo. **Thứ tự không bao giờ được lưu vào database.**

### 8.2 Chuyển bài

Hàm `advance(roomId, expectedItemId, reason)` chạy trong **một transaction**:

1. `SELECT … FOR UPDATE` dòng `PlaybackState` của phòng.
2. Nếu `currentItemId !== expectedItemId` thì dừng ngay và không làm gì. Bước này giúp tín hiệu kết thúc bài bị gửi trùng, hoặc phiếu bỏ qua tới muộn, không làm nhảy mất hai bài.
3. Đánh dấu bài hiện tại là `PLAYED` (nếu lý do là `ended`) hoặc `SKIPPED` (nếu là `skip` hay `error`), rồi ghi `endedAt`. Cập nhật `lastPlayedAt` của người đã thêm bài khi bài đó được **bắt đầu** phát.
4. Bài tiếp theo là phần tử đầu của `orderQueue(...)`. Nếu hàng chờ trống, lấy một bài ngẫu nhiên chưa phát trong 20 bài gần nhất từ playlist dự phòng. Nếu không có playlist dự phòng, chuyển sang `IDLE`.
5. Tăng `version`, commit, phát `room:update` tới cả phòng và `player:command` tới thiết bị phát.

Có bốn nguồn kích hoạt `advance`:
- `player:report ended`.
- `player:report error` với mã lỗi YouTube 2, 5, 100, 101 hoặc 150.
- Đủ phiếu bỏ qua, hoặc admin bấm bỏ qua.
- **Hẹn giờ phía server**: khi biết thời lượng bài, server hẹn giờ ở mốc `duration + 5 giây`. Đây là lưới an toàn khi máy phát mất kết nối.

### 8.3 Bỏ phiếu bỏ qua

- Số phiếu cần = `max(1, ceil(onlineVoters × skipThreshold))`, trong đó `onlineVoters` là số thành viên đang online và có `isDevice = false`.
- Số phiếu đã có chỉ tính những người **đang online**.
- Mỗi khi có người vào hoặc rời phòng, server tính lại. Nếu đã đủ phiếu thì gọi `advance`.
- Ví dụ: có 5 người online thì cần 3 phiếu. Code cũ dùng `floor(n/2)+1` cũng ra 3 phiếu; hai công thức chỉ khác nhau khi số người là chẵn.

### 8.4 Thiết bị phát và lease

- Mỗi phòng chỉ có **một** thiết bị giữ lease phát (`playerMemberId`). Lease được gia hạn bằng `player:report progress` gửi mỗi 5 giây và hết hạn sau 20 giây không có báo cáo.
- Có hai cách để một thiết bị nhận lease:
  - Mở `/r/[code]/host` và nhập PIN. Thiết bị trở thành thành viên với `isDevice = true` và tự nhận lease.
  - Admin cấp quyền `canPlay` cho một thành viên. Cách này giữ nguyên hành vi hiện tại, cho phép phát từ một máy bất kỳ.
- Khi một thiết bị mới nhận lease, thiết bị cũ nhận `session:revoked { reason: 'player_replaced' }` và **dừng phát ngay**.
- Khi lease hết hạn: trạng thái hiển thị là "Máy phát mất kết nối", hàng chờ vẫn nhận bài mới, và vị trí phát được giữ lại. Lúc thiết bị phát kết nối lại, server gửi `player:command` với `positionSec` đã lưu để phát tiếp.
- Lần đầu mở trang, nút "▶ Bắt đầu phát" là bắt buộc vì trình duyệt chặn tự phát. Sau lần bấm đầu tiên, các bài tiếp theo tự phát.

### 8.5 Lời chúc TTS, soundboard DJ và reaction

- **Lời chúc TTS** chỉ được đọc trên **thiết bị phát**, ngay trước khi bài bắt đầu, bằng `speechSynthesis` của trình duyệt (giọng `vi-VN` nếu có). Trong lúc đọc, âm lượng YouTube được giảm xuống.
- **Âm thanh soundboard DJ** phát trên thiết bị phát. Các máy khác chỉ hiện hiệu ứng hình ảnh, trừ khi người dùng bật "nghe hiệu ứng trên máy này".
- **Reaction** chỉ là hiệu ứng hình ảnh trên mọi máy, như hiện tại.
- Giới hạn tần suất (theo từng thành viên): chat 5 tin trong 10 giây, reaction 10 lần trong 10 giây, DJ 1 lần mỗi 1,5 giây (giữ như cũ).

---

## 9. Nguồn nhạc

```ts
interface MusicProvider {
  readonly id: 'youtube';
  parseLink(input: string): { externalId: string } | null;
  getTracks(externalIds: string[]): Promise<TrackInfo[]>;  // gom tối đa 50 id một lần
  search(q: string): Promise<TrackInfo[]>;                  // tối đa 10 kết quả
  getPlaylistItems(url: string): Promise<string[]>;        // dùng cho playlist dự phòng
}
```

**`YouTubeProvider`**
- **Đọc link** hỗ trợ: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `music.youtube.com/watch?v=`, `m.youtube.com`, link có `&t=`, `&list=`, `&si=`, và chuỗi `videoId` 11 ký tự đứng riêng.
- **Có `YOUTUBE_API_KEY`:**
  - `getTracks` gọi `videos.list` với `part=snippet,contentDetails,status`, tốn 1 đơn vị cho mỗi lần gọi (tối đa 50 bài).
  - `search` gọi `search.list` với `type=video`, `videoEmbeddable=true`, `maxResults=10` (100 đơn vị), rồi gọi `getTracks` để lấy thời lượng.
- **Không có key, hoặc hết quota (`403 quotaExceeded`):**
  - `getTracks` chuyển sang oEmbed (không tính quota) và để `durationSec = null`.
  - `search` báo lỗi `SEARCH_UNAVAILABLE` hoặc `QUOTA_EXCEEDED`, giao diện gợi ý "dán link YouTube".
- **Cache:**
  - Bảng `Track` giữ 7 ngày; quá hạn thì làm mới khi bài được thêm lại.
  - Bảng `SearchCache` giữ 24 giờ. Từ khóa được chuẩn hóa: chữ thường, bỏ dấu tiếng Việt, gộp khoảng trắng.
- **Kiểm tra khi thêm bài:**
  - `embeddable = false` thì báo `TRACK_NOT_EMBEDDABLE`.
  - `durationSec > maxTrackDurationSec` thì báo `TRACK_TOO_LONG`.
  - Nếu `durationSec = null` thì cho thêm, nhưng giao diện ghi "không rõ thời lượng".
- **Gọi mạng:** timeout 5 giây, thử lại 1 lần với thời gian chờ ngẫu nhiên. Mỗi thành viên tối đa 10 lượt tìm mỗi giờ (lượt trúng cache cũng được tính, để chặn spam).
- **Tuân thủ điều khoản YouTube:**
  - Trình phát luôn **hiện rõ** ở kích thước tối thiểu 200×200 trên màn hình máy phát.
  - Không tách riêng phần âm thanh, không ẩn trình phát.
  - Gửi đúng HTTP Referer: Caddy giữ nguyên `Host`, và `origin` của trang được truyền vào `playerVars`.

---

## 10. Bảo mật

| Hạng mục | Quy định |
|---|---|
| Tạo phòng | Nếu đặt `SETUP_PASSWORD` thì bắt buộc nhập đúng; nếu không đặt thì ai cũng tạo được (dùng cho bản demo). So sánh mật khẩu bằng hàm thời gian hằng (`timingSafeEqual`) |
| PIN admin | 4–8 chữ số, băm bằng argon2id. Sai 5 lần trong 15 phút (tính theo IP + phòng) thì bị khóa 15 phút |
| Token | Ký bằng `JWT_SECRET`. Nếu không đặt, server tự sinh và lưu vào volume `/data/jwt-secret` ở lần chạy đầu. Thu hồi bằng cách tăng `tokenVersion` |
| Nguồn định danh | **Chỉ lấy từ `socket.data.member`.** Mọi trường id trong payload đều là id của *đối tượng bị tác động* (bài, thành viên), không bao giờ là id của người gửi |
| Kiểm tra dữ liệu | Schema Zod cho từng lệnh. Payload thừa trường hoặc sai kiểu đều bị từ chối với lỗi `VALIDATION` |
| CORS / Origin | Mặc định cùng origin. `CORS_ORIGINS` (danh sách) chỉ dùng khi chạy dev hoặc deploy web và api ở hai domain khác nhau. Không bao giờ dùng `*` |
| Giới hạn tần suất | Theo §8.5 và §9. Ngoài ra mỗi IP tối đa 20 lần `room:join` hoặc `room:create` mỗi phút |
| Bí mật | `YOUTUBE_API_KEY`, `JWT_SECRET`, `SETUP_PASSWORD` chỉ nằm trên server. Log không ghi token, PIN hay mật khẩu |
| Header HTTP | Helmet bật cho `/api`. Caddy thêm `X-Content-Type-Options` và `Referrer-Policy: strict-origin-when-cross-origin` |
| Hiển thị nội dung | React tự escape. Không dùng `dangerouslySetInnerHTML`. Tên hiển thị và nội dung chat được loại bỏ ký tự điều khiển |

---

## 11. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Hết quota hoặc không có key YouTube | Tìm kiếm bị tắt kèm thông báo; dán link vẫn chạy qua oEmbed |
| YouTube chậm hoặc lỗi | Timeout 5 giây, thử lại 1 lần, trả `INTERNAL` kèm câu thông báo dễ hiểu |
| Video lỗi khi phát | `player:report error`, server đánh dấu `SKIPPED`, ghi nhật ký và chuyển bài |
| Thiết bị phát mất kết nối | Hết lease sau 20 giây thì hiện banner; hẹn giờ phía server vẫn chuyển bài nếu biết thời lượng; phát tiếp khi kết nối lại |
| Thành viên mất mạng | Socket.IO tự kết nối lại (code cũ đã có), sau đó nhận snapshot mới |
| Server restart | Trạng thái được khôi phục từ Postgres. Hẹn giờ được tạo lại từ `PlaybackState` khi khởi động |
| Lệnh tới với `queueItemId` đã cũ | Trả `STALE_ITEM`, client tự đồng bộ theo snapshot |
| Database không kết nối được | `/api/health` báo `db: down`, Docker khởi động lại container theo `restart: unless-stopped` |
| Client và server lệch phiên bản | Hiện banner "Có phiên bản mới, hãy tải lại trang" |

Log dùng định dạng có cấu trúc bằng `nestjs-pino`. Mọi `console.log` gỡ lỗi trong code cũ được xóa.

---

## 12. Giao diện

- Giao diện thành viên **ưu tiên điện thoại**, gồm 3 tab ở dưới cùng (D7). Trên màn hình rộng (≥ 1024px), tab Phòng nằm bên trái, tab Mọi người và chat nằm ở cột phải.
- Màn hình máy phát theo đúng bố cục D8: trình phát YouTube; tên bài và người thêm; QR code tạo từ `PUBLIC_URL/r/<code>`; mã phòng; 2 bài tiếp theo; banner trạng thái kết nối.
- Giữ phong cách hình ảnh hiện tại (`RoomBackground`, `HeartCanvas`, `PlayingVisualizer`). Phần tinh chỉnh thẩm mỹ làm sau bằng `frontend-design`.
- Tự theo chế độ sáng/tối của hệ thống. Có trạng thái focus khi dùng bàn phím. Mọi nút chỉ có icon đều có `aria-label`.

---

## 13. Self-host và triển khai

**Các file trong repo server:** thư mục `deploy/` gồm `docker-compose.yml`, `Caddyfile`, `.env.example` và `README.md` (hướng dẫn cài đặt bằng tiếng Việt và tiếng Anh).

```yaml
services:
  caddy: { image: caddy:2, ports: ["${PORT:-8080}:8080"], depends_on: [web, api] }
  web:   { image: "ghcr.io/${IMAGE_OWNER:-hungnm-developer}/music-room-client:${TAG:-latest}" }
  api:   { image: "ghcr.io/${IMAGE_OWNER:-hungnm-developer}/music-room-server:${TAG:-latest}", env_file: .env, volumes: ["api-data:/data"], depends_on: [db] }
  db:    { image: postgres:16-alpine, volumes: ["db-data:/var/lib/postgresql/data"] }
```

**Biến môi trường:**

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `PUBLIC_URL` | ✅ | Ví dụ `http://192.168.1.20:8080`, dùng để tạo QR code |
| `SETUP_PASSWORD` | ✅ khi self-host | Mật khẩu để được tạo phòng |
| `YOUTUBE_API_KEY` | Khuyên dùng | Không có thì chỉ dán link được |
| `JWT_SECRET` | Không | Không đặt thì server tự sinh |
| `DATABASE_URL` | Không | Compose tự cấu hình |
| `CORS_ORIGINS` | Không | Chỉ dùng cho dev hoặc khi tách domain |

**Hoạt động của container:**
- Khi container api khởi động, nó chạy `prisma migrate deploy` trước rồi mới lắng nghe kết nối.
- Image được build nhiều tầng trên `node:22-alpine` (phiên bản cụ thể chốt ở bước lập kế hoạch), chạy bằng user không phải root, có `HEALTHCHECK`.

**CI (GitHub Actions) ở mỗi repo:**
- Mỗi PR chạy lint, kiểm tra kiểu và test.
- Khi tạo tag `v*`, CI build image cho `linux/amd64` và `linux/arm64` rồi đẩy lên GHCR.

**Bản demo Render:** `render.yaml` được giữ lại và cập nhật thêm Postgres miễn phí của Render. Bản này **không phải** đường triển khai chính.

---

## 14. Kiểm thử

| Tầng | Công cụ | Nội dung tối thiểu |
|---|---|---|
| Unit (server) | Jest (đã có) | `fair-queue`: ≥ 15 trường hợp (vòng, ❤️, ghim, người mới vào, người bị mời ra, bài bị xóa, tie-break); `link-parser`: mọi dạng link ở §9; công thức số phiếu bỏ qua; sinh mã phòng; kiểm tra `RoomSettings` |
| Integration (server) | Jest + Testcontainers (Postgres) + `socket.io-client` | Hai lệnh `advance` cùng lúc chỉ chuyển 1 bài; giả danh `userId` trong payload không có tác dụng; PIN sai 5 lần thì bị khóa; token bị thu hồi thì bị chặn; hết quota thì chuyển sang oEmbed; lease phát bị chiếm thì thiết bị cũ bị thu hồi; restart thì khôi phục được trạng thái. **YouTube luôn được giả lập** bằng `nock` |
| Unit (client) | Vitest + Testing Library | Chọn snapshot theo `version`, đổi mã lỗi thành câu tiếng Việt, logic `PlayerAdapter` |
| E2E | Playwright (plugin đã cài) | Docker Compose chạy trong CI; 2 thành viên và 1 máy phát; thêm bài thì mọi người thấy; ❤️ làm đổi thứ tự trong vòng; bỏ phiếu thì chuyển bài; tải lại trang máy phát thì phát tiếp. Trình phát YouTube được thay bằng `FakePlayerAdapter` khi `NEXT_PUBLIC_E2E=1` |
| Thử tay trước khi phát hành | Checklist trong `deploy/README.md` | Máy thật, loa Bluetooth thật, YouTube thật, 1 giờ liên tục, 3 điện thoại |

**Viết test trước (TDD)** cho `fair-queue`, `link-parser`, `advance` và các guard phân quyền.

---

## 15. Lộ trình

Mỗi giai đoạn là một hoặc vài PR vào `develop`, và mỗi giai đoạn tự chạy được.

| GĐ | Nội dung | Tiêu chí hoàn thành |
|---|---|---|
| **0. Dọn repo** | `git rm -r --cached node_modules dist`; sửa `.gitignore`; đưa URL server ra biến môi trường; xóa log gỡ lỗi; CI chạy lint, kiểm tra kiểu và test ở cả 2 repo | Clone repo dưới 5 MB; CI xanh; ứng dụng chạy như trước |
| **1. Bảo mật danh tính** | Module `auth`, token và `WsAuthGuard`; bỏ mọi id người gửi khỏi payload; Zod; ack; CORS; giới hạn tần suất. Lưu trữ **vẫn trong RAM** | Test integration "giả danh không có tác dụng" chạy xanh; mọi tính năng cũ vẫn chạy |
| **2. Lưu trữ bền** | Prisma, Postgres, bảng §6; phòng không bị xóa khi trống; kết nối lại bằng token; `admin:claim` bằng PIN; dữ liệu cũ trong RAM không cần chuyển sang | Restart api không mất phòng hay hàng chờ; tải lại trang vẫn là người cũ |
| **3. Hàng chờ công bằng** | `fair-queue.ts` (TDD); ❤️ trong cùng vòng; `queue:pin-next`; bỏ `queue:reorder`; giao diện hiện "vòng" và người thêm | Unit test xanh; ví dụ ở §8.1 chạy đúng trên giao diện |
| **4. Máy phát** | Route `/r/[code]/host`, `host:register`, lease, `player:report`, `player:command`, QR, banner, phát tiếp khi kết nối lại, TTS và DJ trên máy phát, `advance` trong transaction | Test integration về đua lệnh và lease xanh; thử tay 1 giờ |
| **5. Tìm kiếm YouTube** | `MusicProvider`, `YouTubeProvider` (Data API, oEmbed, cache), `search:query`, tab Thêm bài, playlist dự phòng | Tìm thấy bài; hết quota thì chuyển sang dán link; lặp lại từ khóa thì không tốn quota |
| **6. Self-host** | Dockerfile cho 2 repo, `deploy/` gồm compose, Caddy và tài liệu; CI đẩy image lên GHCR; cập nhật `render.yaml` | Máy sạch chạy `docker compose up -d` thì dùng được trong vòng dưới 15 phút |
| **7. Giao diện và E2E** | Giao diện điện thoại 3 tab, giao diện màn hình rộng, `vi.ts`, chuyển hướng `/room/[id]`, các bài E2E ở §14 | E2E xanh trong CI |

Thứ tự trên có chủ đích: **bảo mật trước lưu trữ**, vì lưu trữ một hệ thống ai cũng giả danh được thì không có giá trị. Giai đoạn 3 và 5 có thể làm song song sau khi xong giai đoạn 2.

---

## 16. Rủi ro và câu hỏi mở

| # | Nội dung | Cách xử lý |
|---|---|---|
| R1 | Repo thuộc HungNM-Developer; người viết spec chỉ có quyền đọc | Xin quyền collaborator, hoặc làm qua fork rồi gửi PR. **Cần thống nhất spec này với HungNM và phuong-airstage trước khi code** |
| R2 | Đổi giao thức socket làm client cũ không dùng được | Client và server phải deploy cùng lúc theo từng giai đoạn; kiểm tra `CONTRACTS_VERSION` để báo người dùng tải lại |
| R3 | Điều khoản của YouTube với việc phát nhạc nơi công cộng hay văn phòng chưa rõ ràng | Ghi rõ trong README rằng người cài đặt chịu trách nhiệm về bản quyền nơi phát |
| R4 | Mỗi key YouTube chỉ có khoảng 95 lượt tìm không trúng cache mỗi ngày | Có cache, giới hạn tần suất, ưu tiên dán link; README hướng dẫn cách xin tăng quota |
| Q1 | Hiện tại TTS và soundboard đang phát trên mọi máy hay chỉ trên máy phát? | Kiểm tra `RoomContext` ở giai đoạn 4. Spec này chốt **chỉ trên máy phát** (§8.5) |
| Q2 | Commit `ff1af6a4` ghi "chia sẻ quyền admin cho nhiều người", nhưng code chỉ có một `adminId` | Spec chốt **cho phép nhiều admin** (`role = ADMIN`) |
