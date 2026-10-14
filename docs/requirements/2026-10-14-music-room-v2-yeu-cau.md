# Yêu cầu: Music Room v2 (Ổn định hóa & Self-host)

> Tài liệu này điền phần **"Yêu cầu"** và thực hiện bước 1–2 (thu thập bối cảnh, lập mô hình tính năng) theo quy trình người dùng giao ngày 2026-10-14.
> Ma trận case (bước 3–4): [`docs/qa/2026-10-14-music-room-v2-test-matrix.md`](../qa/2026-10-14-music-room-v2-test-matrix.md)
> Kế hoạch triển khai: [`docs/plans/2026-10-14-music-room-v2-plan.md`](../plans/2026-10-14-music-room-v2-plan.md)
> Spec thiết kế (đã duyệt): [`docs/specs/2026-10-14-music-room-mvp-design.md`](../specs/2026-10-14-music-room-mvp-design.md)

---

## Yêu cầu

Nâng cấp ứng dụng Music Room có sẵn trên nhánh `develop` của hai repo `music-room-server` (NestJS 11) và `music-room-client` (Next.js 16) thành **Music Room v2**, theo đúng spec đã duyệt, qua 8 giai đoạn:

0. **Dọn repo**: gỡ `node_modules` và `dist` khỏi git; đưa cấu hình ra biến môi trường; sửa test hỏng; có lệnh lint, test và build chạy xanh.
1. **Bảo mật danh tính**: server cấp token, xác định người gửi từ phiên; payload được kiểm tra bằng schema; lệnh có ack; CORS và giới hạn tần suất.
2. **Lưu trữ bền**: PostgreSQL + Prisma; phòng, thành viên, hàng chờ, chat và nhật ký sống sót qua restart; tải lại trang vẫn giữ danh tính; nhận quyền admin bằng PIN.
3. **Hàng chờ công bằng**: xếp theo vòng; ❤️ quyết định thứ tự trong vòng; nút "Phát tiếp theo" thay cho kéo thả.
4. **Máy phát**: route `/r/[code]/host`; lease một thiết bị; báo cáo tiến độ; chuyển bài trong transaction và không bị nhảy hai bài; phát tiếp khi kết nối lại; TTS và soundboard chỉ phát trên máy phát.
5. **Tìm kiếm YouTube**: Data API khi có key; fallback oEmbed; cache; giới hạn lượt; playlist dự phòng.
6. **Self-host**: Dockerfile, Docker Compose (Caddy, web, api, db), tài liệu cài đặt.
7. **Giao diện**: điện thoại 3 tab (**Phòng / Thêm bài / Mọi người**), toàn bộ tiếng Việt qua `vi.ts`, chuyển hướng link cũ, E2E.

Khi hoàn thành, mọi tình huống bình thường, thay thế, lỗi, biên và bất thường đều đã được liệt kê, xử lý và kiểm chứng. Phần nào chưa phủ được phải ghi rõ kèm lý do.

**Ràng buộc từ người dùng:** không commit, push, deploy, xóa dữ liệu thật hay gửi dữ liệu ra ngoài khi chưa được cho phép. Được bỏ qua điểm dừng duyệt ma trận ("làm luôn").

---

## 1. Bối cảnh (đang dựa vào điều gì)

| Nguồn | Nội dung dùng lại |
|---|---|
| Buổi brainstorm 2026-10-14 | Mục đích (văn phòng nghe nhạc chung, mã nguồn mở), 8 quyết định D1–D8, mockup màn hình máy phát và màn hình 3 tab |
| Spec `docs/specs/2026-10-14-music-room-mvp-design.md` | Kiến trúc, dữ liệu, giao thức, thuật toán, bảo mật, lộ trình |
| Code `origin/develop` (server `f0ecb89c`, client `ea447dd`) | `RoomsService` (622 dòng), `RoomsGateway` (399 dòng), `RoomContext.tsx`, 20 component; tên sự kiện socket; quyền `canPlay/canControl/canDj`; 6 kiểu giọng TTS; 7 âm thanh DJ; giới hạn 4 bài; DJ chờ 1,5 giây |
| Quy ước code | Server: Prettier (`singleQuote`, `trailingComma: all`), ESLint `recommendedTypeChecked`, Jest + ts-jest với `rootDir: src` và file `*.spec.ts`, TypeScript `module: nodenext`, `strictNullChecks`. Client: ESLint `next/core-web-vitals`, Tailwind 4, import alias `@/` |
| Quy ước commit | Lịch sử dùng Conventional Commits viết thường (`feat:`, `fix:`, `change:`) |
| Kiểm tra môi trường | Node 24.19 (nvm), npm 11.17 (mặc định chặn install script), Docker Desktop 28.1 đang chạy, Xcode CLT đã cũ (tránh thư viện phải biên dịch native, nên chọn `@node-rs/argon2` vì có sẵn bản build) |
| Hiện trạng test | Server: 2/3 bộ test lỗi vì `uuid@13` chỉ hỗ trợ ESM. Client: `tsc` qua, lint báo 18 lỗi và 27 cảnh báo có từ trước |

### 1.1 Tài liệu bên ngoài, đúng phiên bản đang dùng

