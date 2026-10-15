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
| `YOUTUBE_API_KEY` | Không bắt buộc. Có key thì dùng được **tìm kiếm** và **playlist dự phòng**; không có thì chỉ dán link YouTube |

```bash
docker compose up -d
docker compose ps        # các service đều "Up", api và db hiện "healthy"
```

Mở `PUBLIC_URL` trên trình duyệt, chọn **Tạo phòng**, nhập tên của bạn, tên phòng và **mã PIN quản trị** (4–8 số). Người tạo phòng là quản trị viên.

Mã PIN dùng khi cần lấy lại quyền quản trị:
- Ở tab **Mọi người**, bấm **Nhận quyền quản trị** rồi nhập PIN.
- Quản trị viên mất phiên (đổi trình duyệt, xoá dữ liệu…) vào lại bằng **đúng tên cũ** và PIN.
- Thành viên thường mất phiên chỉ cần vào lại bằng đúng tên cũ (khi tên đó đang offline).
- Nhập sai PIN 5 lần trong 15 phút sẽ bị khoá 15 phút. Quản trị viên đổi PIN trong **Cài đặt phòng**.

## 2. Nối loa

1. Trên máy nối loa Bluetooth, mở `PUBLIC_URL/r/<MÃ PHÒNG>/host`. Không cần mật khẩu hay PIN: ai có mã phòng đều mở được trang máy phát.
2. Nếu trang hiện nút **▶ Bắt đầu phát**, bấm một lần. Trình duyệt bắt buộc phải có một lần bấm thì mới cho tự phát nhạc.
3. Để trang ở chế độ toàn màn hình (F11). Mọi người quét mã QR trên màn hình để vào phòng.

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

## 8. Deploy miễn phí: Vercel (web) + Render (API) + Neon (database)

Cả ba nền tảng đều có gói miễn phí không cần thẻ. Neon thay cho Render Postgres vì database miễn phí của Render bị xóa sau 30 ngày, còn Neon thì không.

| Phần | Nền tảng | Giới hạn của gói free (10/2026) |
|---|---|---|
| Web (Next.js) | Vercel | Đủ dùng |
| API (NestJS, WebSocket) | Render | 750 giờ/tháng; **ngủ sau 15 phút** không có request, mất khoảng 1 phút để thức dậy |
| Database (PostgreSQL) | Neon | 0,5 GB, 100 CU-giờ/tháng; tự ngủ sau 5 phút không dùng, lần truy vấn đầu sau khi ngủ chậm vài giây |

Ước tính: một văn phòng nghe khoảng 8 giờ/ngày tốn chừng 45 CU-giờ Neon mỗi tháng, nằm trong hạn mức free. Dung lượng dữ liệu nhỏ, vì chat và nhật ký chỉ giữ 200 dòng mỗi phòng.

### 8.1 Neon: tạo database (5 phút)

1. Đăng ký tại https://neon.com, chọn **Create project**, chọn region **AWS Asia Pacific (Singapore)** để gần Việt Nam.
2. Ở **Connect**, chọn *Branch: main*, *Database: neondb*, rồi copy **2 chuỗi kết nối**:
   - Bật **Connection pooling**: chuỗi có `-pooler` trong tên host. Đây là `DATABASE_URL`.
   - Tắt **Connection pooling**: chuỗi không có `-pooler`. Đây là `DIRECT_URL`, chỉ dùng để chạy migration.
3. Giữ nguyên phần đuôi `?sslmode=require&channel_binding=require` mà Neon thêm sẵn.

Không cần tự tạo bảng: server tự chạy migration mỗi lần khởi động.

### 8.2 Render: chạy API

**Cách A, dùng Blueprint:** chọn *Dashboard → New → Blueprint*, trỏ tới repo `music-room-server`, nhánh `develop`. File [`render.yaml`](../render.yaml) tự cấu hình lệnh build/start, health check, `NODE_VERSION`, `TRUST_PROXY` và tự sinh `JWT_SECRET`. Render sẽ hỏi các biến ở bảng dưới.

