# Chủ đề giao diện (13 chủ đề, đổi được)

Ngày: 2026-10-17 · Client + server nhỏ · Contracts: đổi (bump) · Migration: không (thiết lập phòng là JSON)
Mockup đã duyệt: `docs/specs/assets/2026-10-17-themes/` (mở bằng trình duyệt).

## Vì sao

Văn phòng muốn trang nghe nhạc có không khí riêng và vui hơn; mỗi người lại có gu khác nhau. Người
dùng đã duyệt 13 chủ đề và muốn có đủ cả 13: quản trị viên chọn chủ đề mặc định cho phòng, mỗi người
vẫn tự chọn chủ đề riêng cho máy mình.

## Mục tiêu

- 13 chủ đề, đổi được tức thì. **Tính năng giống hệt nhau** ở mọi chủ đề, nhưng **bố cục và trang trí
  theo đúng mockup phương án B** của từng chủ đề (người dùng chốt: "giữ hết chi tiết trang trí như
  mockup B"; đã xem và không chọn phương án A "giữ bố cục cũ, chỉ phóng to ảnh bìa").
- **Quản trị viên** chọn chủ đề của phòng (mặc định cho mọi người và cho màn hình máy phát).
- **Mỗi người** chọn chủ đề riêng cho trình duyệt của mình, hoặc "Theo phòng".

## Không làm (bản này)

- Không đổi bố cục của chủ đề `default`: nó chính là trang phòng hiện tại (kể cả trò chuyện nằm sẵn ở
  cột phải trên máy tính, lời chúc, nút chat nổi trên điện thoại).
- Không tự đổi chủ đề theo giờ / theo dịp (ý tưởng để sau).
- Không lưu chủ đề riêng vào tài khoản (chỉ trên trình duyệt).
- Không đổi trang chủ (`/`), trang chính sách, trang playlist chia sẻ — chỉ các trang **trong phòng**:
  trang phòng `/r/[code]`, màn hình máy phát `/r/[code]/host`, hộp vào phòng, trình phát thu nhỏ (PiP).

## Điều không được để xảy ra

- Chủ đề làm mất hoặc giấu chức năng, hay làm chữ khó đọc (tương phản dưới chuẩn WCAG AA cho chữ
  thường 4.5:1, chữ lớn / icon 3:1).
- Dùng emoji / ký tự unicode làm icon giao diện (người dùng không thích). Icon luôn là bộ lucide nét
  mảnh như hiện nay; emoji chỉ còn ở hàng thả cảm xúc (đó là nội dung). Mockup 4 chủ đề vintage còn
  emoji / ký tự (⤴ ⟲ ⇥ ✅ ❌ 🗳 ⏭ 🎧 🔖 ⧉ 📌 ✉ 📢 ♡ ◉ 👥 ＋ 🔍): khi làm thay hết bằng lucide.
- Một chức năng chạy được ở chủ đề này mà thiếu ở chủ đề khác. Danh sách chức năng phải có ở **mọi**
  chủ đề, máy tính và điện thoại: bỏ phiếu bỏ qua (đồng ý / nghe tiếp + đếm ngược), nghe cùng, lưu,
  thu nhỏ (PiP), menu ⋯ bài đang phát (lời bài hát đầy đủ, chặn bài), tạm dừng / qua ngay (người có
  quyền), lời chúc, lời bài hát, hàng chờ (tim, menu ⋯: ghim, lời chúc, xoá, chặn), gợi ý tiếp theo,
  khung Thêm bài đủ tab, tab Mọi người (thành viên, quyền, tổng kết, cài đặt phòng, xoá phòng), trò
  chuyện + phản ứng + DJ pads, chia sẻ, lịch sử, rời phòng, banner, chấm đỏ tin mới.
- Trang chậm đi rõ rệt vì tải font / ảnh của 13 chủ đề cùng lúc.
- Màn hình máy phát đổi theo sở thích cá nhân của ai đó (máy phát luôn theo chủ đề phòng).

## Danh sách 13 chủ đề

Mockup là nguồn chuẩn cho màu, chữ và chi tiết đặc trưng. Mỗi chủ đề có **id ổn định** (lưu trong thiết
lập phòng và trình duyệt):

| id | Tên hiển thị | Nhóm | Sáng/tối | Chi tiết đặc trưng (từ mockup) |
|---|---|---|---|---|
| `default` | Mặc định | — | tối | giao diện hiện tại (nền mờ theo ảnh bìa) |
| `listening` | Phòng nghe nhạc | Tối giản | tối | đĩa than hé sau bìa vuông; chữ Fraunces |
| `hifi82` | Dàn máy Nhật 1982 | Tối giản | **sáng** | màn LCD hổ phách cho thời gian; phím vuông có chữ; đèn tín hiệu cam |
| `midcentury` | Áp phích giữa thế kỷ | Tối giản | tối | ảnh bìa tròn trên mặt trời vàng + vòng cam; chữ đứng hẹp |
| `walnut` | Tủ hi-fi gỗ óc chó | Vintage | tối | mâm đĩa than quay, kim VU; nút đồng thau |
| `transistor` | Đài bán dẫn | Vintage | tối | mặt dò sóng hổ phách + kim đỏ; núm vặn; phím đài |
| `cassette` | Băng cassette tự thu | Vintage | tối | nhãn băng viết tay, 2 cuộn băng quay; phím cơ; giấy note |
| `station` | Bảng giờ tàu nhà ga | Vintage | tối | chữ lật; hàng chờ là bảng giờ có cột "Dự kiến" |
| `astro` | Chiêm tinh | Bầu trời | tối | vòng 12 cung quanh bìa tròn, cung vàng = thời gian; trăng khuyết = đếm ngược bỏ phiếu |
| `cosmos` | Vũ trụ | Bầu trời | tối | bìa thành hành tinh, vệ tinh trên quỹ đạo = thời gian; sao = người nghe cùng |
| `saigon` | Sài Gòn xưa | Việt Nam | **sáng** | dải gạch bông, biển hiệu tên phòng, bảng phấn "Tiếp theo" |
| `pixel` | Máy chơi game 8-bit | Thập niên | tối | khung màn hình game, thanh máu = thời gian, "đánh boss" = bỏ phiếu |
| `synthwave` | Synthwave 80s | Thập niên | tối | mặt trời sọc + lưới chân trời, chữ nghiêng phát sáng, số LED đếm ngược |

Ghi chú:
- 4 chủ đề vintage (`walnut`, `transistor`, `cassette`, `station`) trong mockup còn dùng emoji làm icon:
  khi làm phải đổi sang lucide.
- Mockup `default` không có bản vẽ: nó là trang phòng hiện tại.
- "Bảng giờ tàu": cột "Dự kiến" = giờ phát dự kiến tính từ thời lượng các bài trước (ước lượng, có thể
  lệch khi ai đó bỏ qua bài).
- Tên gọi theo chủ đề (ví dụ "Tín hiệu" thay "Trò chuyện" ở Vũ trụ, "Màn tiếp theo" ở 8-bit) chỉ là lớp
  chữ trang trí trên tiêu đề; nhãn cho trình đọc màn hình / aria giữ nguyên tên chuẩn.

## Mời người vào phòng (đi kèm, mọi chủ đề)

- Chỉ **một chỗ**: thanh trên cùng có **mã phòng** (bấm = sao chép link, toast "Đã sao chép link
  phòng") và **một nút chia sẻ** mở hộp: QR lớn, mã phòng, link, "Sao chép link", "Gửi qua…" (Web
  Share API, ẩn khi trình duyệt không hỗ trợ). Không có thẻ chia sẻ ở cột phải. (Giống app hiện tại,
  chỉ thêm "Gửi qua…" nếu chưa có.)

## Chọn chủ đề

### Quản trị viên — chủ đề của phòng
- Trong **Cài đặt phòng**: mục "Giao diện của phòng" với lưới thẻ xem trước nhỏ (màu + tên) của 13 chủ
  đề, chọn một → lưu ngay (không cần bấm "Lưu cài đặt").
- Server: `RoomSettings.theme: ThemeId` (mặc định `default`); đổi qua lệnh thiết lập phòng hiện có
  (`room:settings`, chỉ quản trị viên) hoặc lệnh riêng — builder chọn. Snapshot đã gửi
  `room.settings` nên mọi máy nhận ngay.
- Máy phát `/r/[code]/host` **luôn** dùng chủ đề phòng.
- *Quyết định của người viết — máy phát:* bố cục máy phát giữ như hiện nay (video lớn, QR, lời bài
  hát, Tiếp theo); áp **token màu, font, trang trí nền / thanh trên, `ProgressDial`, `VoteMeter`**, thẻ
  QR theo màu chủ đề, danh sách "Tiếp theo" tạo kiểu theo chủ đề. Khung video giữ nguyên (không bọc
  khung theo chủ đề) vì video cần rõ cho cả phòng xem.
- *Quyết định của người viết — máy phát với 4 chủ đề đồ vật:* thêm token / font / nền như các chủ đề
  khác, và **chỉ báo thời gian đặc trưng** của chủ đề (kim VU, mặt dò sóng, cuộn băng, đồng hồ chữ lật)
  làm thành component dùng chung giữa trang phòng và máy phát. Danh sách "Tiếp theo" của máy phát chỉ
  tạo kiểu bằng CSS (không dựng chồng đĩa / phím đài / bìa băng / bảng giờ trên máy phát).
- *Quyết định của người viết:* hộp vào phòng biết chủ đề phòng qua `room:peek` (thêm `theme` vào kết quả).

### Mỗi người — chủ đề riêng
- Nút **"Giao diện"** (icon `Palette`) ở thanh trên trang phòng, cạnh chia sẻ / lịch sử. Mở bảng chọn:
  "Theo phòng (<tên chủ đề phòng>)" ở đầu, rồi 13 thẻ xem trước, nhóm theo Tối giản / Vintage / Bầu
  trời / Việt Nam / Thập niên. Chọn là áp dụng ngay.
- Lưu trong `localStorage` (`mr:theme`, bọc try/catch), áp dụng cho **mọi phòng** trên trình duyệt đó.
  Giá trị `room` (hoặc không có) = theo phòng.
- Chủ đề hiệu lực = riêng (nếu có) ?? của phòng ?? `default`. Id lạ (bản cũ / đã bỏ) → `default`.

## Bố cục theo chủ đề (phương án B)

Mockup là nguồn chuẩn cho bố cục từng chủ đề, cả máy tính lẫn điện thoại (mỗi chủ đề trong mockup có
bản máy tính + bản điện thoại cạnh nhau). Có hai họ bố cục:

### Họ "sân khấu" — 8 chủ đề: `listening`, `hifi82`, `midcentury`, `astro`, `cosmos`, `saigon`, `pixel`, `synthwave`

Cùng một khung, khác nhau ở trang trí và các khe:
- **Máy tính, cột trái — khối sân khấu lớn:** ảnh bìa lớn theo kiểu chủ đề (khe `CoverArt`, cỡ như
  mockup, khoảng 200–260px), nhãn "Đang phát", **tên bài chữ display cỡ lớn**, nghệ sĩ + người chọn,
  thời gian (khe `ProgressDial`), hàng nút, khung bỏ phiếu (khe `VoteMeter`), **lời chúc**, **lời bài
  hát nằm sẵn 3 dòng** (dòng đang hát nổi bật), rồi **Tiếp theo** và **Gợi ý tiếp theo**.
- **Máy tính, cột phải:** **Trò chuyện luôn mở ở đầu**, dưới là Thêm bài / Mọi người (như hiện nay).
- **Điện thoại:** 3 tab dưới đáy (Phòng / Thêm bài / Mọi người); tab Phòng là sân khấu thu gọn (ảnh
  bìa, tên bài, thời gian, nút, Tiếp theo) như bản điện thoại trong mockup.
- **Trang trí riêng phải có (giữ hết như mockup):**
  - `listening`: đĩa than hé sau bìa vuông.
  - `hifi82`: màn LCD hổ phách cho thời gian, đèn tín hiệu cam, **hàng phím vuông icon trên chữ**
    (phím đang có tác dụng sáng cam), "Tiếp theo" **có số thứ tự**.
  - `midcentury`: bìa tròn trên mặt trời vàng + vòng cam lồng nhau, "Tiếp theo" bìa tròn nhỏ.
  - `astro`: vòng 12 cung quanh bìa tròn (cung vàng = thời gian), trăng khuyết dần = đếm ngược, nền sao.
  - `cosmos`: bìa thành hành tinh có bóng tối + quỹ đạo nghiêng, vệ tinh chạy = thời gian; **"Quỹ đạo
    tiếp theo": hàng hành tinh nhỏ dần theo thứ tự phát, bấm một hành tinh mở thông tin bài (tên, tim,
    ghim, lời chúc)**, kèm danh sách đầy đủ bên dưới; **"N người đang nghe cùng" vẽ thành các ngôi
    sao**; tiêu đề trò chuyện "Tín hiệu", ô nhắn "Gửi tín hiệu cho cả phòng…"; nền tinh vân.
  - `saigon`: dải gạch bông đầu trang, **biển hiệu tên phòng**, bìa trong khung có bóng xanh ngọc,
    **"Tiếp theo" là bảng phấn khung gỗ chữ viết tay**, lời chúc viết tay như thiệp.
  - `pixel`: khung màn hình game cho bìa, thanh máu từng ô = thời gian, **"đánh boss"**: thanh máu boss,
    mỗi ô một phiếu đồng ý; **"x N người" kiểu số mạng** ở thanh trên (N = số người đang online);
    "Màn 1: đang phát", "Màn tiếp theo"; nút bóng đổ cứng.
  - `synthwave`: mặt trời sọc + lưới chân trời sau bìa viền neon, tên bài nghiêng phát sáng, thanh thời
    gian neon, **số LED đếm ngược** cho bỏ phiếu.