| Thành phần | Phiên bản | Nguồn |
|---|---|---|
| NestJS (websockets, Socket.IO adapter) | 11.x | https://docs.nestjs.com/websockets/gateways (giá trị return của handler được gửi về làm ack) |
| Socket.IO | 4.8 | https://socket.io/docs/v4/emitting-events/#acknowledgements, https://socket.io/docs/v4/middlewares/ (`auth` khi bắt tay) |
| Prisma ORM | 7.10 | https://www.prisma.io/docs (generator `prisma-client`, `moduleFormat = "cjs"`, `prisma.config.ts`, `@prisma/adapter-pg`) |
| YouTube Data API v3 | v3 | https://developers.google.com/youtube/v3/docs/videos/list, https://developers.google.com/youtube/v3/docs/search/list, https://developers.google.com/youtube/v3/determine_quota_cost |
| YouTube IFrame Player API | hiện hành | https://developers.google.com/youtube/iframe_api_reference (mã lỗi 2, 5, 100, 101, 150) |
| YouTube oEmbed | hiện hành | `https://www.youtube.com/oembed?url=…&format=json` (401/403 = không cho nhúng, 404 = không tồn tại hoặc riêng tư) |
| Chính sách YouTube API | hiện hành | https://developers.google.com/youtube/terms/developer-policies |
| jose (JWT) | 6.x | https://github.com/panva/jose |
| Web Speech API | hiện hành | https://developer.mozilla.org/docs/Web/API/SpeechSynthesis |

### 1.2 Người dùng và vai trò

| Vai trò | Mô tả | Xác định bằng |
|---|---|---|
| **Khách** | Chưa vào phòng (chưa có token) | Không có token |
| **Thành viên** | Đã vào phòng bằng tên hiển thị | Token hợp lệ, `role = USER` |
| **Người điều khiển** | Thành viên được cấp `canControl` | Cờ trên `Member` |
| **DJ** | Thành viên được cấp `canDj` | Cờ trên `Member` |
| **Quản trị (admin)** | Người tạo phòng, hoặc người nhập đúng PIN, hoặc được admin khác cấp | `role = ADMIN` |
| **Máy phát** | Thiết bị đang giữ lease phát: trang `/host` (`isDevice = true`) hoặc thành viên có `canPlay` | `PlaybackState.playerMemberId` |
| **Người cài đặt** | Người chạy Docker, nắm `SETUP_PASSWORD` và `YOUTUBE_API_KEY` | Không có trong giao diện |

### 1.3 Nền tảng, dữ liệu, hệ thống ngoài, ràng buộc

- **Nền tảng:** trình duyệt hiện đại trên điện thoại (Safari iOS 17+, Chrome Android) và máy tính (Chrome, Edge, Firefox, Safari). Máy phát là trình duyệt trên laptop hoặc mini PC nối loa Bluetooth. Server chạy Docker (amd64/arm64).
- **Dữ liệu vào:** tên phòng, tên hiển thị, PIN, mật khẩu cài đặt, link hoặc từ khóa YouTube, lời chúc, tin chat, emoji, loại âm thanh DJ, cấu hình phòng.
- **Dữ liệu ra:** snapshot phòng, sự kiện realtime, QR code, âm thanh trên máy phát.
- **Hệ thống ngoài:** YouTube Data API v3, YouTube oEmbed, YouTube IFrame Player, ảnh thumbnail `i.ytimg.com`, PostgreSQL.
- **Quyền riêng tư:** chỉ lưu tên hiển thị tự chọn, không email hay số điện thoại. Log không ghi token, PIN hay mật khẩu. Không gửi dữ liệu người dùng ra ngoài, ngoại trừ từ khóa tìm kiếm gửi tới YouTube.
- **Bảo mật:** xem §10 của spec. Tóm tắt: không tin id do client gửi, kiểm tra schema, băm PIN, giới hạn tần suất.
- **Hiệu năng:** bản cập nhật tới các máy khác trong cùng mạng LAN dưới 300 ms; một phòng chịu được 50 thành viên online; snapshot dưới 64 KB.
- **Pháp lý:** tuân thủ chính sách YouTube API (trình phát luôn hiện rõ, không tách âm thanh). Người cài đặt chịu trách nhiệm về bản quyền nơi phát nhạc.
- **Ngôn ngữ giao diện:** tiếng Việt. Chuỗi hiển thị nằm trong `src/i18n/vi.ts`.
- **Môi trường thử:** máy dev (macOS, Docker Desktop); Postgres chạy bằng Testcontainers; trình duyệt Playwright (Chromium); Browser pane của Claude Code để kiểm tra giao diện bằng mắt; YouTube thật chỉ dùng khi thử tay.

---

## 2. Mô hình tính năng

### 2.1 Quy tắc nghiệp vụ

Cột **Nguồn**: `Spec §x` (spec đã duyệt), `Code cũ` (hành vi trên `develop` được giữ lại), `Nền tảng` (tài liệu bên ngoài), hoặc **`Đề xuất – chờ duyệt`** (do mình chốt để lấp chỗ trống, người dùng có thể đổi).

#### A. Phòng và danh tính