**Cách B, service đã tạo tay trên dashboard:** `render.yaml` không được dùng; vào *Environment* và đặt **toàn bộ** biến sau:

| Biến | Giá trị | Bắt buộc |
|---|---|---|
| `DATABASE_URL` | Chuỗi Neon **có** `-pooler` | ✅ |
| `DIRECT_URL` | Chuỗi Neon **không có** `-pooler` | ✅ với Neon |
| `PUBLIC_URL` | `https://<app>.vercel.app` | ✅ |
| `CORS_ORIGINS` | `https://<app>.vercel.app` (nhiều domain thì ngăn bằng dấu phẩy) | ✅ |
| `JWT_SECRET` | `openssl rand -base64 48` | ✅ (Render free không có ổ đĩa lưu lâu dài) |
| `TRUST_PROXY` | `true` | ✅ |
| `NODE_VERSION` | `22` | ✅ |
| `DATA_DIR` | `/tmp/music-room` | nên đặt |
| `YOUTUBE_API_KEY` | key YouTube Data API | tùy chọn |

Cài đặt khác:
- *Build:* `npm install --include=dev && npm run build`
- *Start:* `npm run start:prod` (tự chạy migration bằng `DIRECT_URL`)
- *Health Check Path:* `/api/health`
- *Region:* **Singapore**, cùng khu vực với Neon.

Kiểm tra: mở `https://<api>.onrender.com/api/health`, phải thấy `"db":"up"`.

Nếu đang dùng Render Postgres, sau khi Neon chạy ổn bạn có thể xóa database cũ trên Render. Dữ liệu v1 chỉ nằm trong RAM nên không có gì cần chuyển.

### 8.3 Vercel: chạy web

*Project → Settings → Environment Variables*, mục Production:

| Biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_SERVER_URL` | `https://<api>.onrender.com` (không có `/` ở cuối) |
| `PUBLIC_APP_URL` | `https://<app>.vercel.app`: domain chính thức dùng cho link và mã QR trong ảnh xem trước. Nên đặt, vì nếu thiếu thì app phải đoán domain từ header của request, và ảnh xem trước sẽ không được CDN cache |

Biến này được nhúng vào lúc build, nên phải **Redeploy** sau khi đặt. Ảnh xem trước khi chia sẻ link phòng (tên bài, ảnh bìa, mã QR) cũng lấy dữ liệu qua địa chỉ này.

### 8.4 Lưu ý

- **Deploy API trước, web sau.** Lệch phiên bản thì người dùng thấy banner "Có phiên bản mới. Hãy tải lại trang."
- **Link Preview của Vercel** bị API chặn, trừ khi bạn thêm domain đó vào `CORS_ORIGINS`.
- **Render ngủ sau 15 phút** không có request. Khi có người mở trang, kết nối mất khoảng 1 phút; trong lúc ngủ, server không tự chuyển bài. Bật workflow giữ server thức ở §8.7, hoặc xem các lựa chọn khác ở §8.5.
- **Render và Neon phải cùng ở Singapore.** Nếu một bên ở Mỹ hoặc châu Âu, mỗi truy vấn database tốn thêm vài trăm ms và mọi thao tác đều chậm. Cách chuyển ở §8.6.

### 8.5 Các lựa chọn khác

| Lựa chọn | Ưu điểm | Nhược điểm |
|---|---|---|
| **Self-host trên máy văn phòng** (§1–§6) | Hoàn toàn miễn phí, chạy liên tục, độ trễ thấp trong LAN, dùng luôn Postgres trong Docker | Cần một máy luôn bật. Muốn truy cập từ ngoài văn phòng thì dùng Cloudflare Tunnel (miễn phí) |
| **Northflank** (free sandbox) | 2 service không bao giờ ngủ, chạy được WebSocket | Cần thẻ để xác minh |
| **Koyeb** (free) | 1 web service 512 MB | Chỉ có máy chủ ở Frankfurt/Washington (xa Việt Nam); từ 2/2026 cần thẻ và tạm giữ $29; ngủ sau 1 giờ không dùng |
| **Render Starter** (khoảng $7/tháng) | Không ngủ, giữ nguyên toàn bộ cấu hình §8.2 | Có phí |
| Supabase (database) | Free 500 MB | Project tự tạm dừng sau 1 tuần không hoạt động |

