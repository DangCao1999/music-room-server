# Đa ngôn ngữ: thêm tiếng Anh cho toàn bộ app

Ngày: 2026-10-17 · Client (chính) + server (nhỏ) · Contracts: **có đổi** (xem mục 7) · Migration DB: **không**

## Vì sao

Văn phòng có đồng nghiệp nước ngoài dùng chung phòng nhạc với người Việt. Hiện mọi chữ trong app là
tiếng Việt. Họ cần đọc được app bằng tiếng Anh **trên máy của mình**, trong khi người Việt cùng phòng
vẫn thấy tiếng Việt.

## Mục tiêu

- Mỗi thiết bị tự chọn ngôn ngữ (Tiếng Việt / English), máy nhớ lựa chọn và dùng cho **mọi trang, mọi phòng**.
  Mặc định tiếng Việt. **Không có ngôn ngữ của phòng**: không cài đặt nào của phòng ảnh hưởng tới ngôn ngữ
  trên thiết bị của ai.
- Trang `/host` (TV, máy loa) cũng theo lựa chọn trên **chính thiết bị đó**.
- Toàn bộ giao diện web có bản tiếng Anh tự nhiên, kể cả chữ trang trí trong theme, tên theme,
  trang Quyền riêng tư / Điều khoản, thời gian ("5 phút trước"), mô tả trang và ảnh chia sẻ link.
- Nhật ký hoạt động **mới** hiện theo ngôn ngữ người xem.
- Câu tổng kết (AI) theo ngôn ngữ người xem.

## Không làm (đợt này)

- **Giọng đọc lời MC và lời nhắn/lời chúc**: tách thành **dự án riêng** (giọng đọc mới, AI nhận ngôn ngữ).
  Đợt này giữ nguyên cách đọc và nội dung lời MC hiện tại.
- **Slack**: giữ nguyên tiếng Việt (tin nhắn, thẻ bình chọn, App Home).
- Không dịch lại **dữ liệu đã lưu**: các dòng nhật ký cũ, tên playlist đã có, tên "Người dùng Slack…".
- Không thêm ngôn ngữ thứ ba (nhưng cách làm không được chặn việc thêm sau).
- Không tự đoán ngôn ngữ theo trình duyệt (nhiều người Việt dùng trình duyệt tiếng Anh).
- Không dịch nội dung người dùng tự gõ (chat, lời chúc, tên phòng, tên người).

## Điều không được để xảy ra

- Người Việt đang dùng bị **tự đổi sang tiếng Anh** khi không tự chọn.
- Thiếu câu trong bản tiếng Anh mà vẫn build qua (phải bị TypeScript bắt).
- Trộn hai ngôn ngữ trên cùng một màn hình vì sót chữ viết thẳng trong code.
- Nhật ký cũ bị trống hoặc lỗi khi không có dữ liệu mới (phải lùi về câu tiếng Việt đã lưu).
- Client cũ (chưa tải lại) hoặc server cũ gặp dữ liệu mới thì lỗi: các trường mới đều là tuỳ chọn.

## Thiết kế

### 1. Ngôn ngữ và cách chọn

- Kiểu ngôn ngữ: `'vi' | 'en'`.
- **Ngôn ngữ của thiết bị**: localStorage `mr:lang` = `'vi' | 'en'`, mặc định `'vi'` (không có giá trị là
  `'vi'`). Làm theo mẫu của `mr:theme` (`src/themes/personal.ts`: `useSyncExternalStore` + sự kiện `storage`).
  Dùng cho mọi trang: trang chủ, trong phòng, `/host`, Quyền riêng tư, Điều khoản, `/p/[code]`.
- **Ngôn ngữ trong link**: link có đuôi `?lang=en` (hoặc `?lang=vi`). Thiết bị **chưa từng chọn** ngôn ngữ
  mở link này thì lưu luôn ngôn ngữ trong link làm lựa chọn của mình; thiết bị đã chọn thì giữ nguyên lựa chọn.
- **Nút chọn**: hai lựa chọn *Tiếng Việt* / *English*, có ở trang chủ, trong phòng (cạnh nút Giao diện
  trên thanh đầu trang) và trên `/host`; chọn ở đâu cũng là cùng một cài đặt của thiết bị.
  (Vị trí/kiểu dáng: quyết định của builder, miễn dễ thấy và dùng được trên điện thoại.)
- Theo ngôn ngữ của thiết bị: `<html lang>`, định dạng ngày giờ `Intl` (`vi-VN` / `en-GB`), `locale` của nút
  Google, sắp xếp tên (`localeCompare`). Chuẩn hoá chữ để tìm kiếm (`contracts/text.ts`) **giữ nguyên** `'vi'`.

### 2. Từ điển và cách dùng trong client

