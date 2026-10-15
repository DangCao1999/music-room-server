# Hồ sơ xét duyệt Google OAuth — Music Room

Mục tiêu: bỏ màn hình "Google hasn't verified this app" và giới hạn 100 người dùng, cho scope
`https://www.googleapis.com/auth/youtube.readonly` (sensitive — **không** cần đánh giá bảo mật CASA).

Project: `southern-camera-407110` ("Music Room") · Domain: `https://musicroom.io.vn`

---

## 1. Kiểm tra trước khi gửi

**Google Auth Platform → Branding**

| Mục | Giá trị |
|---|---|
| App name | `Music Room` (trùng tên hiển thị trên trang chủ) |
| User support email | email hỗ trợ của bạn |
| App logo | Không bắt buộc. Nếu tải lên: PNG vuông 120×120, đúng logo đang dùng trên web |
| Application home page | `https://musicroom.io.vn` |
| Application privacy policy link | `https://musicroom.io.vn/privacy` |
| Application terms of service link | `https://musicroom.io.vn/terms` |
| Authorized domains | `musicroom.io.vn` |
| Developer contact information | email bạn đọc thường xuyên (Google gửi câu hỏi về đây) |

**Search Console:** `musicroom.io.vn` đã xác minh bằng **tài khoản Owner/Editor của project** (đã xong).

**Clients → OAuth client:** Authorized JavaScript origins có `https://musicroom.io.vn`.
Có thể xoá các origin không còn dùng (`http://localhost…` để dev thì giữ cũng được).

**Data Access:** chỉ có các scope thật sự dùng:
- `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (đăng nhập — non-sensitive)
- `https://www.googleapis.com/auth/youtube.readonly` (sensitive)

**Trang chủ** `https://musicroom.io.vn` (người xét duyệt sẽ mở, không đăng nhập):
mô tả app làm gì ✓, có link Chính sách quyền riêng tư ✓, tên "Music Room" ✓.

**Trang Chính sách quyền riêng tư** cùng domain ✓, nêu rõ dữ liệu Google được truy cập / dùng /
lưu / chia sẻ ✓, có câu cam kết **Limited Use** (mục 5 — đã thêm vào `/privacy`).

---

## 2. Scope justification (dán vào ô "How will the scopes be used?")