### Họ "đồ vật" — 4 chủ đề vintage, mỗi chủ đề một bố cục riêng

- `walnut` (Tủ hi-fi gỗ óc chó): **mâm đĩa than quay, ảnh bìa ở nhãn đĩa**, cần đĩa; tên + lời chúc bên
  phải mâm; **kim VU** = thời gian; dải bỏ phiếu đỏ có đếm ngược; lời bài hát 3 dòng dưới mâm; nút đồng
  thau; **"Chồng đĩa tiếp theo"**: hàng bìa đĩa vuông, mỗi đĩa có ⋯ (ghim, lời chúc, xoá, chặn) và tim;
  gợi ý là đĩa cuối chồng có nhãn "gợi ý"; trò chuyện là **"Sổ lời nhắn"** ở cột phải.
- `transistor` (Đài bán dẫn): **mặt kính dò sóng hổ phách đầu trang, kim đỏ chạy theo bài**; nút chính
  là **núm vặn có chữ** (Bỏ qua màu đỏ); bỏ phiếu là ô đèn hổ phách trên mặt đài; **"Phím đài · Tiếp
  theo": các phím đài màu ngà, mỗi phím một bài, có ⋯**; phím "Thêm bài hoặc gợi ý" mở gợi ý; trò
  chuyện là **"Thư thính giả" trên lưới loa**, ô nhắn "Gửi thư cho cả phòng…", DJ pads trong khung
  thư; chia sẻ / lịch sử / rời phòng có chữ trên thanh crôm.