| ID | Quy tắc | Nguồn |
|---|---|---|
| R-01 | Nếu instance có đặt `SETUP_PASSWORD` thì phải nhập đúng mật khẩu mới tạo được phòng; so sánh mật khẩu bằng hàm thời gian hằng. Nếu không đặt thì ai cũng tạo được phòng | Spec §10 |
| R-02 | Mã phòng gồm 6 ký tự lấy từ bảng `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` và là duy nhất trong instance. Khi người dùng nhập mã, hệ thống bỏ khoảng trắng và chuyển sang chữ hoa trước khi tìm | Spec §6; xử lý khi nhập: Đề xuất – chờ duyệt |
| R-03 | Tên phòng dài 1–50 ký tự sau khi trim | Đề xuất – chờ duyệt |
| R-04 | PIN admin gồm 4–8 chữ số | Spec §10 |
| R-05 | Tên hiển thị dài 1–30 ký tự sau khi trim và chuẩn hóa NFC, ký tự điều khiển bị loại bỏ. Không được trùng (so không phân biệt hoa thường) với **thành viên đang hoạt động** trong cùng phòng | Spec §6, §10; Code cũ `NAME_TAKEN` |
| R-06 | Vào phòng thành công thì nhận token hạn 30 ngày. Kết nối bằng token hợp lệ thì giữ nguyên danh tính, quyền, ❤️ và phiếu | Spec §7.1 |
| R-07 | Ngắt kết nối không xóa thành viên. Thành viên được coi là online khi có ít nhất một socket đang kết nối | Spec §7.1 |
| R-08 | Nhập đúng PIN qua `admin:claim` thì được `role = ADMIN`. Sai 5 lần trong 15 phút (tính theo IP và phòng) thì bị khóa 15 phút | Spec §10 |
| R-09 | Danh tính người gửi lệnh chỉ lấy từ token. Mọi id trong payload là id của đối tượng bị tác động | Spec §10 |
| R-10 | Admin mời một thành viên ra khỏi phòng: `tokenVersion` tăng, mọi socket của người đó nhận `session:revoked` rồi bị ngắt, ❤️ và phiếu của người đó bị gỡ. Người đó có thể vào lại như một thành viên mới | Spec §7.2; vào lại: Đề xuất – chờ duyệt |
| R-11 | **Rời phòng** (bấm nút "Rời phòng"): token bị thu hồi, tên được giải phóng, ❤️ và phiếu bị gỡ, **các bài đang chờ vẫn giữ nguyên** | Code cũ (gỡ ❤️ và phiếu); giữ bài: Đề xuất – chờ duyệt |
| R-12 | Phòng không bao giờ tự bị xóa, kể cả khi trống hay lâu không hoạt động | Spec §1.2 |
| R-13 | Chỉ admin được đổi quyền (`canPlay`, `canControl`, `canDj`, `role`), mời ra khỏi phòng và đổi cấu hình phòng. Phòng được phép có nhiều admin. Thiết bị phát không thể được cấp quyền admin | Spec §7.2, Q2; thiết bị: Đề xuất – chờ duyệt |
| R-14 | Ở mỗi thời điểm chỉ một thành viên có `canPlay = true`. Cấp `canPlay` cho người mới thì người cũ tự mất quyền | Code cũ `setPlayerPermission` |

#### B. Hàng chờ

| ID | Quy tắc | Nguồn |
|---|---|---|
| R-15 | Thêm bài bằng link YouTube ở các dạng được hỗ trợ (spec §9) hoặc bằng `trackId` lấy từ kết quả tìm kiếm. Input khác bị từ chối với lỗi `LINK_UNSUPPORTED` | Spec §9 |
| R-16 | Mỗi thành viên có tối đa `maxQueuedPerMember` bài ở trạng thái `QUEUED` (mặc định 4, cho phép 1–20). Bài đang phát không bị tính | Code cũ (4 bài); miền giá trị: Đề xuất – chờ duyệt |
| R-17 | Bài không cho nhúng bị từ chối (`TRACK_NOT_EMBEDDABLE`). Bài dài hơn `maxTrackDurationSec` (khi giá trị này khác 0) bị từ chối (`TRACK_TOO_LONG`). Video đang livestream hoặc sắp công chiếu bị từ chối (`TRACK_LIVE`). Bài không tồn tại hoặc để riêng tư bị từ chối (`TRACK_NOT_FOUND`). Bài không rõ thời lượng vẫn được thêm | Spec §9; `TRACK_LIVE` và `TRACK_NOT_FOUND`: Đề xuất – chờ duyệt |
| R-18 | Thứ tự hàng chờ được tính theo §8.1 của spec: bài được ghim đứng trước; sau đó xếp theo vòng; trong cùng vòng xét ❤️ giảm dần, rồi `lastPlayedAt` tăng dần (người chưa từng có bài phát đứng trước), rồi `addedAt`, cuối cùng là `id` | Spec §8.1 |
| R-19 | Khi phòng đang `IDLE` mà có bài được thêm, bài đó phát ngay | Code cũ `addTrack` |
| R-20 | Xóa bài: người đã thêm bài hoặc admin, và chỉ khi bài còn `QUEUED`. Muốn bỏ bài đang phát thì phải dùng "Bỏ qua" | Code cũ; giới hạn trạng thái: Đề xuất – chờ duyệt |
| R-21 | "Phát tiếp theo" (`queue:pin-next`): chỉ admin hoặc người có `canControl`. Bấm lại vào bài đã ghim thì bỏ ghim. Nhiều bài được ghim thì xếp theo thời điểm ghim | Spec §7.2; bấm lại để bỏ ghim: Đề xuất – chờ duyệt |
| R-22 | ❤️: mỗi thành viên chỉ có một ❤️ trên toàn bộ các bài `QUEUED`. Thả tim bài khác thì tim chuyển sang bài đó; bấm lại đúng bài đang thả thì bỏ tim. Thiết bị phát không thả tim được | Code cũ; bỏ tim và thiết bị: Đề xuất – chờ duyệt |
| R-23 | Lời chúc dài 1–200 ký tự, kiểu giọng thuộc `radio, drama, baby, panic, chipmunk, sleepy`. Chỉ người đã thêm bài được đặt hay sửa lời chúc, và chỉ khi bài còn `QUEUED`. Gửi lời chúc rỗng nghĩa là xóa lời chúc | Code cũ; giới hạn: Spec §6 |

