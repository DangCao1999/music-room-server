# Chặn bài trong phòng

Ngày: 2026-10-16 · Contracts: đổi (bump `CONTRACTS_VERSION`) · Migration `blocked_tracks`

## Vì sao

Văn phòng nghe chung một chiếc loa. Thỉnh thoảng có người thêm một bài không hợp với nơi làm việc
đông người. Quản trị viên phòng cần làm ba việc cùng lúc: tắt / gỡ bài đó ngay, không ai thêm lại
được nữa, và xem lại (bỏ chặn) các bài đã chặn.

## Mục tiêu

- Quản trị viên chặn một **video YouTube** trong **phòng của mình**: đang phát thì qua ngay (không bỏ
  phiếu), đang chờ thì gỡ khỏi hàng chờ.
- Sau khi chặn, **không ai** thêm được video đó vào phòng, bằng bất kỳ đường nào.
- Quản trị viên xem danh sách bài đã chặn và **bỏ chặn**.

## Không làm

- Không chặn theo tên bài / ca sĩ / bản khác của cùng bài: chỉ đúng video (`Track.id`, dạng
  `youtube:<videoId>`). Bản lyric, remix, re-up là video khác, không bị chặn.
- Không chặn trên nhiều phòng: mỗi phòng một danh sách riêng.
- Không ghi lý do chặn.
- Không chặn từ Slack (bot không biết chắc ai là quản trị viên). Slack chỉ báo lỗi khi thêm bài bị chặn.
- Không phạt / nhắc riêng người đã thêm bài.

## Điều không được để xảy ra