- `cassette` (Băng cassette tự thu): **nhãn băng viết tay** cho bài đang phát ("Mặt A"), **cửa sổ băng
  với 2 cuộn quay** theo thời gian; **phím cơ có nhãn chữ, lún khi bấm**; lời chúc là **giấy note vàng
  viết tay**; **"Mặt B · Tiếp theo" là bìa băng (J-card) đánh số**, gợi ý là dòng viết tay cuối bìa;
  trò chuyện là **giấy note nhiều màu**; chia sẻ / lịch sử và tab Thêm bài / Mọi người là **nhãn dập
  nổi (Dymo)**.
- `station` (Bảng giờ tàu nhà ga): **tên phòng và mã phòng chữ lật**, **đồng hồ** ở thanh trên; bài đang
  phát chữ lật lớn, nhãn "Đang phát · Sân ga 1"; **"Tiếp theo" là bảng giờ khởi hành với cột Dự kiến /
  Bài / Người chọn / Ghi chú** (ghim, lời chúc, tim ở cột Ghi chú + ⋯), gợi ý là dòng mờ cuối bảng;
  **loa nhà ga: dòng chữ chạy các tin trò chuyện mới nhất** + khung trò chuyện luôn mở; nút bỏ phiếu
  vàng nổi bật.

Ghi chú bố cục:
- Mỗi chủ đề có bản điện thoại theo mockup (3 tab dưới đáy, tab Phòng là phiên bản thu gọn của bố cục
  chủ đề đó).
