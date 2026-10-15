# Thư viện của phòng (A1) và Yêu thích (A2)

Ngày: 2026-10-15 · Contracts: `2026-10-15.4` · Giai đoạn 1 (không cần đăng nhập)

## A1. Đã phát

- Nguồn: `QueueItem` của phòng có `status ∈ {PLAYED, SKIPPED}` và `startedAt` khác null,
  gộp theo `trackId`. Không thêm bảng.
- `library:room { sort: 'recent' | 'loved' | 'most' }` → `{ items: LibraryItemView[] }`:
  - `recent`: lần phát cuối mới nhất trước;
  - `loved`: tổng tim qua mọi lần phát;
  - `most`: số lần phát.
  - Tối đa 50 bài; bỏ bài đã bị job lưu trữ 30 ngày xoá thông tin (`title = ''`).
- `LibraryItemView = { track, plays, hearts, lastPlayedAt, lastAddedBy: {id, displayName} | null }`
  (`null` = playlist dự phòng).
- "Thêm lại" dùng `queue:add` với link `https://youtu.be/<id>`: vẫn theo luật công bằng và
  giới hạn bài; bài server đã biết không tốn quota.

## A2. Yêu thích ("Lưu" 🔖)

Khác "Thả tim" (phiếu bầu đẩy bài trong hàng chờ), nên dùng biểu tượng và chữ riêng.

- Bảng `Favorite(memberId, trackId, createdAt)`, khoá `(memberId, trackId)`, xoá theo member.
- `favorite:set { trackId, saved }` (idempotent) → `{ saved }`. Thiết bị máy phát không dùng được.
- `favorite:list {}` → `{ tracks }` mới lưu trước, bỏ bài đã bị xoá thông tin.
- Sự kiện `favorite:ids { trackIds }` gửi riêng cho thành viên: lúc vào phòng và sau mỗi
  lần đổi (đồng bộ mọi tab). Không nằm trong snapshot vì snapshot dùng chung cả phòng.
- `tracks:lookup { videoIds }` (tối đa 50) → `{ tracks }` theo đúng thứ tự, bỏ bài không tìm
  thấy. Dùng `Track` đã có; bài lạ hoặc cũ hơn 7 ngày gọi `videos.list` (1 đơn vị / 50 bài)
  khi có API key, không có key thì thử từng bài (tối đa 10) qua đường lấy thông tin hiện có.
- Trên máy: `localStorage['mr:favorites']` = `[{ videoId, savedAt }]`, **chỉ ID** (chính sách
  YouTube: dữ liệu API lưu tối đa 30 ngày). Danh sách "Yêu thích" = bài lưu của thành viên
  trong phòng ∪ ID trên máy (lấy tên, ảnh qua `tracks:lookup`). Bỏ lưu xoá ở cả hai nơi.

## Giao diện

- Tab "Thêm bài": thanh chọn **Tìm kiếm | Đã phát | Yêu thích** (mặc định Tìm kiếm).
- Nút 🔖 ở thẻ Đang phát, từng bài trong hàng chờ, Đã phát và Yêu thích; optimistic.
- Trang máy phát không có nút 🔖.

## Kiểm tra

Không có test tự động. Lint + typecheck + build, rồi Chrome headless trên dev: lưu/bỏ lưu
ở các nơi; sang phòng khác vẫn thấy; vào lại bằng tên vẫn còn; ba cách xếp Đã phát;
"Thêm lại" theo giới hạn bài.
