# Playlist cá nhân (L2)

Ngày: 2026-10-15 · Contracts: `2026-10-15.9` · Giai đoạn 2, dự án con 2 · Cần đăng nhập (L1)

## Dữ liệu

- `Playlist { id, ownerId → User (xoá theo), name ≤ 60, description ≤ 200?, shareCode? (duy nhất),
  createdAt, updatedAt }`; tối đa 50 playlist / người.
- `PlaylistItem { id, playlistId (xoá theo), trackId, position, addedAt }`, mỗi bài một lần trong
  một playlist; tối đa 200 bài.

## Lệnh (đều cần tài khoản, trừ xem bằng mã chia sẻ)

- `playlist:mine { trackId? }` → `{ playlists: PlaylistSummaryView[] }` (mới sửa trước; `hasTrack`
  cho "Lưu vào…").
- `playlist:create { name, trackIds? ≤ 200 }` → `{ id }` (tạo kèm bài: "Playlist mới" từ nút Lưu,
  "Lưu thành playlist" từ playlist YouTube).
- `playlist:update { id, name?, description? }`, `playlist:delete { id }`.
- `playlist:set-track { id, trackId, saved }` (thêm vào cuối / bỏ), `playlist:move { id, trackId, to }`.
- `playlist:get { id } | { shareCode }` → `PlaylistView` (tên, mô tả, chủ, bài, `isOwner`, `shareCode`).
  Bằng `shareCode` thì ai cũng xem được, không cần đăng nhập.
- `playlist:share { id, enabled }` → `{ shareCode | null }` (bật: mã mới 10 ký tự; tắt: xoá mã,
  link cũ hết hiệu lực).
- `playlist:copy { shareCode }` → `{ id }` (bản sao về tài khoản mình).
- Lỗi mới: `PLAYLIST_NOT_FOUND`, `PLAYLIST_LIMIT` (50), `PLAYLIST_FULL` (200).
- Thêm vào hàng chờ dùng lại `queue:add-many` (A5): theo suất, công bằng, chặn trùng.

## Giao diện

- Nút Lưu 🔖: khách bấm là lưu / bỏ Yêu thích như cũ; đã đăng nhập thì mở **Lưu vào…**: ô
  Yêu thích, các playlist có dấu tích, "+ Playlist mới".
- Tab thứ ba của Thêm bài đổi thành **Của tôi**: Yêu thích, và (khi đăng nhập) danh sách playlist →
  xem chi tiết: đổi tên, xoá, chia sẻ (bật/tắt, sao chép link), bài có nút lên / xuống / bỏ,
  "Thêm vào hàng chờ" (chọn bài, giới hạn bằng số suất còn lại).
- Khung "Mở playlist" YouTube (A5): thêm nút **Lưu thành playlist** khi đã đăng nhập.
- Link chia sẻ `/p/<mã>`: trang xem playlist; đã đăng nhập thì **Lưu bản sao**; dán link này vào ô
  Thêm bài trong phòng để chọn bài thêm vào hàng chờ.

## Kiểm tra

Không test tự động. Lint + typecheck + build; Chrome headless trên **DB Docker** (xác nhận đích
trước khi chạy) với token tài khoản thử ký từ server dev.