- **Trò chuyện trên điện thoại (người dùng chốt):** mọi chủ đề giữ **nút chat nổi** như hiện nay (chấm đỏ
  tin mới, bấm mở cửa sổ chat có phản ứng + DJ pads, ẩn khi cuộn xuống); chỉ đổi màu / kiểu theo chủ đề.
  Trang trí kiểu giấy note / thư thính giả / loa nhà ga áp vào cửa sổ chat đó; dòng chữ chạy của
  `station` chỉ có trên máy tính.
- Tên gọi theo chủ đề ("Sổ lời nhắn", "Thư thính giả", "Tín hiệu", "Màn tiếp theo", "Phím đài", "Mặt B"…)
  là chữ hiển thị; nhãn cho trình đọc màn hình / aria giữ tên chuẩn ("Trò chuyện", "Tiếp theo"…).
- Chi tiết "hiện khi rê chuột" trong mockup (ví dụ tên nút chỉ hiện khi rê ở `listening`) phải có cách
  thấy được trên điện thoại / bàn phím (aria-label + tooltip khi focus).

## Kiến trúc client (định hướng — chi tiết để builder)

- **Tách logic khỏi trình bày:** dữ liệu và hành động của trang phòng (snapshot, lệnh, quyền, bỏ phiếu,
  hàng chờ, chat, lời bài hát…) nằm ở hook / component chức năng dùng chung; mỗi chủ đề chỉ là **lớp
  trình bày** gọi lại chúng. Không chép logic theo chủ đề. Menu ⋯, hộp thoại (chia sẻ, chặn, lời chúc,
  lưu, xoá phòng…), khung Thêm bài, tab Mọi người dùng chung, chỉ đổi kiểu bằng token.