> **Scope:** `https://www.googleapis.com/auth/youtube.readonly`
>
> Music Room (https://musicroom.io.vn) is a shared music app for offices: colleagues add YouTube
> songs to one queue and a single computer connected to a speaker plays them in turn.
>
> Signed-in users can optionally press "Import from YouTube" ("Nhập từ YouTube") to bring their
> own music into the app. Only when this button is pressed, the app requests the
> `youtube.readonly` scope through Google Identity Services (token model, in the browser). With the
> resulting short-lived access token, our server makes these read-only calls on the user's behalf:
>
> - `playlists.list` with `mine=true` — to show the user a list of their own YouTube playlists;
> - `videos.list` with `myRating=like` — to show their liked videos;
> - `playlistItems.list` and `videos.list` — to read the videos of the playlist the user chose.
>
> The user picks a source and the app copies those videos (video IDs, titles, durations,
> thumbnails) into a personal playlist inside Music Room, so they can add their favourite songs to
> the office queue in one tap. Nothing is ever created, changed or deleted on the user's YouTube
> account.
>
> The access token is used only for that import request: it is never stored on our servers or in
> the browser's storage, and the app revokes it (`google.accounts.oauth2.revoke`) as soon as the
> import dialog is closed. The user can also revoke access at any time at
> https://myaccount.google.com/permissions.
>
> We need this scope because a user's own playlists and liked videos are private data that cannot
> be read with an API key. `youtube.readonly` is the narrowest scope that allows reading them; we do
> not request `youtube` or `youtube.force-ssl` because the app never writes to YouTube.

**Nếu form hỏi "Why can't you use a less sensitive scope?"**

> Listing the authenticated user's own playlists (`playlists.list?mine=true`) and liked videos
> (`videos.list?myRating=like`) requires OAuth with a YouTube scope; an API key only reaches public
> data. Among YouTube scopes, `youtube.readonly` is the only read-only one, so it is the minimum
> needed. Users who do not want this can still add public playlists by pasting their link, without
> granting any permission.

---

## 3. Kịch bản video demo (đăng YouTube chế độ **Unlisted**, 2–4 phút, tiếng Anh hoặc có phụ đề)

Quay màn hình **trình duyệt có thanh địa chỉ**, ngôn ngữ giao diện Google để **English** nếu được
(dễ duyệt hơn). Nói hoặc chèn chữ ngắn gọn cho từng bước.

1. **Giới thiệu (10 giây):** mở `https://musicroom.io.vn`, nói: "Music Room is a shared office music
   app. This video shows how it uses the youtube.readonly scope."
2. **Đăng nhập Google:** bấm "Đăng nhập với Google", chọn tài khoản. Cho thấy đây là đăng nhập
   thường (chỉ email, tên).
3. **Vào phòng:** tạo hoặc mở một phòng → tab **Thêm bài** → **Của tôi**.
4. **Bấm "Nhập từ YouTube"** → popup Google hiện ra.
   - **Dừng lại 3–5 giây trên màn hình đồng ý**, phóng to (zoom) nếu cần để thấy rõ:
     - tên app **Music Room**;
     - quyền "View your YouTube account";
     - **thanh địa chỉ của popup có `client_id=77235712936-00ljnt3snck1d31ial12c47klcg1sss9.apps.googleusercontent.com`**
       (Google bắt buộc thấy Client ID trong video).
   - Bấm **Allow / Cho phép**.
5. **Dữ liệu được dùng thế nào:** hộp "Nhập từ YouTube" liệt kê **Video đã thích** và các playlist
   YouTube của tài khoản. Bật "Chỉ lấy bài nhạc", bấm **Nhập** ở "Video đã thích".
6. **Kết quả:** thông báo "Đã nhập N bài…", playlist "Đã thích trên YouTube" xuất hiện trong
   **Của tôi**; mở nó, bấm **Thêm vào hàng chờ** → bài lên hàng chờ của phòng và phát.
7. **Thu hồi quyền:** đóng hộp nhập (nói: "the token is revoked when the dialog closes, it is never
   stored"). Mở `https://myaccount.google.com/permissions` cho thấy có thể gỡ quyền của Music Room.
8. **Trang Chính sách:** mở `https://musicroom.io.vn/privacy`, cuộn tới phần YouTube API Services /
   Limited Use.

Mẹo: dùng tài khoản test có vài playlist và vài video đã thích; tắt thông báo hệ thống khi quay.

---

## 4. Gửi xét duyệt

1. Google Auth Platform → **Verification Center** → **Prepare for verification** (hoặc *Submit for
   verification*).
2. Điền các mục theo bảng mục 1, dán **scope justification** (mục 2) vào đúng scope, dán **link
   video Unlisted** (mục 3).
3. Gửi. Theo dõi email từ Google Trust & Safety (thường từ
   `api-oauth-dev-verification-reply@google.com`) — **trả lời trong cùng luồng email**, đúng câu hỏi.
4. Thời gian: thường vài ngày đến vài tuần. Trong lúc chờ app vẫn chạy (có cảnh báo, ≤ 100 người).

**Lý do bị trả lại thường gặp và cách tránh**

- Video không thấy Client ID / màn hình đồng ý → quay lại, phóng to bước 4.
- Trang chủ không mô tả app hoặc cần đăng nhập mới xem được → trang chủ hiện đã mô tả app.
- Privacy policy thiếu cách xử lý dữ liệu Google / thiếu cam kết Limited Use → mục 5.
- Domain trang chủ / privacy chưa xác minh hoặc khác domain → đã dùng `musicroom.io.vn` cho cả hai.
- Xin scope rộng hơn mức dùng → chỉ xin `youtube.readonly`.

---

## 5. Cam kết Limited Use trên trang Chính sách quyền riêng tư (đã thêm)

Google yêu cầu câu cam kết **Limited Use** cho dữ liệu nhận từ Google API, và từ 2024 kiểm tra kỹ
việc **không dùng dữ liệu người dùng Google để huấn luyện AI**. Music Room gửi tiêu đề video (là
thông tin công khai của YouTube, không kèm thông tin người dùng) cho nhà cung cấp AI để tách nghệ sĩ /
tên bài — cần nói rõ điều này. Đoạn cần thêm (tiếng Việt + tiếng Anh):

> Việc Music Room sử dụng và chuyển giao thông tin nhận được từ Google API tuân theo Chính sách dữ
> liệu người dùng của Google API Services, bao gồm các yêu cầu Sử dụng giới hạn (Limited Use).
> Dữ liệu từ tài khoản Google / YouTube của bạn không được dùng để quảng cáo, không bán, và không dùng
> để huấn luyện mô hình AI. Khi chuẩn hoá tên bài, chỉ tiêu đề video công khai (không kèm thông tin
> nào về bạn) được gửi tới nhà cung cấp AI.

> Music Room's use and transfer to any other app of information received from Google APIs will
> adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements. Google user data is never used for advertising, never
> sold, and never used to develop, improve or train AI or machine-learning models. To normalise song
> names, only public YouTube video titles — never linked to you — are sent to AI providers.

Đi kèm: MC giới thiệu bài và câu nhận xét Tổng kết **không gửi tên người** cho nhà cung cấp AI nữa —
AI chỉ thấy ký hiệu `{P}` / `P1…P5`, máy chủ tự điền tên lại sau khi AI trả lời.