Không dùng Vercel Functions, Netlify hay Cloudflare Workers cho API: server cần giữ kết nối WebSocket và hẹn giờ chạy liên tục.

### 8.6 Chuyển API và database sang Singapore

Render và Neon đều **không đổi được khu vực** của service hoặc database đã tạo, nên phải tạo cái mới rồi chuyển sang.

1. **Neon:** tạo project mới, region **AWS Asia Pacific (Singapore)**, rồi lấy 2 chuỗi kết nối như §8.1.
   - Dữ liệu phòng cũ không quan trọng thì bỏ qua bước chuyển dữ liệu: server tự tạo bảng khi khởi động.
   - Muốn giữ dữ liệu, chạy trên máy của bạn (dán chuỗi **không có** `-pooler`, không gửi chuỗi này cho ai):
     ```bash
     export OLD_URL='postgresql://…'   # Neon cũ, chuỗi direct
     export NEW_URL='postgresql://…'   # Neon mới, chuỗi direct
     docker run --rm -e OLD_URL -e NEW_URL postgres:17-alpine sh -c \
       'pg_dump "$OLD_URL" --no-owner --no-acl -Fc | pg_restore --no-owner --no-acl -d "$NEW_URL"'
     ```
2. **Render:** *New → Blueprint*, chọn repo `music-room-server`, nhánh `develop`. `render.yaml` tạo service `music-room-api` ở **Singapore**. Nhập các biến ở §8.2, dùng chuỗi Neon mới, và chép `YOUTUBE_API_KEY` từ service cũ. `JWT_SECRET` mới được tự sinh, nên mọi người phải nhập lại tên khi vào phòng.
3. Mở `https://<api-mới>.onrender.com/api/health`, phải thấy `"db":"up"`.
4. **Vercel:** đổi `NEXT_PUBLIC_SERVER_URL` sang địa chỉ API mới rồi **Redeploy**.
5. Đổi biến `KEEP_AWAKE_URL` ở §8.7 sang địa chỉ mới.
6. Dùng ổn vài ngày thì xóa service Render cũ và project Neon cũ.

### 8.7 Giữ API luôn thức (miễn phí)

Workflow [`.github/workflows/keep-awake.yml`](../.github/workflows/keep-awake.yml) gọi `/api/health` mỗi 10 phút nên Render không ngủ. Một service chạy cả tháng mất khoảng 744 giờ, nằm trong 750 giờ miễn phí mỗi tháng. Nếu có thêm service free thứ hai chạy liên tục thì sẽ vượt hạn mức.

1. *GitHub → repo → Settings → Secrets and variables → Actions → Variables*: tạo `KEEP_AWAKE_URL` = `https://<api>.onrender.com` (không có `/` ở cuối).
2. Workflow theo lịch chỉ chạy từ **nhánh mặc định** của repo, nên file này phải có trên nhánh đó.
3. GitHub tự tắt workflow theo lịch nếu repo công khai không có hoạt động nào trong 60 ngày. Khi đó vào tab *Actions* bật lại.

Kiểm tra: tab *Actions → keep-awake → Run workflow* chạy tay một lần, bước *Ping* phải xanh.

## Bản quyền

Music Room chỉ nhúng trình phát YouTube chính thức. Người cài đặt chịu trách nhiệm về bản quyền âm nhạc khi phát nhạc nơi công cộng hoặc trong văn phòng.

---

### English summary

`cp .env.example .env`, set `PUBLIC_URL` (LAN address) and optionally `YOUTUBE_API_KEY`, then run `docker compose up -d`. Open `PUBLIC_URL` to create a room, and open `PUBLIC_URL/r/<CODE>/host` on the computer connected to the speaker. Backups are plain `pg_dump`. Updates are `docker compose pull && docker compose up -d`.