- **Token theo chủ đề:** `data-theme="<id>"` trên vùng trang phòng; mỗi chủ đề định nghĩa lại các biến
  màu Tailwind 4 đang dùng (`--color-dial`, `--color-panel`, `--color-panel-hi`, `--color-line`,
  `--color-paper`, `--color-sage`, `--color-amber`, `--color-amber-ink`, `--color-onair`, …), bo góc,
  font display / body, và vài biến riêng (ví dụ màu LCD).
- **Họ sân khấu:** một component khung dùng chung + các khe chọn biến thể theo `theme`: `CoverArt`,
  `ProgressDial`, `VoteMeter`, `QueueView` (danh sách thường / có số / bảng phấn / hàng hành tinh +
  danh sách), trang trí nền / thanh trên (gạch bông, biển hiệu, sao, tinh vân, lưới synthwave, số mạng).
- **Họ đồ vật:** mỗi chủ đề một component bố cục riêng (`walnut`, `transistor`, `cassette`, `station`)
  lắp từ cùng các hook / component chức năng.
- **Chủ đề `default`:** dùng nguyên trang phòng hiện tại.
- **Code theo chủ đề tải khi cần:** bố cục + CSS + font của chủ đề chỉ tải khi chủ đề đó được dùng
  (dynamic import), không gộp cả 13 vào gói ban đầu.
