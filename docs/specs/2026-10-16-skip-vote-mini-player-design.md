# Bỏ phiếu qua bài có thời hạn (V1) và mini player nổi (M1)

Ngày: 2026-10-16 · Contracts: `2026-10-16.1` · Đợt 1 nhóm "cộng đồng" · Migration `skip_vote_window`

## V1. Luật bỏ phiếu

- ✅ đầu tiên **mở** cuộc bỏ phiếu trong `skipVoteWindowSec` giây (cài đặt phòng, 10–60, mặc định 20);
  người mở là `skipVoteById`. ❌ chỉ bấm được khi đang mở (`VOTE_CLOSED`). Đổi ✅ ↔ ❌ được.
- Ngưỡng giữ nguyên R-25: `required = ceil(số người online không phải máy phát × skipThreshold)`;
  chỉ tính phiếu của người đang online.
- **Qua bài ngay** khi ✅ ≥ `required` (như cũ).
- **Nghe tiếp sớm** khi ✅ + số người online chưa bỏ phiếu < `required`, hoặc ✅ = 0 (người mở rời đi).
- **Hết giờ** mà chưa đủ → nghe tiếp. Nghe tiếp = xoá phiếu, đóng cuộc bỏ phiếu, khoá bài đó 2 phút
  (`skipBlockedUntil`, `SKIP_BLOCKED { seconds }`), ghi nhật ký `skip_kept`.
- Đánh giá lại sau mỗi phiếu, khi có người online/offline/rời/bị mời ra, khi đổi cài đặt và đúng hạn chót
  (hẹn giờ trong bộ nhớ, đặt lại khi khởi động; hạn đã qua thì xử lý ngay).
- Phiếu cũ (trước V1, không có hạn) vẫn chờ đủ ngưỡng như trước.
- `queue:vote-skip { queueItemId, approve? }` giới hạn 20 lần/phút. Gu nhạc (L5) chỉ coi ✅ là "không thích".

## Dữ liệu

- `QueueItem`: `skipVoteById`, `skipVoteEndsAt`, `skipBlockedUntil`. `SkipVote.approve` (mặc định true).
- `NowPlayingView.skip`: `votes`, `voters` (✅), `against`, `againstVoters` (❌), `required`, `openedBy`,
  `endsAt` và `blockedUntil` (epoch ms của server; client cộng `offset`).
- Popup đọc từ snapshot, không dùng sự kiện một lần: vào lại phòng vẫn thấy cuộc bỏ phiếu đang chạy.

## Giao diện

- **Thành viên:** thẻ nổi trên cùng: "X muốn qua bài", ✅ n/required · ❌ n, "còn N giây", thanh thời
  gian (CSS animation), nút **✅ Qua bài** (xanh), **❌ Nghe tiếp** (đỏ), **Để sau**. Đã bỏ phiếu hoặc
  "Để sau" thì thu gọn. Đóng thì hiện "Đã qua bài" / "Cả phòng muốn nghe tiếp" 2,5 giây.
- **Màn hình loa:** băng lớn, chỉ xem.
- **Nút Bỏ qua** ở thẻ Đang phát: "Đang bỏ phiếu…" khi đang mở, "Nghe tiếp (N giây)" khi bị khoá.
- Cài đặt phòng: "Thời gian bỏ phiếu qua bài (giây)".

## M1. Mini player nổi

- Nút "Thu nhỏ ra màn hình" ở thẻ Đang phát, chỉ hiện khi có `documentPictureInPicture`
  (Chrome/Edge máy tính). Cửa sổ 360×270 luôn nằm trên, nội dung là portal React từ trang phòng
  (chung store, socket), chép stylesheet và màu theo bài (`<html style>`).
- Nội dung: ảnh bìa, tên bài, người chọn, tiến độ, reaction ❤️ 🔥 👏, nút Bỏ qua, và thẻ bỏ phiếu V1.
- Đồng hồ đếm dùng timer của cửa sổ nổi (luôn hiển thị nên không bị trình duyệt hãm).
- Đóng tab phòng / rời phòng thì cửa sổ nổi đóng theo. Trình duyệt nhúng không tạo được cửa sổ
  (`requestWindow` lỗi) thì bỏ qua lặng lẽ.

## Kiểm tra

Không test tự động. Lint + typecheck + build; probe Socket.IO trên DB Docker (`localhost:55432`):
❌ khi chưa mở, ❌ chặn sớm + `SKIP_BLOCKED`, đủ ✅ qua ngay, hết giờ nghe tiếp, khởi động lại giữa
chừng; trình duyệt khổ điện thoại (thẻ, ✅ → "Đã qua bài", hết giờ → "Cả phòng muốn nghe tiếp", nút
khoá), màn hình loa, mini player trên Chromium (bỏ phiếu ngay trong cửa sổ nổi).
