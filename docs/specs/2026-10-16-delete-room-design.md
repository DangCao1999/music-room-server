# Xoá phòng và dọn phòng mồ côi

Ngày: 2026-10-16 · Contracts: đổi (bump `CONTRACTS_VERSION`) · Migration `room_last_used`

## Vì sao

Theo thời gian sẽ tồn đọng phòng thử, phòng cũ không ai dùng và phòng tạo nhầm. Người tạo phòng cần
tự xoá được phòng của mình. Những phòng không có chủ (tạo lúc chưa đăng nhập, người tạo không bao
giờ đăng nhập) thì hệ thống tự dọn khi bỏ không đủ lâu.

## Mục tiêu

- **Chủ phòng** xoá phòng của mình (một thao tác, có xác nhận chắc chắn).
- **Phòng mồ côi** (không có chủ) **30 ngày không ai dùng** thì server tự xoá.
- Quản trị viên của phòng mồ côi được nhắc rằng phòng sẽ tự xoá, và cách giữ phòng (người tạo đăng nhập).

## Không làm

- Không có thùng rác / khôi phục phòng đã xoá.
- Không cho quản trị viên nhận quyền bằng PIN xoá phòng (PIN có thể đã chia sẻ cho nhiều người).
- Không tự xoá phòng **có chủ**, dù bỏ không bao lâu.
- Không gửi email / tin nhắn báo trước khi tự xoá (phòng mồ côi không có ai để liên lạc).
- Không xoá playlist cá nhân, bài yêu thích, tài khoản: chúng gắn với tài khoản, không với phòng.
  *Quyết định của người viết:* bài "Lưu" của **khách chưa đăng nhập** (`Favorite`, gắn với thành viên)
  mất theo phòng — chấp nhận, vì trình duyệt của họ vẫn giữ bản lưu trên máy (localStorage).

## Điều không được để xảy ra

- Xoá nhầm một phòng còn người dùng (có người đang mở, hoặc có người làm gì trong 30 ngày, kể cả chỉ
  qua Slack). Nhạc phòng tự phát khi không có ai thì không tính là đang dùng.
- Ai khác ngoài chủ phòng xoá được phòng.
- Sau khi xoá, máy phát / người đang trong phòng bị treo hoặc lỗi khó hiểu thay vì được báo rõ.
- Lần dọn đầu tiên trên production xoá hàng loạt mà người dùng không biết trước.

## Khái niệm

- **Chủ phòng** = `Room.ownerId` (tài khoản Google). Đã có (L6): người tạo phòng đã đăng nhập lúc tạo,
  hoặc người tạo phòng (thành viên có `room_create` trong activity log) đăng nhập Google sau đó ngay
  trong phòng → phòng được gắn `ownerId`. Không đổi gì ở phần này.
- **Phòng mồ côi** = `ownerId` là `null`.
- **Đang dùng** = có **người** làm gì đó trong phòng (người dùng đã chốt: chỉ tính việc người làm).
  - Tính: mở / nối lại phiên vào phòng (thành viên, cả máy phát), thêm bài, bỏ phiếu, thả cảm xúc / tim,
    chat, mọi thao tác quản trị, và **mọi thao tác từ Slack** với phòng đó (lệnh `/music`, tag bot, nút
    trên tin nhắn, mở / bấm trên tab Home, hộp "Thêm bài").
  - **Không** tính: bài do radio / playlist dự phòng tự thêm, server tự chuyển bài khi hết bài
    (timer), bất cứ việc gì server tự làm.
  - Có người **online** trong phòng lúc kiểm tra (presence, kể cả máy phát đang mở trang) → đang dùng.
- **Lần dùng cuối**: cột mới `Room.lastUsedAt DateTime @default(now())` (migration `room_last_used`).
  - Cập nhật ở các việc "tính" ở trên, có giới hạn tần suất (ví dụ không ghi lại nếu giá trị hiện tại
    mới hơn 10 phút) để không ghi database mỗi thao tác.
  - Migration điền giá trị ban đầu cho phòng có sẵn = mốc muộn nhất trong: `Room.createdAt`,
    `Member.lastSeenAt`, `QueueItem.addedAt` của bài **có người thêm** (`addedById IS NOT NULL`),
    `ActivityLog.createdAt` của dòng **có người làm** (`memberId IS NOT NULL`).
  - *Quyết định của người viết:* dùng một cột riêng thay vì gộp nhiều bảng mỗi lần dọn — rõ ràng, nhanh,
    và Slack (vốn không ghi gì vào các bảng kia khi chỉ xem) cập nhật được.