- Bài đã chặn vẫn lọt vào loa qua một đường nào đó (radio, playlist dự phòng, thêm nhiều bài, Slack…).
- Thành viên thường chặn / bỏ chặn được, hoặc mở được danh sách "Đã chặn". (Dòng hoạt động "<quản
  trị viên> đã chặn …" thì ai cũng thấy — người dùng đã đồng ý.)
- Làm người thêm bài bị bêu tên trước cả phòng: dòng hoạt động chỉ nêu người chặn và tên bài.

## Quyền

- Chỉ `role === 'ADMIN'` được chặn, bỏ chặn và xem danh sách đầy đủ. `canControl` **không** đủ.
- Quản trị viên **cũng không** thêm được bài đang bị chặn (phải bỏ chặn trước). Luật này khác luật
  "thêm lại bài vừa phát" (quản trị viên được bỏ qua) — cố ý, cho rõ ràng.

## Giao diện (đã chốt với người dùng qua mockup)

### Nút chặn: trong menu ⋯

- **Thẻ Đang phát** (quản trị viên): thêm nút ⋯ cạnh ⏸ / ⏭; menu có mục **"🚫 Chặn bài này trong
  phòng"** (màu cảnh báo). Không đặt nút 🚫 trực tiếp lên thẻ.
- **Hàng chờ**: menu ⋯ hiện có (Phát tiếp theo / Lời chúc / Xoá khỏi hàng chờ) thêm mục **"🚫 Chặn bài
  này trong phòng"** dưới "Xoá khỏi hàng chờ", chỉ quản trị viên thấy.
- **Tab "Đã phát"** (khung Thêm bài): mỗi bài có thêm nút ⋯ (chỉ quản trị viên) với mục chặn — để chặn
  một bài đã phát từ trước.
- Mọi chỗ dùng chung **hộp xác nhận**:
  - Tiêu đề: `Chặn "<tên bài>"?`
  - Nội dung: "Bài đang phát sẽ qua ngay. Từ giờ không ai thêm lại được video này trong phòng, kể cả từ
    Slack." (câu đầu chỉ hiện khi bài đang phát; đang chờ thì "Bài sẽ được gỡ khỏi hàng chờ.") và
    "Bỏ chặn ở Thêm bài → Đã chặn."
  - Nút: **Huỷ** · **🚫 Chặn bài** (màu đỏ). Thành công → toast "Đã chặn …".

### Danh sách: tab "Đã chặn" trong khung Thêm bài

- Tab thứ tư sau **Tìm kiếm · Đã phát · Của tôi**, nhãn "🚫 Đã chặn" kèm số bài; **chỉ quản trị viên
  thấy tab**.
- Mỗi dòng: ảnh bìa (xám bớt), tên bài, "<tên người chặn> chặn · <thời điểm>", nút **Bỏ chặn**.
  Mới chặn nằm trên cùng.
- Trống: "Chưa chặn bài nào. Chặn từ menu ⋯ của bài đang phát hoặc trong hàng chờ."
- Bỏ chặn: không cần hộp xác nhận (đảo ngược được, rủi ro thấp); toast "Đã bỏ chặn …".

### Bài bị chặn ở những chỗ khác (mọi thành viên)

- Kết quả **Tìm kiếm**, tab **Đã phát**, gợi ý (Suggestions / DJ / Taste), playlist khi thêm: bài bị
  chặn vẫn hiện nhưng có nhãn **"Đã chặn"** và nút thêm bị tắt. Không ẩn đi (người dùng cần biết vì
  sao không thêm được).
- Thêm bị từ chối → lỗi mới `TRACK_BLOCKED`: **"Bài này đã bị quản trị viên chặn trong phòng."**

### Lịch sử hoạt động

- `track_block`: `đã chặn "<tên bài>"` · `track_unblock`: `đã bỏ chặn "<tên bài>"` (tác giả = quản
  trị viên, mọi thành viên thấy như các dòng hoạt động khác — người dùng đã đồng ý). Không nêu người
  đã thêm bài.

### Tổng kết phòng (A8)

- *Quyết định của người viết:* bài đang bị chặn không xuất hiện trong `RecapView.topSongs` và không được
  đưa vào dữ liệu cho câu nhận xét AI của tổng kết — tránh bài vừa chặn lại hiện lên màn hình chung.

## Server

### Dữ liệu

Bảng mới (migration `blocked_tracks`):

```prisma
model BlockedTrack {
  id            String   @id @default(cuid())
  roomId        String
  room          Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  trackId       String
  track         Track    @relation(fields: [trackId], references: [id])
  /// Tên quản trị viên lúc chặn (thành viên có thể đổi tên / rời phòng sau đó)
  blockedByName String
  createdAt     DateTime @default(now())

  @@unique([roomId, trackId])
  @@index([roomId])
}
```

Chỉ chặn được video đã có trong bảng `Track` (mọi bài đang phát / trong hàng chờ / đã phát đều có).

### Lệnh mới (socket, ack như các lệnh khác)

- `track:block` `{ trackId }` → `{}`. Admin; trong `state.mutate`:
  1. tạo `BlockedTrack` (đã có → thành công luôn, không lỗi);
  2. mọi `QueueItem` của phòng với `trackId` đó đang `QUEUED` → `REMOVED`;
  3. nếu bài đang phát (`PLAYING` / `PAUSED`) là `trackId` đó → qua bài như nút ⏭ của quản trị viên
     (`PlaybackService.advance(..., 'skip')`), không bỏ phiếu; cuộc bỏ phiếu đang mở (nếu có) đóng theo;
  4. ghi `track_block`.
- `track:unblock` `{ trackId }` → `{}`. Admin; xoá dòng (không có → thành công), ghi `track_unblock`.
- `track:blocked` `{}` → `{ items: BlockedTrackView[] }`. Admin; mới nhất trước.

```ts
interface BlockedTrackView {
  track: TrackSummary;
  blockedByName: string;
  blockedAt: string; // ISO
}
```

- Không phải admin → `FORBIDDEN`. Không thêm rate limit riêng (các lệnh quản trị hiện có như
  `member:kick`, `room:settings` cũng không có) — *quyết định của người viết*.

### Snapshot

- `RoomSnapshot.room.blockedTrackIds: string[]` — gửi cho mọi người để giao diện đánh dấu "Đã chặn"
  và tắt nút thêm. Chỉ là id, không có ai chặn / lúc nào. Danh sách đầy đủ chỉ qua `track:blocked`.
- Thay đổi chặn / bỏ chặn đi qua `state.mutate` nên mọi client nhận snapshot mới ngay.

### Mọi đường vào hàng chờ đều kiểm tra

- `QueueService.checkAddable` (dùng chung cho `add` và `addMany`): `TRACK_BLOCKED` nếu có
  `BlockedTrack(roomId, trackId)` — kiểm tra **trước** các luật khác, áp dụng cả quản trị viên.
- `QueueService.add`: kiểm tra sớm theo `youtube:<videoId>` **trước** khi tra YouTube (không tốn quota
  cho bài bị chặn), và kiểm lại trong transaction (như các luật khác).
- `addMany` (playlist, nhập danh sách bài L4, nhập YouTube, Đã phát…) → bài bị chặn vào `skipped` với
  lý do `TRACK_BLOCKED`; client đã hiển thị lý do bỏ qua theo mã lỗi.
- Radio (`SuggestService.radioPick`) và playlist dự phòng (`createFallbackItem`) loại bài bị chặn khỏi
  danh sách chọn.
- Gợi ý (suggest:next, dj:ask, taste) không cần lọc ở server: client đánh dấu nhờ `blockedTrackIds`
  (người dùng vẫn thấy, không thêm được). Builder có thể lọc thêm ở server nếu đơn giản hơn.
- Slack (`ChatRoomService.add` → `QueueService.add`) tự nhận lỗi; thêm câu tiếng Việt cho
  `TRACK_BLOCKED` vào `src/chat/chat-text.ts`.

### Contracts

- `ERROR_CODES` thêm `'TRACK_BLOCKED'`; `BlockedTrackView`; ba lệnh trong `CommandInputs` /
  `CommandResults`; schema zod cho input (`trackId` dạng `youtube:<11 ký tự>`); `blockedTrackIds`
  trong snapshot.
- **Bump `CONTRACTS_VERSION`** — trước khi bump, `git fetch` server `origin/develop` vì đồng đội đẩy
  thẳng lên develop và có thể đã dùng số kế tiếp. Client đồng bộ bằng `npm run contracts:sync`.

## Client

- `vi.ts`: chuỗi cho menu, hộp xác nhận, tab, trống, toast, nhãn "Đã chặn", lỗi `TRACK_BLOCKED`.
- Thẻ Đang phát: nút ⋯ (admin) + menu (dùng lại kiểu menu / sheet của hàng chờ).
- Hàng chờ: mục chặn trong menu ⋯ (admin).
- Khung Thêm bài: tab "Đã chặn" (admin) gọi `track:blocked` khi mở tab và khi `blockedTrackIds` đổi;
  tab "Đã phát" thêm ⋯ (admin) và nhãn "Đã chặn".
- `TrackRow` (dùng cho tìm kiếm / đã phát / gợi ý): trạng thái "Đã chặn" — nút thêm tắt, nhãn thay thế.
- Hộp xác nhận dùng lại component dialog sẵn có.

## Để builder quyết

- Bố cục / icon chính xác (theo design hiện có: `panel`, `amber`, `alert`/`onair` cho hành động nguy hiểm).
- Cách gom lệnh vào service: `QueueService` hay service mới `BlockService` (miễn mọi đường thêm bài
  đi qua cùng một kiểm tra).
- Có lọc gợi ý ở server hay không.
- Giới hạn độ dài danh sách hiển thị (thực tế vài chục bài).

## Kiểm thử

Theo quy ước dự án: không viết test tự động; kiểm bằng lint, typecheck, build và chạy thử trên dev
(`localhost:55432`, không đụng production):

- Probe socket: admin chặn bài đang phát → qua ngay; chặn bài trong hàng chờ → gỡ; thêm lại (link,
  `addMany`, Slack giả) → `TRACK_BLOCKED`; admin thêm cũng bị từ chối; thành viên gọi 3 lệnh →
  `FORBIDDEN`; radio / dự phòng không chọn bài bị chặn; bỏ chặn → thêm được.
- Trình duyệt: menu ⋯ (đang phát, hàng chờ, đã phát), hộp xác nhận, tab Đã chặn (admin thấy, thành
  viên không), nhãn "Đã chặn" trên kết quả tìm kiếm.
