# Đăng nhập Google (L1) và phòng theo tài khoản (L6)

Ngày: 2026-10-15 · Contracts: `2026-10-15.8` · Giai đoạn 2, dự án con 1

Quyết định: mọi tài khoản Google; đăng nhập **tuỳ chọn** (khách vẫn vào bằng tên như cũ,
máy phát không cần đăng nhập).

## Đăng nhập

- Client: Google Identity Services ("Đăng nhập với Google") trả ID token (JWT RS256).
- `auth:google { credential }` (không cần là thành viên phòng): server kiểm tra chữ ký bằng
  JWKS của Google (`node:crypto`, cache theo `Cache-Control`), `iss`, `aud = GOOGLE_CLIENT_ID`,
  `exp`, `email_verified`. Upsert `User` theo `googleSub`, trả **token tài khoản** HS256
  `{ sub, typ: 'u', tv }` hạn 90 ngày + `UserView { id, name, email, picture }`.
- Socket gửi `auth.userToken` khi kết nối; server gắn `userId` vào socket. `auth:me` → user hoặc null.
- `GOOGLE_CLIENT_ID` chỉ đặt ở server; `/api/health` trả `googleClientId` (công khai).
- Đăng xuất: client xoá token tài khoản và kết nối lại; phiên thành viên khách vẫn giữ.

## L1: thành viên gắn với tài khoản

- `Member.userId` (null = khách). `room:join.displayName` thành tuỳ chọn khi đã đăng nhập.
- Đăng nhập + vào phòng:
  - đã có thành viên đang hoạt động gắn với tài khoản trong phòng → vào lại đúng thành viên đó,
    đủ quyền (tài khoản là bằng chứng), mọi thiết bị;
  - chưa có → thành viên mới mang tên gửi lên hoặc tên Google; trùng thì thêm " 2", " 3"…
- Khách gõ tên của thành viên **đã gắn tài khoản** → `NAME_TAKEN` (không mạo danh được).
- Gắn tự động: socket có cả phiên thành viên khách và token tài khoản (đăng nhập khi đang trong
  phòng, hoặc mở lại phòng sau khi đăng nhập) → thành viên được gắn nếu tài khoản chưa có
  thành viên khác trong phòng. Khi gắn: Yêu thích của thành viên chuyển sang tài khoản; nếu
  phòng chưa có chủ và thành viên này là người tạo phòng → thành chủ phòng.
- Yêu thích: thành viên có tài khoản dùng `UserFavorite(userId, trackId)`; khách vẫn dùng
  `Favorite`. `me:favorites-import { videoIds ≤ 300 }` gộp danh sách lưu trên máy vào tài khoản.

## L6: phòng theo tài khoản

- `Room.ownerId`: người tạo phòng khi đã đăng nhập. Chủ phòng vào phòng luôn là quản trị
  viên (kể cả sau khi "Rời phòng"), không cần PIN. PIN vẫn dùng cho khách và phòng cũ.
- `me:rooms {}` → các phòng mình sở hữu hoặc từng tham gia (tối đa 20, mới nhất trước): mã,
  tên, là chủ, số người online, bài đang phát.
- Trang chủ khi đã đăng nhập: tài khoản, "Phòng của tôi", đăng xuất. Trang phòng: đã đăng nhập
  thì tự vào phòng không cần nhập tên; hộp vào phòng có nút đăng nhập Google.

## Kiểm tra

Không test tự động. Lint + typecheck + build. Kiểm tra chữ ký bằng khoá RSA tự tạo (probe).
Google thật chỉ chạy trên `http://localhost:3000` / HTTPS khi đã có OAuth Client ID; luồng
tài khoản được thử bằng token tài khoản ký từ server dev.