- **Font:** chỉ tải font của chủ đề đang dùng, `font-display: swap`; mọi font phải hỗ trợ tiếng Việt —
  font trong mockup nào thiếu dấu tiếng Việt (cần kiểm, ví dụ Pixelify Sans, VT323, chữ viết tay) thì
  thay bằng font cùng tinh thần có hỗ trợ. Không tải sẵn font của 13 chủ đề.
- **Chuyển động:** đĩa quay / cuộn băng quay / vệ tinh / kim chạy theo thời gian thật của bài; chữ lật
  khi đổi bài; dòng chữ chạy ở `station`. Tắt hết khi `prefers-reduced-motion` (chữ chạy thành danh
  sách tĩnh, chữ lật thành đổi tức thì).
- **"Dự kiến" (`station`):** giờ phát dự kiến = bây giờ + thời gian còn lại của bài đang phát + thời
  lượng các bài trước nó trong hàng chờ (ước lượng, có thể lệch khi ai đó bỏ qua bài).
- *Quyết định của người viết — lời bài hát nằm sẵn:* ở các chủ đề có ô lời 3 dòng, bài có lời đồng bộ
  thì hiện sẵn (vẫn có nút ẩn / hiện, nhớ theo trình duyệt như cài đặt lời bài hát hiện có); bài chỉ có
  lời không đồng bộ hoặc không có lời thì **ẩn ô này**, lời đầy đủ vẫn mở từ menu ⋯ bài đang phát.
- **PiP (trình phát thu nhỏ):** dùng biến màu của chủ đề hiệu lực; không cần chi tiết đặc trưng.

## Server / contracts

- `ThemeId` = union 13 id ở trên, export trong contracts; `RoomSettingsSchema.theme` (`z.enum`),
  mặc định `default` khi đọc thiết lập cũ (`readSettings`).
- Bump `CONTRACTS_VERSION` (fetch server `origin/develop` trước; client `npm run contracts:sync`).
- Không cần migration (`Room.settings` là JSON).

## Để builder quyết

- Lệnh đổi chủ đề phòng: dùng `room:settings` hay lệnh riêng nhẹ hơn.
- Cách tải font theo chủ đề; cách tổ chức file CSS chủ đề (một file / chủ đề).
- Giá trị màu cuối cùng cho từng chủ đề (lấy từ mockup, chỉnh để đạt AA).
- Kích thước ảnh bìa, khoảng cách, cỡ chữ cụ thể: lấy theo mockup, chỉnh cho vừa 1280–1440 và 375.
- Thứ tự làm: nền tảng (tách logic, token, chọn chủ đề, contracts) + khung sân khấu trước, rồi lần lượt
  các chủ đề; 4 chủ đề đồ vật sau cùng. Có thể nhiều PR, bật dần từng chủ đề vào danh sách chọn khi xong
  — miễn bản cuối có đủ 13.

## Kiểm thử

Theo quy ước dự án: không viết test tự động; lint, typecheck, build và xem trên trình duyệt (dev):
- Từng chủ đề × (máy tính 1440, điện thoại 375): trang phòng, máy phát, hộp vào phòng, PiP — đi hết
  danh sách chức năng ở "Điều không được để xảy ra" (bấm thử từng cái), không tràn ngang, đo tương phản
  các cặp màu chính đạt AA, so với mockup.
- Trạng thái biên ở mọi chủ đề: không có bài đang phát, hàng chờ trống, không có lời bài hát, không có
  lời chúc, tên bài rất dài, không có bỏ phiếu, thành viên thường (không thấy nút quản trị).
- Quản trị viên đổi chủ đề phòng → máy khác (đang "Theo phòng") đổi ngay; máy đã chọn riêng giữ chủ đề
  riêng; máy phát đổi theo phòng.
- Chọn riêng → tải lại trang / vào phòng khác vẫn giữ; "Theo phòng" quay về chủ đề phòng.
- Chỉ font của chủ đề đang dùng được tải (tab Network).
- `prefers-reduced-motion`: không còn chuyển động trang trí.