#### C. Phát nhạc

| ID | Quy tắc | Nguồn |
|---|---|---|
| R-24 | Chỉ chuyển bài khi `expectedItemId` trùng với bài đang phát. Lệnh gửi trùng hoặc tới muộn không có tác dụng | Spec §8.2 |
| R-25 | Số phiếu cần để bỏ qua = `max(1, ceil(onlineVoters × skipThreshold))`, trong đó `onlineVoters` là số thành viên đang online và không phải thiết bị. Chỉ phiếu của người đang online được tính. Server tính lại mỗi khi có người vào hoặc rời. Mỗi người một phiếu cho mỗi bài | Spec §8.3 |
| R-26 | `playback:control` (play, pause, skip, seek) dành cho admin và người có `canControl`. Giá trị seek phải nằm trong `[0, duration]` (khi biết thời lượng) | Spec §7.2 |
| R-27 | Mỗi phòng chỉ có một lease phát. Lease được gia hạn mỗi 5 giây và hết hạn sau 20 giây. Thiết bị mới nhận lease thì thiết bị cũ bị thu hồi. Chỉ trang `/host` (sau khi nhập đúng PIN) hoặc thành viên có `canPlay` mới nhận được lease | Spec §8.4 |
| R-28 | `player:report` chỉ được chấp nhận khi đến từ thiết bị đang giữ lease **và** `queueItemId` trùng với bài đang phát. Nếu không, server trả `STALE_ITEM` (sai bài) hoặc `FORBIDDEN` (không giữ lease) | Spec §7.2 |
| R-29 | Lỗi YouTube mã 2, 5, 100, 101 hoặc 150: bài bị đánh dấu `SKIPPED` và phát bài tiếp theo | Spec §8.2; Nền tảng (IFrame API) |
| R-30 | Khi biết thời lượng bài, server hẹn giờ chuyển bài ở mốc `duration + 5 giây` (tính theo thời gian phát thực) | Spec §8.2 |
| R-31 | Hàng chờ trống mà phòng có playlist dự phòng: chọn ngẫu nhiên một bài chưa phát trong 20 bài gần nhất. Không có playlist dự phòng thì chuyển sang `IDLE` | Spec §8.2 |
| R-32 | Máy phát kết nối lại thì phát tiếp từ `positionSec` đã lưu. Trong lúc tạm dừng, vị trí đứng yên | Spec §8.4 |
| R-33 | `lastPlayedAt` của người thêm bài được cập nhật khi bài của họ **bắt đầu** phát | Spec §8.2 |
| R-34 | Lời chúc TTS và âm thanh DJ chỉ phát trên máy phát. Các máy khác chỉ hiện hiệu ứng hình ảnh. Trong lúc đọc lời chúc, nhạc tạm giảm âm lượng còn 20% | Spec §8.5; mức 20%: Đề xuất – chờ duyệt |

#### D. Tìm kiếm và nguồn nhạc

| ID | Quy tắc | Nguồn |
|---|---|---|
| R-35 | Từ khóa tìm kiếm dài 1–100 ký tự sau khi trim. Không có key thì trả `SEARCH_UNAVAILABLE`; hết quota thì trả `QUOTA_EXCEEDED`. Kết quả tìm kiếm được cache 24 giờ theo từ khóa đã chuẩn hóa (chữ thường, bỏ dấu, `đ` thành `d`, gộp khoảng trắng). Mỗi thành viên tối đa 10 lượt tìm mỗi giờ | Spec §9 |
| R-36 | Thông tin bài lấy qua Data API; không có key hoặc hết quota thì dùng oEmbed với `durationSec = null`. Cache bảng `Track` 7 ngày | Spec §9 |
| R-37 | Gọi YouTube có timeout 5 giây và thử lại 1 lần với lỗi mạng hoặc 5xx; không thử lại với lỗi 4xx | Spec §9 |

#### E. Tương tác

| ID | Quy tắc | Nguồn |
|---|---|---|
| R-38 | Chat dài 1–500 ký tự. Mỗi người tối đa 5 tin trong 10 giây. Phòng giữ 200 tin gần nhất. Tên người gửi do server điền | Spec §8.5 |
| R-39 | Reaction phải thuộc danh sách `❤️ 🔥 👏 😂 🎉 😍 🤘 💃`; mỗi người tối đa 10 lần trong 10 giây | Spec §8.5; danh sách: theo emoji có sẵn trong `PlaybackControls` |
| R-40 | DJ: chỉ người có `canDj` hoặc admin, `soundType` thuộc `build, drop, clap, horn, airhorn, laugh, applause`, mỗi người chờ 1,5 giây giữa hai lần | Code cũ |
| R-41 | Nhật ký hoạt động ghi các sự kiện: vào phòng, rời phòng, thêm bài, xóa bài, bỏ qua, thả tim, đổi quyền, đổi cấu hình, mời ra, ghim bài, máy phát đổi. Phòng giữ 200 mục gần nhất | Code cũ; con số 200: Spec §6 |

#### F. Hệ thống