- Thêm `src/i18n/en.ts` cùng **đúng cấu trúc** `vi.ts` (khoá, hàm, tham số). Kiểu được suy ra từ `vi`
  (chuỗi → `string`, hàm giữ chữ ký) để thiếu/thừa khoá là lỗi TypeScript.
- Hook `useT()` trả về từ điển theo ngôn ngữ của thiết bị; thay các `import { vi } from '@/i18n/vi'`
  (67 file) bằng từ điển này. `errorMessage(code, params)` dịch theo ngôn ngữ của thiết bị.
- **Link chia sẻ theo ngôn ngữ người chia sẻ**: nút "Chia sẻ phòng" / "Sao chép link" (và nút chia sẻ của
  hệ điều hành) thêm `?lang=en` khi người chia sẻ dùng English; người dùng tiếng Việt giữ link như hiện nay.
  Mã chạy phía server của Next — `app/r/[code]/layout.tsx` (`generateMetadata`: tiêu đề, mô tả),
  `share-image/route.tsx` (ảnh xem trước) — đọc `lang` từ link; không có thì tiếng Việt. Ảnh xem trước có
  ngôn ngữ trong tham số chống cache. Mã QR trên `/host` giữ link thường.
- Các phần render phía server khác (`app/layout.tsx`, `lib/web-manifest.ts`, `app.webmanifest/route.ts`)
  mặc định tiếng Việt; builder có thể đọc cookie để render đúng ngôn ngữ đã chọn (xem "Để builder quyết định").
- Đưa toàn bộ chữ đang viết thẳng vào từ điển (danh sách đã rà): chữ trong các theme (pixel, hifi82,
  synthwave, astro, stage, transistor, station, cassette, walnut, cosmos), `THEME_GROUPS` và tên 13 theme
  (`themes/registry.ts`), `LegalPage`, liên kết chân trang, nhãn mặc định "Đóng" của `Dialog`,
  `lib/time.ts` (`formatClock`, `formatAgo`), `toLocaleTimeString('vi-VN')` ở theme station.
- Trang **Quyền riêng tư** và **Điều khoản**: viết bản tiếng Anh tương đương nội dung tiếng Việt hiện có
  (không đổi nội dung pháp lý).
- Số nhiều tiếng Anh viết đúng (`1 song` / `2 songs`); tiếng Việt giữ nguyên.
- Chất lượng dịch: tiếng Anh tự nhiên, ngắn gọn, đúng giọng app (không dịch từng chữ). Tên riêng
  (Music Room, ON AIR, DJ) giữ nguyên. Không đổi câu tiếng Việt hiện có.

### 3. Nhật ký hoạt động: hiện theo ngôn ngữ người xem

- Server: `ActivityService.log(...)` nhận thêm **tham số có cấu trúc** cho từng loại sự kiện và lưu vào cột
  `metadata` đã có (`{ v: 1, ...params }`). Vẫn lưu câu tiếng Việt vào `message` như hiện nay (để dự phòng
  và cho Slack/nơi khác).
- Tham số theo loại (builder có thể chỉnh tên khoá, nhưng phải đủ để dựng lại mọi biến thể câu hiện có,
  khoảng 31 biến thể):
  - tên bài: `title`; người bị tác động: `target` (tên hiển thị) và `targetDevice` nếu là thiết bị;
    số lượng: `count`; phiếu: `yes`, `no`; mã lỗi video: `code`;
  - `variant` để phân biệt các câu cùng loại: ví dụ `user_join` (vào phòng / kết nối thiết bị / từ Slack),
    `user_rejoin` (có/không mất quyền), `permission_change` (7 câu), `settings_change`
    (giao diện / cài đặt khác), `track_add` (một bài / từ playlist), `track_pin` (ghim / bỏ ghim),
    `track_skip` (bị bỏ qua bởi người / đủ phiếu / hết giờ);
  - người làm là thiết bị: `actorDevice: true` (để hiện tên thiết bị theo ngôn ngữ, mục 4).
- Hợp đồng: `ActivityLogView` thêm `params` (tuỳ chọn, `null` với dòng cũ).
- Client: dựng câu từ `type` + `params` theo ngôn ngữ người xem; **không có `params` thì hiện `message` đã lưu**
  (dòng cũ vẫn tiếng Việt). Thứ tự hiển thị vẫn "**Tên người** + câu" như hiện nay; với các câu không có
  người làm (bỏ qua vì đủ phiếu, hết giờ, lỗi video) hiện cả câu.

### 4. Tên thiết bị

- Thành viên thiết bị có tên lưu sẵn "Máy phát" / "Máy phát N". Client hiện tên theo ngôn ngữ người xem
  khi `isDevice` (ví dụ "Speaker" / "Speaker 2", giữ số thứ tự từ tên đã lưu). Áp dụng ở danh sách
  Mọi người, nhật ký, khung chờ của `/host` ("…trên máy của …") và mọi chỗ khác hiện tên thành viên.
- Server **không** đổi tên đã lưu.

