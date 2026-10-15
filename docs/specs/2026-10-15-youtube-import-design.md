# Nhập từ YouTube (L3)

Ngày: 2026-10-15 · Contracts: `2026-10-15.10` · Giai đoạn 2, dự án con 3 · Cần đăng nhập (L1)

## Quyền và quy định của Google

- Scope `https://www.googleapis.com/auth/youtube.readonly` (sensitive). App ở chế độ Testing: chỉ
  email trong *Test users* (≤ 100) dùng được, có cảnh báo "chưa xác minh". Muốn mở cho mọi người
  phải gửi Google xét duyệt.
- Project chứa OAuth Client ID phải bật YouTube Data API v3; quota tính vào project đó
  (~1 đơn vị / 50 video).
- Đăng nhập thường (L1) không xin scope này; chỉ xin khi bấm "Nhập từ YouTube".

## Luồng

1. Client: Google Identity Services token client (`initTokenClient`, scope trên) → access token
   (1 giờ) chỉ nằm trong bộ nhớ trang; đóng hộp nhập thì thu hồi (`oauth2.revoke`).
2. `youtube:library { accessToken }` → `{ playlists: [{ id, title, itemCount, thumbnailUrl }] }`
   (`playlists?mine=true`, tối đa 200).
3. `youtube:import { accessToken, source: 'liked' | <playlistId>, musicOnly }` →
   `{ playlistId, name, imported, skipped }`:
   - `liked`: `videos?myRating=like` (mới nhất trước); playlist: `playlistItems` rồi `videos`;
   - tối đa 200 video; bỏ video không nhúng được / livestream; `musicOnly` giữ danh mục Âm nhạc (10);
   - lưu bài vào `Track`, rồi tạo hoặc **cập nhật** playlist cá nhân theo nguồn
     (`Playlist.source = 'yt:liked' | 'yt:<id>'`, duy nhất theo chủ) — nhập lại không tạo bản trùng.
     Tên: tên playlist YouTube, hoặc "Đã thích trên YouTube".
- Server không lưu access token. 401/403 từ Google → `YOUTUBE_ACCESS_DENIED { reason }`;
  hết quota → `QUOTA_EXCEEDED`.

## Giao diện

"Của tôi" → **Nhập từ YouTube**: popup cấp quyền → hộp liệt kê "Video đã thích" và các playlist
YouTube, mỗi dòng nút **Nhập** (hoặc **Cập nhật** nếu đã nhập trước đó); công tắc "Chỉ lấy bài
nhạc" (bật sẵn). Xong thì danh sách playlist tự làm mới.

## Kiểm tra

Không test tự động. Lint + typecheck + build; probe server với `fetch` giả lập Google trên DB
Docker. Luồng thật cần bạn cấu hình Google Cloud (bật API, thêm scope, thêm test users).