## Xoá phòng (chủ phòng)

### Quyền

- Chỉ người đang trong phòng **và** đăng nhập đúng tài khoản `Room.ownerId` (member.userId === room.ownerId).
  Khác → `FORBIDDEN`. Không cần PIN.

### Giao diện

- **Cài đặt phòng** (chỉ chủ phòng thấy): cuối khung có mục "Xoá phòng" (màu cảnh báo) với một dòng
  giải thích và nút **Xoá phòng…**.
- **Phòng của tôi** (trang chủ, `me:rooms`): phòng có `isOwner` thêm nút ⋯ → "Xoá phòng…".
- **Hộp xác nhận** (dùng chung):
  - Tiêu đề: `Xoá phòng "<tên phòng>"?`
  - Nội dung: "Hàng chờ, lịch sử, chat và danh sách chặn của phòng sẽ mất hẳn, không khôi phục được.
    Mọi người đang trong phòng sẽ được đưa về trang chủ. Kênh Slack đang nối sẽ tự bỏ nối."
  - Ô nhập: "Gõ mã phòng <MÃ> để xác nhận" — nút **Xoá phòng** (đỏ) chỉ bật khi gõ đúng mã (không phân
    biệt hoa thường).
  - Thành công: về trang chủ, toast "Đã xoá phòng <tên>".

### Server

- Lệnh socket mới `room:delete` `{ code: RoomCodeSchema }` → `{}`. `code` phải khớp phòng của actor
  (chống bấm nhầm khi đang ở phòng khác; server so khớp lại, không chỉ client).
- Có thể gọi từ trang chủ (Phòng của tôi) khi **không** đang trong phòng đó: builder chọn cách — ví dụ
  một lệnh theo tài khoản đã đăng nhập (`me:room-delete { code }`, kiểm `room.ownerId === user.id`)
  hoặc mở phiên vào phòng rồi gọi `room:delete`. Yêu cầu: chỉ chủ phòng, xác nhận bằng mã phòng.
- Trình tự xoá (trong lock của phòng, `state.mutate` hoặc tương đương):
  1. Báo mọi socket của phòng (kể cả máy phát): sự kiện `session:revoked` với lý do mới
     **`'room_deleted'`** rồi ngắt kết nối.
  2. Xoá dòng `Room` (các bảng con đều `onDelete: Cascade`: thành viên, hàng chờ, phiếu, chat, activity,
     playback, chat link, bài bị chặn). `Track`, playlist, yêu thích không bị ảnh hưởng.
  3. Dọn trạng thái trong bộ nhớ của phòng: timer playback / bỏ phiếu, presence, lease máy phát,
     cache của Slack (notifier: thẻ bỏ phiếu đang mở, link cache; Home: người đang xem phòng đó), các
     map khác giữ `roomId`. Builder rà toàn bộ service giữ state theo `roomId`.
- Ghi log server (Logger): `room deleted by owner: <code> "<name>"`.

### Client khi bị đẩy ra

- `session:revoked` với `room_deleted` → xoá phiên đã lưu của phòng, về trang chủ, toast
  "Phòng <tên> đã bị chủ phòng xoá." (không có tên thì "Phòng đã bị chủ phòng xoá.").
- Màn hình máy phát (`/r/[code]/host`) cũng vậy (dừng phát, về trang chủ hoặc hiện màn hình báo).

## Dọn phòng mồ côi (tự động)

- Chạy **mỗi ngày một lần** trong server (cùng kiểu `setInterval(...).unref()` như
  `ApiDataRetentionService`), và một lần sau khi khởi động vài phút.
- Điều kiện xoá: `ownerId IS NULL` **và** `lastUsedAt` cũ hơn **30 ngày** **và** không ai online.
  Hằng số `ORPHAN_ROOM_DAYS = 30`.