### 5. Nội dung AI có chữ cho người dùng

- **Câu tổng kết** (`library.service.ts`): theo ngôn ngữ **người xem**. Lệnh lấy tổng kết (`room:recap`) nhận
  thêm `language` (tuỳ chọn, mặc định `'vi'`); câu lệnh cho AI có bản tiếng Anh; khoá bộ nhớ đệm 10 phút thêm ngôn ngữ.
- **Hỏi DJ** (`dj.service.ts`): lệnh nhận thêm `language` của người hỏi (tuỳ chọn, mặc định `'vi'`); chỉ
  "ưu tiên nhạc Việt khi yêu cầu mơ hồ" khi người hỏi dùng tiếng Việt.
- **Lời MC**: không đổi ở đợt này (thuộc dự án giọng đọc mới).
- Radio tự động, kiểm duyệt, track-meta: không đổi (không có chữ cho người dùng).

### 6. Tên do app tự tạo khi lưu

- Playlist client tự đặt tên khi tạo ("Playlist từ YouTube", "Danh sách đã dán"): dùng từ điển theo ngôn ngữ
  của người tạo. Tên đã lưu giữ nguyên.
- Playlist do server tạo ("Đã thích trên YouTube", "Dành cho bạn"): server giữ nguyên tên; **client hiện tên
  theo ngôn ngữ người xem**. View playlist hiện chưa cho biết nguồn nên thêm trường tuỳ chọn
  `kind: 'liked' | 'mix' | null` (từ `source` = `yt:liked` / `mix:foryou`) vào `PlaylistSummaryView` / `PlaylistView`.
- "Người dùng Slack…": giữ nguyên (đang được dùng làm khoá dò tìm).

### 7. Hợp đồng dữ liệu (contracts)

- `ActivityLogView.params` (tuỳ chọn).
- `PlaylistSummaryView.kind` / `PlaylistView.kind` (tuỳ chọn).
- `room:recap` và lệnh Hỏi DJ nhận `language` (tuỳ chọn).
- **Không** thêm cài đặt phòng nào.
- Tăng `CONTRACTS_VERSION` (**fetch `origin/develop` của server trước khi tăng** — đồng nghiệp đẩy thẳng lên
  develop), chạy `npm run contracts:sync` ở client.
- Mọi trường mới đều tuỳ chọn để client/server cũ và mới chạy được với nhau trong lúc deploy.

### 8. Thứ tự triển khai

1. Server: contracts + params nhật ký + ngôn ngữ cho tổng kết / Hỏi DJ. Deploy trước (tương thích ngược).
2. Client: từ điển `en.ts`, `useT`, nút chọn, thay toàn bộ chỗ dùng `vi`, chữ viết thẳng, nhật ký, tên thiết bị,
   trang pháp lý, metadata.

## Kiểm tra

Không viết test tự động (quy ước dự án). Kiểm bằng lint + typecheck + build ở cả hai repo và chạy thử trên dev:
- Đổi VI / EN ở trang chủ, trong phòng và trên `/host`; tải lại vẫn nhớ; hai trình duyệt khác ngôn ngữ cùng một phòng.
- Link chia sẻ của người dùng English có `?lang=en`; tiêu đề + ảnh xem trước (dán vào Slack/Zalo hoặc xem
  thẻ `og:`) là tiếng Anh; thiết bị mới mở link đó thấy tiếng Anh, thiết bị đã chọn tiếng Việt vẫn tiếng Việt.
- Rà màn hình (mọi tab, hộp thoại, 13 theme, `/host`, trang chủ, trang pháp lý, banner, lỗi) không còn chữ Việt khi chọn English.
- Nhật ký: sự kiện mới hiện đúng hai ngôn ngữ; dòng cũ vẫn hiện câu tiếng Việt.
- Tổng kết theo ngôn ngữ người xem; Hỏi DJ tiếng Anh không bị ép nhạc Việt.
- Thiết bị chưa từng chọn vẫn là tiếng Việt.

## Để builder quyết định

- Câu chữ tiếng Anh cụ thể (tự nhiên, ngắn; giữ giọng app).
- Trang render phía server (trang chủ, trang pháp lý, metadata) có thể chớp tiếng Việt trước khi đọc được
  `mr:lang`: chấp nhận được, hoặc lưu thêm cookie để render đúng ngay từ đầu.
- Đọc ngôn ngữ ở mã ngoài React (`room-store.ts`, `added-by.ts`…), thêm ngôn ngữ vào tham số chống cache
  của ảnh chia sẻ nếu dùng cookie.
- Cách tổ chức file từ điển (một file `en.ts` hay chia nhỏ), helper số nhiều.
- Vị trí và kiểu dáng nút chọn ngôn ngữ.
- Tên khoá trong `params` của nhật ký.
- Cách lấy số thứ tự từ tên thiết bị đã lưu.
