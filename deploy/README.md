# Cài Music Room cho văn phòng (self-host)

Bạn cần một máy luôn bật trong văn phòng: mini PC, Mac mini, Raspberry Pi 5 hoặc laptop, có **Docker** (Docker Desktop hoặc Docker Engine kèm Compose v2). Máy này chỉ chạy server; nó không bắt buộc phải là máy nối loa.

## 1. Cài đặt (khoảng 10 phút)

```bash
mkdir music-room && cd music-room
curl -O https://raw.githubusercontent.com/hungnm-developer/music-room-server/develop/deploy/docker-compose.yml
curl -O https://raw.githubusercontent.com/hungnm-developer/music-room-server/develop/deploy/Caddyfile
curl -o .env https://raw.githubusercontent.com/hungnm-developer/music-room-server/develop/deploy/.env.example
```

Sửa file `.env`:

| Biến | Ghi gì |
|---|---|
| `PUBLIC_URL` | Địa chỉ mọi người sẽ dùng, ví dụ `http://192.168.1.20:8080`. Đây là IP trong mạng LAN của máy chạy Docker. Xem IP bằng `ipconfig getifaddr en0` (macOS) hoặc `hostname -I` (Linux) |
| `SETUP_PASSWORD` | Mật khẩu để được tạo phòng. Hãy đổi giá trị mặc định |
| `YOUTUBE_API_KEY` | Không bắt buộc. Có key thì dùng được **tìm kiếm** và **playlist dự phòng**; không có thì chỉ dán link YouTube |

```bash
docker compose up -d
docker compose ps        # các service đều "Up", api và db hiện "healthy"
```

Mở `PUBLIC_URL` trên trình duyệt, chọn **Tạo phòng**, nhập tên, tên phòng, mã PIN quản trị và mật khẩu cài đặt.

## 2. Nối loa

1. Trên máy nối loa Bluetooth, mở `PUBLIC_URL/r/<MÃ PHÒNG>/host`.
2. Nhập **mã PIN quản trị**, rồi bấm **Mở máy phát**.
3. Nếu trang hiện nút **▶ Bắt đầu phát**, bấm một lần. Trình duyệt bắt buộc phải có một lần bấm thì mới cho tự phát nhạc.
4. Để trang ở chế độ toàn màn hình (F11). Mọi người quét mã QR trên màn hình để vào phòng.

Mẹo:
- Tắt chế độ ngủ của máy nối loa.
- Không thu nhỏ tab đang phát.
- Nếu mở trang máy phát ở một máy khác, máy cũ sẽ tự dừng phát.

## 3. Lấy YouTube API key (không bắt buộc)

1. Vào https://console.cloud.google.com, tạo một project mới.
2. Mở **APIs & Services → Library**, bật **YouTube Data API v3**.
3. Mở **Credentials → Create credentials → API key**. Nên giới hạn key chỉ dùng cho *YouTube Data API v3*.
4. Ghi key vào `YOUTUBE_API_KEY` trong `.env`, rồi chạy `docker compose up -d`.

Mỗi key có 10.000 đơn vị mỗi ngày. Một lượt tìm mới tốn khoảng 101 đơn vị, tức khoảng 95 lượt mỗi ngày. Kết quả tìm kiếm được cache 24 giờ, còn dán link chỉ tốn 1 đơn vị.

## 4. HTTPS và tên miền (không bắt buộc)

Nếu muốn truy cập từ ngoài văn phòng, hãy trỏ tên miền về máy chạy Docker. Sau đó thêm vào `.env`:

```
SITE_ADDRESS=music.congty.vn
PUBLIC_URL=https://music.congty.vn
```

Trong `docker-compose.yml`, ở service `caddy`, thay dòng `"${PORT:-8080}:8080"` bằng hai dòng `"80:80"` và `"443:443"` (đã có sẵn ở dạng chú thích), rồi chạy `docker compose up -d`. Caddy sẽ tự lấy chứng chỉ HTTPS (cổng 80/443 phải mở ra internet).

## 5. Vận hành

| Việc | Lệnh |
|---|---|
| Xem log | `docker compose logs -f api` |
| Cập nhật phiên bản | `docker compose pull && docker compose up -d` (migration tự chạy) |
| Sao lưu | `docker compose exec db pg_dump -U musicroom musicroom > backup-$(date +%F).sql` |
| Khôi phục | `cat backup.sql \| docker compose exec -T db psql -U musicroom musicroom` |
| Kiểm tra sức khỏe | `curl $PUBLIC_URL/api/health` (200 = ổn, 503 = database lỗi) |
| Dừng | `docker compose down` (dữ liệu vẫn được giữ trong volume) |

## 6. Tự build image thay vì tải về

Đặt hai repo `music-room-server` và `music-room-client` cạnh nhau, rồi chạy:

```bash
cd music-room-server/deploy
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## 7. Checklist thử tay trước khi phát hành

Các mục này cần thiết bị thật nên không tự động hóa được (ma trận case: TC-126, TC-127, TC-128, PW-03…PW-06).

- [ ] Laptop nối loa Bluetooth: mở trang máy phát, bấm **Bắt đầu phát**, nhạc phát ra loa.
- [ ] Phát liên tục 1 giờ không bị ngắt, kể cả khi màn hình laptop tắt.
- [ ] Gửi lời chúc: loa đọc lời chúc, nhạc nhỏ lại trong lúc đọc rồi to trở lại; điện thoại *không* phát tiếng.
- [ ] Bấm soundboard DJ trên điện thoại: âm thanh chỉ phát ra ở loa.
- [ ] iPhone (Safari) và Android (Chrome): quét QR, thêm bài, thả tim, bỏ phiếu, chat.
- [ ] Tắt Wi-Fi của máy phát 30 giây rồi bật lại: điện thoại hiện banner, sau đó nhạc phát tiếp đúng chỗ.
- [ ] Khởi động lại container `api` trong lúc đang phát: phòng, hàng chờ và chat vẫn còn nguyên.

## Bản quyền

Music Room chỉ nhúng trình phát YouTube chính thức. Người cài đặt chịu trách nhiệm về bản quyền âm nhạc khi phát nhạc nơi công cộng hoặc trong văn phòng.

---

### English summary

`cp .env.example .env`, set `PUBLIC_URL` (LAN address), `SETUP_PASSWORD` and optionally `YOUTUBE_API_KEY`, then run `docker compose up -d`. Open `PUBLIC_URL` to create a room, and open `PUBLIC_URL/r/<CODE>/host` on the computer connected to the speaker. Backups are plain `pg_dump`. Updates are `docker compose pull && docker compose up -d`.
