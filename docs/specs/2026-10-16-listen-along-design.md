# Nghe cùng từ xa (N1) và "Đang nghe cùng" (N3)

Ngày: 2026-10-16 · Contracts: `2026-10-16.2` · Đợt 2 nhóm "cộng đồng" · Không có migration

## N1. Nghe cùng

- Thẻ Đang phát có nút **🎧 Nghe cùng** (thành viên, không phải máy phát, không có quyền Máy phát).
  Bật thì hiện khối "Đang nghe cùng trên máy này": trình phát YouTube nhìn thấy được, cao tối thiểu
  200 px (chính sách YouTube), thanh âm lượng riêng (nhớ trong `localStorage`), nút **Tắt nghe cùng**.
- Máy nghe cùng chỉ đọc snapshot phòng (bài, PLAYING / PAUSED, `positionSec` + `positionAt` theo đồng
  hồ server, như máy phát): bài mới → nạp ở đúng giây; tạm dừng / phát tiếp; lệch > 2,5 giây → tua
  (kiểm tra mỗi 4 giây, kể cả sau quảng cáo). Không lấy quyền phát, không báo về server.
- Lời chúc được đọc (giọng máy) và nhạc được hạ nhỏ như trên loa; hiệu ứng DJ cũng phát. Câu MC (AI3)
  chỉ có trên loa vì nó nằm trong lệnh gửi riêng cho máy phát.
- Rời trang phòng thì tắt. Tải lại trang thì tắt (trình duyệt cần một lần bấm để phát tiếng).
- Điện thoại: trình duyệt dừng video nhúng khi tắt màn hình hoặc chuyển ứng dụng → nhắc "Giữ màn hình mở".
- Mini player (M1) có nút 🎧 và âm lượng nghe cùng.

## N3. Ai đang nghe cùng

- `listen:set { on }` (thành viên, 20 lần/phút). Server giữ trong bộ nhớ theo **socket**
  (`PresenceService`): một thành viên "đang nghe" khi có ít nhất một socket đang nghe; đóng tab /
  mất kết nối tự bỏ. Đổi trạng thái thì phát lại snapshot. Client gửi lại sau mỗi lần kết nối lại.
- `MemberView.listening`. Giao diện: dãy avatar "🎧 N người đang nghe cùng từ xa" dưới thẻ Đang phát
  và trên màn hình loa (cạnh mã QR); huy hiệu 🎧 ở tab Mọi người.

## Không làm

M2 (điều khiển ở màn hình khoá): âm thanh phát từ iframe YouTube nên Media Session của trang không
điều khiển được, và điện thoại đã dừng nhạc khi khoá màn hình.

## Kiểm tra

Không test tự động. Lint + typecheck + build; probe Socket.IO: bật / tắt, hai tab cùng người, đóng
tab đang nghe, mất kết nối, payload sai. Trình duyệt trên DB Docker: nghe cùng lệch < 0,6 giây,
theo tạm dừng (34,9 so với 35), tua tới 120 giây, đổi bài; màn hình loa hiện "1 người đang nghe
cùng từ xa" và biến mất khi tắt. Một video BBC báo lỗi phát khi nhúng (lỗi của YouTube, máy phát
cũng sẽ gặp), Chromium của Playwright bị YouTube chặn phát.