| ID | Quy tắc | Nguồn |
|---|---|---|
| R-42 | Payload của mọi lệnh phải đúng schema. Thừa trường, sai kiểu hoặc vượt độ dài đều bị từ chối với lỗi `VALIDATION`. Gói tin socket tối đa 100 KB | Spec §10; giới hạn 100 KB: Đề xuất – chờ duyệt |
| R-43 | Mỗi IP tối đa 20 lần `room:create`, `room:join` hoặc `host:register` mỗi phút | Spec §10 |
| R-44 | `CONTRACTS_VERSION` của client và server khác nhau thì client hiện banner yêu cầu tải lại trang | Spec §5.3 |
| R-45 | `GET /api/health` trả `{ status, db, contractsVersion, setupRequired, searchEnabled }`. Mã HTTP 200 khi database hoạt động, 503 khi database lỗi | Spec §5.1; hai trường cuối: Đề xuất – chờ duyệt |
| R-46 | Thiếu biến môi trường bắt buộc hoặc biến sai định dạng thì server **không khởi động** và ghi rõ biến nào sai | Spec §5.1 |
| R-47 | Cấu hình phòng: `skipThreshold` từ 0,1 đến 1; `maxQueuedPerMember` từ 1 đến 20; `maxTrackDurationSec` bằng 0 hoặc từ 60 đến 7200; `fallbackPlaylistUrl` là link playlist YouTube hoặc `null`; `allowGuestDj` kiểu boolean | Spec §6; miền giá trị: Đề xuất – chờ duyệt |
| R-48 | Link cũ `/room/[id]` chuyển hướng 308 sang `/r/[id]` | Spec §5.2 |
| R-49 | Mọi `room:update` có `version` tăng đơn điệu. Client bỏ qua bản có `version` nhỏ hơn hoặc bằng bản đang giữ | Spec §7.3 |
| R-50 | Snapshot kèm `serverTime`. Client tính lệch đồng hồ để hiển thị tiến độ phát | Đề xuất – chờ duyệt (xử lý đồng hồ máy khách bị lệch) |

### 2.2 Trạng thái và chuyển trạng thái

#### QueueItem

| Từ \ Sang | QUEUED | PLAYING | PLAYED | SKIPPED | REMOVED |
|---|---|---|---|---|---|
| (mới) | ✅ `queue:add` | ✅ `queue:add` khi phòng IDLE (R-19) | ❌ | ❌ | ❌ |
| QUEUED | — | ✅ `advance` chọn bài này | ❌ | ❌ | ✅ `queue:remove` (R-20) |
| PLAYING | ❌ | — | ✅ `ended`, hẹn giờ server | ✅ bỏ qua bằng phiếu, admin bỏ qua, `error` | ❌ (R-20) |
| PLAYED, SKIPPED, REMOVED | ❌ (trạng thái cuối) | ❌ | ❌ | ❌ | ❌ |

#### PlaybackState.status

| Từ \ Sang | IDLE | PLAYING | PAUSED |
|---|---|---|---|
| IDLE | — | ✅ thêm bài lúc đang rảnh, có bài dự phòng | ❌ (không có bài để tạm dừng) |
| PLAYING | ✅ `advance` khi hàng chờ trống và không có bài dự phòng | ✅ `advance` sang bài tiếp | ✅ `playback:control pause` |
| PAUSED | ✅ bỏ qua khi hàng chờ trống | ✅ `play` | — (pause lần nữa không có tác dụng) |

#### Thành viên (Member)

| Từ \ Sang | Hoạt động (online) | Hoạt động (offline) | Đã rời | Bị mời ra |
|---|---|---|---|---|
| (mới) | ✅ `room:join` hoặc `room:create` | ❌ | ❌ | ❌ |
| Online | — | ✅ socket cuối cùng ngắt | ✅ "Rời phòng" | ✅ admin mời ra |
| Offline | ✅ kết nối lại bằng token | — | ❌ (không có socket để gửi lệnh) | ✅ admin mời ra |
| Đã rời, bị mời ra | ❌ (token chết; muốn vào lại phải tạo thành viên mới) | ❌ | ❌ | ❌ |

Vai trò `USER ↔ ADMIN`: lên `ADMIN` qua `admin:claim` hoặc `permission:set{role}`; xuống `USER` qua `permission:set{role}` do một admin khác thực hiện. Admin **không tự hạ** quyền của mình được (đề xuất – chờ duyệt), để phòng tránh mất admin ngoài ý muốn; dù vậy vẫn luôn lấy lại được bằng PIN.

#### Lease máy phát

| Từ \ Sang | Không có | Đang giữ (A) | Đang giữ (B) | Hết hạn |
|---|---|---|---|---|
| Không có | — | ✅ A đăng ký (`host:register`, hoặc có `canPlay` và kết nối) | | ❌ |
| Đang giữ (A) | ✅ A bị thu hồi (mời ra, mất `canPlay`) | ✅ gia hạn | ✅ B chiếm quyền | ✅ 20 giây không có báo cáo |
| Hết hạn | — | ✅ A kết nối lại | ✅ B đăng ký | — |

### 2.3 Đầu vào, miền giá trị, đơn vị và định dạng

