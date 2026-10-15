# Dán danh sách bài (L4)

Ngày: 2026-10-15 · Contracts: `2026-10-15.12` · Giai đoạn 2, dự án con 4 · Khách và tài khoản

## Vì sao không dùng API Spotify

App Spotify ở chế độ Development chỉ cho 5 người dùng (thêm tay), chủ app cần Premium; mở rộng
(Extended Quota) chỉ dành cho doanh nghiệp ≥ 250.000 người dùng/tháng. Từ 02/2026 app Development
chỉ đọc được bài của playlist người dùng sở hữu. Vì vậy L4 nhận **danh sách bài dạng chữ** dán từ
bất kỳ đâu (Spotify, Apple Music, Zing…), không cần API hay quyền của dịch vụ nào.

## Lệnh

`songlist:match { lines: string[] ≤ 50, mỗi dòng ≤ 150 ký tự }` (cần là thành viên phòng; 20 lần /
10 phút) → `{ items: [{ line, status, track }], stopped }`, mỗi dòng một kết quả, giữ thứ tự:

- `found` (có `track`), `notFound` (YouTube không có bài phát được), `later` (chưa tìm),
  `unsupported` (link không phải video YouTube: Spotify, Apple Music…).
- `stopped`: lý do còn dòng `later` — `RATE_LIMITED { seconds }`, `QUOTA_EXCEEDED`,
  `SEARCH_UNAVAILABLE`, hoặc `TIME` (quá ~9 giây, để ack 15 giây không hết hạn).

Tách dòng dùng chung `splitSongList` / `cleanSongLine` (contracts, không Zod): bỏ số thứ tự, gạch
đầu dòng, thời lượng `3:45`; bỏ dòng trùng; lấy 50 dòng đầu. Server làm sạch lại từng dòng.

## Tìm bài, rẻ trước

1. Link video YouTube: tra cùng lúc (`videos.list`, như `tracks:lookup`).
2. Kết quả tìm trước đó cho cùng từ khoá (`SearchCache`, giữ thứ tự YouTube) — miễn phí.
3. Bài máy chủ đã biết trong 28 ngày, khớp đủ mọi chữ (từ 2 chữ trở lên) — miễn phí.
4. Tìm YouTube (`search:query` với `remote`), 4 lượt song song, dùng chung giới hạn 10 lượt/giờ
   mỗi người với ô tìm kiếm; kết quả vào `SearchCache` cho lần sau.

Chọn bài: giữ thứ tự nguồn, nhưng đẩy xuống bản remix / cover / karaoke / live… (trừ khi dòng có chữ
đó) và video dài hơn 15 phút; với kho bài (không có xếp hạng) ưu tiên tiêu đề ít chữ thừa.

## Giao diện

"Của tôi" → **Dán danh sách bài** (khách và tài khoản): ô dán (đếm số bài ngay khi gõ) → **Tìm bài**
→ danh sách kết quả, mỗi bài kèm "Bạn dán: …" để bỏ chọn bài khớp sai; dòng chưa tìm có **Tìm tiếp
N bài**. **Thêm N bài vào hàng chờ** (bỏ bài đã có trong hàng chờ, giới hạn theo suất còn lại);
đã đăng nhập thì thêm **Lưu thành playlist** (đặt tên, `playlist:create`).

## Kiểm tra

Không test tự động. Lint + typecheck + build; probe Socket.IO trên DB Docker (`localhost:55432`):
dòng đã biết / link YouTube / link Spotify / dòng trùng, 2 lượt tìm YouTube thật rồi lặp lại (lấy
từ cache); Chrome headless bản mobile: dán, tìm, thêm vào hàng chờ.