- Xoá từng phòng theo đúng trình tự như xoá bằng tay (lý do `room_deleted` không cần báo ai vì phòng
  không có người online, nhưng vẫn dọn state bộ nhớ), giới hạn mỗi lần chạy (ví dụ 200 phòng) để
  không giữ database lâu.
- Log mỗi phòng: `orphan room deleted: <code> "<name>" last used <ISO>`; và tổng số mỗi lần chạy.
- **Lần chạy đầu trên production**: trước khi deploy, đếm (chỉ đọc) số phòng sẽ bị xoá và cho người dùng
  xem danh sách; người dùng đồng ý mới deploy. (Việc của người triển khai, không phải code.)

### Nhắc trong phòng mồ côi

- Snapshot thêm `room.hasOwner: boolean`.
- Quản trị viên (role ADMIN) trong phòng `hasOwner === false` thấy một dòng nhắc nhỏ (có thể đóng, nhớ
  theo phiên trình duyệt): "Phòng chưa có chủ nên sẽ tự xoá sau 30 ngày không ai dùng. Người tạo phòng
  đăng nhập Google để giữ phòng." Thành viên thường không thấy.

### Slack khi phòng bị xoá

- *Quyết định của người viết:* mỗi kênh đang nối nhận một tin ngắn "🎶 Phòng *<tên>* đã bị xoá nên kênh
  này đã tự bỏ nối." (đăng vào thread nếu link đang dùng thread); thẻ bỏ phiếu đang mở (nếu có) được sửa
  thành "Phòng đã bị xoá" (không còn nút). Gọi Slack **sau** khi xoá xong (ngoài lock), lỗi Slack chỉ ghi
  log. Người đang xem tab Home của phòng đó: lần mở / làm mới sau thấy phòng khác hoặc trang hướng dẫn
  nối (tự nhiên theo `roomsOfTeam`), không cần vẽ lại chủ động. Tự dọn mồ côi thì không đăng gì
  (phòng mồ côi có link Slack đang dùng thì không bị coi là bỏ không — xem dưới).

## Contracts

- `RevokeReason` thêm `'room_deleted'`.
- `RoomSnapshot.room.hasOwner: boolean`.
- Lệnh xoá (`room:delete`, và lệnh từ trang chủ nếu builder chọn lệnh riêng) + schema zod.
- **Bump `CONTRACTS_VERSION`** — `git fetch` server `origin/develop` trước khi bump (đồng đội đẩy thẳng
  lên develop). Client đồng bộ bằng `npm run contracts:sync`.

## Để builder quyết

- Lệnh xoá từ trang chủ: lệnh theo tài khoản hay đi qua phiên phòng.
- Chỗ đặt các lệnh cập nhật `lastUsedAt` (một helper dùng chung, gọi từ gateway / Slack) và mức giới
  hạn tần suất.
- Vị trí / kiểu dòng nhắc phòng mồ côi theo design hiện có.

## Kiểm thử

Theo quy ước dự án: không viết test tự động; lint, typecheck, build và chạy thử trên dev
(`localhost:55432`, không đụng production):

- Probe socket: chủ phòng (đăng nhập) xoá được; quản trị viên bằng PIN / thành viên → `FORBIDDEN`;
  mã phòng sai → từ chối; mọi socket trong phòng (kể cả máy phát) nhận `room_deleted` và bị ngắt;
  phòng biến mất (`/api/rooms/<code>/preview` → 404), các bảng con không còn dòng mồ côi; kênh Slack
  giả không còn nối; mã phòng tạo mới được dùng lại không lỗi.
- Dọn mồ côi: tạo phòng mồ côi và lùi `lastUsedAt` trong DB dev → bị xoá; phòng có chủ cùng tuổi →
  giữ; phòng mồ côi có người online → giữ; phòng mồ côi chỉ có radio tự phát (không ai làm gì) → bị xoá;
  một thao tác Slack (ví dụ mở tab Home) làm mới `lastUsedAt`.
- Trình duyệt: nút xoá chỉ hiện với chủ phòng, hộp xác nhận gõ mã, người ở tab khác bị đưa về trang chủ
  với toast; dòng nhắc phòng mồ côi chỉ hiện với quản trị viên.