| Trường | Kiểu và định dạng | Miền giá trị | Đơn vị | Ghi chú |
|---|---|---|---|---|
| Tên phòng | chuỗi | 1–50 ký tự sau trim | ký tự | NFC |
| Tên hiển thị | chuỗi | 1–30 ký tự sau trim; ký tự điều khiển bị loại | ký tự | So trùng bằng `toLocaleLowerCase('vi')` |
| Mã phòng | chuỗi | đúng 6 ký tự thuộc bảng R-02 | — | Được nhập chữ thường hoặc có khoảng trắng |
| PIN | chuỗi số | `^\d{4,8}$` | — | — |
| Mật khẩu cài đặt | chuỗi | 1–200 ký tự | — | So sánh bằng hàm thời gian hằng |
| Link YouTube | chuỗi | ≤ 2048 ký tự; các dạng ở §9 của spec | — | `videoId` khớp `^[A-Za-z0-9_-]{11}$` |
| Từ khóa tìm kiếm | chuỗi | 1–100 ký tự | — | — |
| Lời chúc | chuỗi | 0–200 ký tự (0 nghĩa là xóa) | — | — |
| Tin chat | chuỗi | 1–500 ký tự | — | — |
| `skipThreshold` | số | 0,1–1,0 | tỉ lệ | Giao diện nhập phần trăm (10–100) |
| `maxQueuedPerMember` | số nguyên | 1–20 | bài | — |
| `maxTrackDurationSec` | số nguyên | 0 hoặc 60–7200 | giây | Giao diện nhập **phút** (0 hoặc 1–120) |
| `positionSec` | số thực | ≥ 0 và ≤ thời lượng | giây | Hiển thị dạng `m:ss` hoặc `h:mm:ss`, làm tròn xuống |
| Thời lượng YouTube | ISO 8601 (`PT#H#M#S`) | `P0D` nghĩa là livestream | giây | Đổi sang số nguyên giây |
| Thời điểm | ISO 8601 UTC | — | — | Client hiển thị theo giờ máy với định dạng `vi-VN` |

### 2.4 Bất biến

| ID | Bất biến |
|---|---|
| I-01 | Mỗi phòng có **tối đa một** `QueueItem` ở trạng thái `PLAYING`, và đó chính là `PlaybackState.currentItemId`. Nếu `status = IDLE` thì không có bài nào đang phát |
| I-02 | `version` tăng đơn điệu theo từng phòng; mỗi lần thay đổi trạng thái làm `version` tăng ít nhất 1 |
| I-03 | Mỗi thành viên có tối đa một ❤️ trên các bài `QUEUED` |
| I-04 | Số bài `QUEUED` của một thành viên không vượt `maxQueuedPerMember` ở thời điểm bài đó được thêm |
| I-05 | Mọi máy (thành viên và máy phát) nhận cùng một thứ tự hàng chờ cho cùng một `version` |
| I-06 | Không mất bài: mỗi bài từng được thêm luôn ở đúng một trong năm trạng thái; không bài nào bị phát hai lần nếu không được thêm hai lần |
| I-07 | Mỗi phòng có tối đa một lease phát còn hạn |
| I-08 | Dữ liệu gửi tới client không bao giờ chứa token, `adminPinHash`, `socketId`, `tokenVersion` hay IP |
| I-09 | Số phiếu hiển thị (`votes/required`) đúng bằng số được dùng để quyết định bỏ qua bài |
| I-10 | Tên hiển thị không trùng giữa các thành viên đang hoạt động trong cùng phòng |
| I-11 | Số bài trong hàng chờ ở tab Phòng, bộ đếm trên tab, và phần "Tiếp theo" ở máy phát luôn khớp nhau |

### 2.5 Điểm tích hợp và cách có thể hỏng

| Tích hợp | Cách hỏng | Xử lý |
|---|---|---|
| YouTube Data API `videos.list` | 403 `quotaExceeded`, 400 hoặc 403 key sai, 404, timeout, 5xx, trả về mảng rỗng (video không tồn tại) | Fallback oEmbed (quota); `TRACK_NOT_FOUND` (mảng rỗng); thử lại 1 lần (timeout, 5xx); key sai thì ghi log lỗi và coi như không có key |
| YouTube Data API `search.list` | Như trên | `QUOTA_EXCEEDED`, `SEARCH_UNAVAILABLE`, `INTERNAL` |
| oEmbed | 401/403 (không cho nhúng), 404 (không tồn tại hoặc riêng tư), timeout | `TRACK_NOT_EMBEDDABLE`, `TRACK_NOT_FOUND`, `INTERNAL` |
| IFrame Player | Lỗi 2, 5, 100, 101, 150; trình duyệt chặn tự phát; tab chạy nền bị bóp hiệu năng | Bỏ qua bài (R-29); nút "Bắt đầu phát"; dùng audio im lặng giữ tab hoạt động (code cũ có sẵn) |
| PostgreSQL | Mất kết nối, timeout, xung đột transaction | `/api/health` báo 503; lệnh trả `INTERNAL`; Docker tự khởi động lại; dùng `FOR UPDATE` để tránh đua lệnh |
| Socket.IO | Mất mạng, đổi Wi-Fi, điện thoại khóa màn hình | Tự kết nối lại; nhận snapshot mới; ack hết hạn sau 8 giây thì báo lỗi mạng |
| `localStorage` | Bị chặn (chế độ riêng tư), bị xóa | Giữ token trong bộ nhớ trang; tải lại trang phải nhập tên lại |
| `speechSynthesis` | Không có giọng `vi-VN`, trình duyệt không hỗ trợ | Dùng giọng mặc định; không hỗ trợ thì bỏ qua lời chúc và ghi `console.warn` |
| Đồng hồ máy khách | Lệch so với server | Tính lệch từ `serverTime` (R-50) |

### 2.6 Thông điệp hiển thị cho người dùng (nguyên văn, tiếng Việt)

| Mã | Thông điệp |
|---|---|
| `UNAUTHENTICATED` | Phiên của bạn đã hết hạn. Hãy nhập tên để vào lại phòng. |
| `FORBIDDEN` | Bạn không có quyền làm việc này. Hãy nhờ quản trị viên cấp quyền. |
| `VALIDATION` | Dữ liệu chưa hợp lệ. Hãy kiểm tra lại rồi thử lại. |
| `ROOM_NOT_FOUND` | Không tìm thấy phòng. Hãy kiểm tra lại mã phòng. |
| `NAME_TAKEN` | Tên này đã có người dùng trong phòng. Hãy chọn tên khác. |
| `PIN_INVALID` | Mã PIN không đúng. Bạn còn {remaining} lần thử. |
| `PIN_LOCKED` | Bạn đã nhập sai PIN quá nhiều lần. Hãy thử lại sau {minutes} phút. |
| `SETUP_PASSWORD_INVALID` | Mật khẩu cài đặt không đúng. Hãy hỏi người quản lý máy chủ. |
| `QUEUE_LIMIT` | Bạn đã có {max} bài đang chờ. Hãy đợi bài của bạn phát rồi thêm tiếp. |
| `TRACK_TOO_LONG` | Bài này dài {duration}, vượt giới hạn {max} của phòng. Hãy chọn bài ngắn hơn. |
| `TRACK_NOT_EMBEDDABLE` | Video này không cho phát ngoài YouTube. Hãy chọn bản khác. |
| `TRACK_NOT_FOUND` | Không tìm thấy video. Có thể video đã bị xóa hoặc để riêng tư. |
| `TRACK_LIVE` | Không thể thêm video đang phát trực tiếp. Hãy chọn video thường. |
| `LINK_UNSUPPORTED` | Không nhận ra link YouTube này. Hãy dán link dạng youtube.com/watch?v=… hoặc youtu.be/… |
| `SEARCH_UNAVAILABLE` | Máy chủ chưa bật tìm kiếm. Hãy dán link YouTube để thêm bài. |
| `QUOTA_EXCEEDED` | Hôm nay đã hết lượt tìm kiếm. Hãy dán link YouTube để thêm bài. |
| `RATE_LIMITED` | Bạn thao tác hơi nhanh. Hãy thử lại sau {seconds} giây. |
| `STALE_ITEM` | Bài này vừa thay đổi. Danh sách đã được cập nhật. |
| `INTERNAL` | Máy chủ đang gặp sự cố. Hãy thử lại sau ít phút. |
| `NETWORK` (phía client) | Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại. |
| `session:revoked kicked` | Bạn đã được mời ra khỏi phòng. |
| `session:revoked player_replaced` | Máy phát đã được mở ở thiết bị khác. Trang này đã dừng phát. |
| Banner phiên bản | Có phiên bản mới. Hãy tải lại trang. |
| Banner mất kết nối | Đang kết nối lại… |
| Banner máy phát offline | Máy phát đang mất kết nối. Hàng chờ vẫn nhận bài mới. |
| Banner chưa có máy phát | Chưa có máy phát. Mở trang máy phát trên máy nối loa: {url} |

### 2.7 Nhãn giao diện (dùng trong bước thao tác của ma trận case)

- **Trang chủ:** tab `Tạo phòng` / `Vào phòng`; ô `Tên của bạn`, `Tên phòng`, `Mã PIN quản trị`, `Mật khẩu cài đặt` (chỉ hiện khi instance yêu cầu), `Mã phòng`; nút `Tạo phòng`, `Vào phòng`.
- **Hộp thoại vào phòng** (mở link `/r/CODE` khi chưa có token): tiêu đề `Vào phòng {tên phòng}`; ô `Tên của bạn`; nút `Vào phòng`.
- **Thanh tab dưới:** `Phòng`, `Thêm bài`, `Mọi người`.
- **Tab Phòng:**
  - Thẻ đang phát; nút `Bỏ qua ({votes}/{required})`. Admin và người điều khiển có thêm `Bỏ qua ngay`, `Tạm dừng` / `Phát`.
  - Mỗi bài trong hàng chờ có nút `Thả tim` (aria), `Phát tiếp theo` / `Bỏ ghim`, `Gửi lời chúc`, `Xóa bài` (aria).
  - Hàng chờ trống: `Hàng chờ trống. Vào tab Thêm bài để chọn nhạc nhé!`
  - Thanh reaction có các emoji ở R-39.
- **Tab Thêm bài:**
  - Ô `Tìm bài hát hoặc dán link YouTube`; nút `Tìm` (khi nhập từ khóa) hoặc `Thêm vào hàng chờ` (khi nhập link); mỗi kết quả có nút `Thêm`.
  - Thông báo thành công: `Đã thêm "{title}" vào hàng chờ`.
- **Tab Mọi người:**
  - Danh sách thành viên kèm nhãn `Quản trị`, `Máy phát`, `Điều khiển`, `DJ`, `(bạn)`, chấm online.
  - Menu của admin: `Cấp quyền điều khiển` / `Bỏ quyền điều khiển`, `Cấp quyền DJ` / `Bỏ quyền DJ`, `Đặt làm máy phát`, `Cấp quyền quản trị` / `Bỏ quyền quản trị`, `Mời ra khỏi phòng` (xác nhận: `Mời {name} ra khỏi phòng?` với nút `Mời ra` / `Hủy`).
  - Nút `Nhận quyền quản trị` → hộp thoại `Nhập mã PIN quản trị`, nút `Xác nhận`.
  - Mục `Cài đặt phòng` (chỉ admin): `Tỉ lệ phiếu để bỏ qua (%)`, `Số bài tối đa mỗi người`, `Độ dài tối đa mỗi bài (phút, 0 = không giới hạn)`, `Playlist dự phòng (link YouTube)`, `Cho thành viên mới dùng DJ`; nút `Lưu cài đặt`; thông báo `Đã lưu cài đặt phòng`.
  - Chat: ô `Nhắn gì đó…`, nút `Gửi`.
  - Soundboard DJ.
- **Header:** tên phòng, mã phòng, nút `Chia sẻ` (thông báo `Đã sao chép link phòng`), nút `Rời phòng`, nút `Nhật ký`.
- **Trang máy phát:**
  - Màn hình nhập PIN: `Màn hình máy phát`, ô `Mã PIN quản trị`, nút `Mở máy phát`.
  - Màn hình phát: nút `▶ Bắt đầu phát`; nhãn `Quét để thêm bài`, `Mã phòng: {code}`, `Tiếp theo`.
  - Đang rảnh: `Đang chờ bài… Quét mã QR để thêm bài.`
  - Bị chiếm quyền: thông điệp `player_replaced`, nút `Phát ở máy này`.

### 2.8 Quyết định đề xuất (chờ người dùng duyệt, đang áp dụng)

1. Thêm mã lỗi **`TRACK_NOT_FOUND`** và **`TRACK_LIVE`**, vì danh sách lỗi trong spec chưa có hai trường hợp này.
2. **Rời phòng giữ lại các bài đang chờ** của người rời (R-11).
3. **Bấm lại ❤️ để bỏ tim** và **bấm lại "Phát tiếp theo" để bỏ ghim** (R-21, R-22).
4. **Admin không tự hạ quyền** của chính mình; thiết bị phát không được cấp quyền admin (R-13).
5. Cấu hình phòng giới hạn theo các miền giá trị ở R-47. Gói tin socket tối đa 100 KB (R-42).
6. Thay đổi so với spec: **dùng `ConsoleLogger({ json: true })` có sẵn của Nest 11 thay cho `nestjs-pino`**, và **`jose` thay cho `@nestjs/jwt`**. Lý do: bản mới nhất của hai thư viện kia yêu cầu Nest 12; thay bằng hai lựa chọn này giúp bớt phụ thuộc mà vẫn đáp ứng yêu cầu log có cấu trúc.
7. **Lời chúc TTS chỉ đọc trên máy phát.** Code cũ đang đọc trên **mọi máy** (`RoomContext` dòng 352–368), nên đây là thay đổi hành vi có chủ đích, trả lời câu Q1 trong spec.

### 2.9 Quyết định phát sinh khi triển khai (đang áp dụng, chờ duyệt)

| # | Thay đổi | Lý do |
|---|---|---|
| 8 | Thêm lệnh `player:claim` (máy phát xin lease) và `player:heartbeat` (giữ lease khi phòng rảnh) | Spec chưa có cách giữ lease khi không có bài nào để báo tiến độ. Lần thử tay đầu tiên cho thấy banner "Máy phát đang mất kết nối" hiện sai sau 20 giây phòng rảnh |
| 9 | Máy phát chỉ nhận lease **sau khi đã bấm "Bắt đầu phát"**, hoặc ngay lập tức nếu trình duyệt đã ghi nhận người dùng tương tác với trang | Tránh báo "máy phát online" trong khi trình duyệt vẫn chặn tự phát |
| 10 | Sự kiện thu hồi máy phát tách thành `player:revoked` (`replaced`/`permission`/`kicked`); `session:revoked` chỉ còn dùng cho `kicked`/`left`/`invalid` | Máy phát bị máy khác chiếm vẫn là thành viên hợp lệ, không cần đăng nhập lại |
| 11 | **Không cache kết quả tìm kiếm rỗng** | Từ khóa tạm thời không có kết quả sẽ không bị "kẹt" rỗng suốt 24 giờ |
| 12 | Biến `JOIN_LIMIT_PER_MINUTE` (mặc định 20, theo R-43) | E2E chạy mọi trình duyệt từ cùng một IP. Văn phòng đông người dùng chung một NAT cũng có thể cần nâng giới hạn này |
| 13 | Biến `YOUTUBE_FAKE=1`, **bị chặn khi `NODE_ENV=production`** | Dev và E2E không gửi yêu cầu nào ra YouTube |
| 14 | Người tạo phòng mặc định có `canPlay` (giống v1) cho tới khi trang `/host` nhận quyền | Giữ trải nghiệm cũ: tạo phòng trên laptop là phát được ngay |
| 15 | Thứ tự hàng chờ: bài **đã ghim không chiếm lượt** của người thêm (vòng chỉ tính trên các bài chưa ghim) | Ghim là quyền của admin hoặc người điều khiển, không nên làm người thêm bị lùi lượt |
| 16 | Một ID trần (11 ký tự) chỉ được coi là ID video khi chứa **cả chữ hoa lẫn chữ thường** | Tránh hiểu nhầm từ khóa tìm kiếm 11 ký tự (ví dụ `hello_world`) là ID. ID video toàn chữ thường hiếm gặp và vẫn thêm được bằng link đầy đủ |
| 17 | Mời ra khỏi phòng sẽ **xóa các bài đang chờ** của người bị mời (R-10); tự rời phòng thì **giữ** bài (R-11) | Người bị mời thường là người phá rối |
