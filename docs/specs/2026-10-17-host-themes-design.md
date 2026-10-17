# Màn hình máy phát theo chủ đề (`/r/[code]/host`)

Ngày: 2026-10-17 · Chỉ client · Contracts: không đổi · Migration: không
Mockup đã duyệt: `docs/specs/assets/2026-10-17-host-themes/host-themes-1.html` (ga tàu, cassette, tủ gỗ,
synthwave) và `host-themes-2.html` (mặc định, quán nghe nhạc, hi-fi 1982, áp phích, radio bán dẫn, chiêm
tinh, vũ trụ, Sài Gòn xưa, pixel). Mở bằng trình duyệt; mỗi bản là một khung 16:9 kèm một đoạn mô tả.

## Vì sao

Trang phòng đã có 13 chủ đề với bố cục riêng, nhưng màn hình máy phát (TV văn phòng, laptop nối loa)
vẫn dùng chung một bố cục, chủ đề chỉ đổi màu, font và chỉ báo thời gian. Người dùng muốn màn hình máy
phát cũng mang đúng "đồ vật" của chủ đề như trang phòng. Họ mở `/host` trên cả TV lẫn laptop. Nội dung
hiện có là đủ: chỉ sắp xếp lại và trang trí theo chủ đề.

## Mục tiêu

- 12 chủ đề (mọi chủ đề trừ `default`) có bố cục máy phát riêng **theo mockup đã duyệt**; người dùng
  "đồng ý hết" cả 13 bản vẽ.
- `default` giữ đúng màn hình máy phát hiện tại.
- Mọi chủ đề hiện **cùng một bộ nội dung** (xem "Nội dung"), không thêm, không bớt chức năng.
- Trên TV và laptop từ 1280×720 (kích thước vùng trang) trở lên, cả màn hình nằm gọn trong một khung,
  **không phải cuộn**, chữ đọc được từ xa.

## Không làm

- Không đổi bố cục trang phòng `/r/[code]`, hộp vào phòng, PiP. (Cách lưu chủ đề đổi theo yêu cầu bổ
  sung 2026-10-18, xem "Chủ đề trên máy".)
- Không đổi server, contracts, dữ liệu.
- Không thêm nút điều khiển mới trên máy phát (máy phát vẫn chỉ có âm lượng, ngôn ngữ và nút "Phát ở
  máy này" khi bị chuyển quyền phát). Nút ẩn / hiện lời bài hát trên máy phát được **bỏ** (người dùng
  chốt, xem "Lời bài hát").
- Không đổi màn hình chờ trước khi vào (`Đang mở máy phát…`, lỗi + "Thử lại").

## Điều không được để xảy ra

- **Nhạc ngắt hoặc video tải lại** khi quản trị viên đổi chủ đề phòng, khi chủ đề tải xong, hay khi cửa
  sổ đổi kích thước (vượt qua ngưỡng bố cục). Trình phát (`PlayerEngine`) phải giữ nguyên, không được
  dựng lại.
- **QR khó quét:** QR luôn là chấm đen trên nền trắng, có viền trắng (quiet zone), không bị trang trí
  đè lên, không xoay, không méo. Cạnh QR ≥ 180px ở khung 1280×720 và lớn dần theo màn hình.
- Chữ khó đọc từ xa, hoặc tương phản dưới chuẩn WCAG AA (chữ thường 4.5:1, chữ lớn 3:1).
- Phải cuộn trang trên màn hình ≥ 1280×720, hoặc nội dung tràn ra ngoài khung / bị cắt mất (trừ chat:
  chỉ hiện vài tin mới nhất, tin cũ bị đẩy ra là đúng).
- Trang trí che mất video. Khung trang trí (viền gỗ, lưới loa, cửa sổ tàu, viền neon…) nằm **bên ngoài**
  vùng 16:9 của video.
- Dùng emoji / ký tự unicode làm icon (quy ước của bộ chủ đề). Mockup còn dùng ♪ ● ✦ ▶ ♥ 🔊 và ký hiệu
  cung hoàng đạo: khi làm, thay bằng icon lucide hoặc hình vẽ CSS/SVG. Vòng 12 cung của `astro` vẽ bằng
  vạch như `Wheel` hiện có, không dùng ký tự ♈…♓.
- Có chuyển động khi `prefers-reduced-motion` (đĩa quay, cuộn băng, chữ lật, dòng tin chạy).
- Tải font / code của chủ đề khác chủ đề đang hiện.
- Một nội dung trong danh sách dưới đây thiếu ở một chủ đề nào đó.

## Chủ đề trên máy (yêu cầu bổ sung 2026-10-18)

- Lựa chọn riêng của mỗi máy được lưu **theo từng phòng** (`mr:theme:<MÃ PHÒNG>` trong localStorage),
  dùng chung cho trang phòng và máy phát của phòng đó trên cùng máy; chưa chọn thì theo chủ đề phòng.
  Lựa chọn cũ dùng chung mọi phòng (`mr:theme`) không còn được đọc.
- Máy phát có nút **Giao diện** (icon `Palette`) cạnh nút ngôn ngữ, mở cùng bảng chọn như trang phòng.
- Thẻ phủ vùng video ("Loa đang chờ bài", "Đang phát trên …", "Máy phát đang mở ở thiết bị khác") dùng
  chung một khung `PlayerCover`, chữ ngắn gọn, và mặc áo theo từng chủ đề.

## Nội dung (giống nhau ở mọi chủ đề)

| Khối | Hiện tại lấy từ | Ghi chú |
|---|---|---|
| Video | `PlayerEngine` (hoặc thẻ "Phát ở máy này" khi `playerRevoked`) | `IdleCover` lo trạng thái không có bài |
| Đèn trạng thái | `OnAirLamp`: ON AIR / Tạm dừng / Chờ bài | chữ giữ nguyên ở mọi chủ đề, chỉ đổi kiểu |
| Tên bài | `np.item.track.title`, khi không có bài: `t.host.idle` | tối đa 2 dòng |
| Nghệ sĩ | `track.artist ?? track.channel` | **mới** trên máy phát, kể cả `default` (mọi mockup đã duyệt đều có); ẩn khi không có |
| Người chọn | `t.nowPlaying.pickedBy(picker)` / `addedByLabel` | |
| Lời bài hát | `HostLyrics` | 2 dòng: dòng đang hát + dòng kế tiếp, **không còn nút ẩn / hiện** (xem dưới) |
| Lời chúc | `wishMessage` + người chọn | |
| Thời gian | `HostDial` của chủ đề | ẩn khi không có bài |
| Âm lượng + ngôn ngữ | thanh trượt + `LangSwitch compact` | nhỏ, nhưng phải có ở mọi chủ đề |
| Banner | `Banners` | |
| QR + mã phòng + link | `QRCodeSVG`, `code`, `joinUrl` | link chữ nhỏ có ở mọi chủ đề, kể cả bản vẽ không ghi |
| Người đang nghe cùng | `ListenersStrip` | ẩn khi không ai nghe cùng (như hiện nay) |
| 3 bài tiếp theo | `queue.slice(0, 3)`: tên, người chọn; ảnh bìa ở chủ đề mà bản vẽ có ảnh | trống: `t.host.nextEmpty` |
| Trò chuyện | tin mới nhất: tên người gửi + nội dung | `default` giữ 4 tin có giờ như nay; chủ đề khác 3 tin, giờ tuỳ chỗ. Trống: `t.chat.hostEmpty` |
| Lớp phủ | `HeartCanvas`, `SkipVote variant="host"` (+ `HostVoteMeter`), `Decor` | giữ nguyên cách hoạt động |

## Lời bài hát (người dùng chốt)

- **2 dòng** ở **mọi chủ đề** (người dùng đổi từ 4 dòng sang 2 dòng sau khi xem bản làm): dòng đang hát
  (lớn, đậm) và dòng kế tiếp, cộng dòng nguồn chữ nhỏ (`t.lyrics.source`). Chỉ hiện với bài có lời đồng
  bộ, như hiện nay.
- **Bỏ nút ẩn / hiện lời** trên máy phát (cả `default`): bài có lời đồng bộ thì luôn hiện. Lựa chọn cũ
  lưu ở `mr:host-lyrics` không còn tác dụng trên máy phát. Trang phòng giữ nút của nó.
- Bản vẽ chỉ có một dòng lời. Chỗ dư sau khi bỏ 2 dòng dùng để **phóng video lại gần bản vẽ** (45–54%
  chiều rộng khung). Mỗi bố cục chủ đề dành sẵn chỗ cố định cho khối 2 dòng; cỡ video **không đổi** theo
  việc bài có lời hay không (không nhảy bố cục), chỗ trống khi không có lời để trống.
- Lời chỉ chạy theo thời gian khi được canh cho đúng bản đang phát: nếu bản ghi mà lời được canh theo
  (độ dài trung vị của các bản LRCLIB cùng nhịp lời) lệch video quá 15 giây, server bỏ phần thời gian và
  chỉ giữ lời thường (ví dụ video chính thức dài hơn bản audio vì có đoạn mở đầu / kết thúc).
- Khối lời có thể đặt ở chỗ hợp với chủ đề (dưới tên bài, trong dải LCD của `hifi82`, trong ô loa của
  `transistor`…), miễn đọc rõ và đủ 2 dòng.

## Bố cục và cỡ

- **Khung 16:9 co giãn (chủ đề khác `default`, màn hình rộng):** toàn bộ màn hình máy phát vẽ trong một
  khung 16:9 lớn nhất vừa vùng trang, căn giữa; phần thừa (ví dụ laptop 16:10) là nền của chủ đề. Mọi
  cỡ chữ, khoảng cách, kích thước bên trong tính theo chiều rộng khung (như mockup dùng `cqw`), nên TV và
  laptop trông giống hệt nhau, chỉ to nhỏ khác nhau.
- **Màn hình hẹp hoặc thấp** (khung 16:9 tính ra rộng dưới khoảng 960px, ví dụ cửa sổ thu nhỏ, máy tính
  bảng dọc, điện thoại): các khối xếp thành **một cột cuộn được**, giữ màu, font và trang trí của chủ
  đề, giống cách `/host` co lại hiện nay. Không cần giống mockup ở cỡ này.
- **Cỡ tối thiểu ở khung rộng 1280px:** tên bài ≥ 28px; dòng lời đang hát ≥ 22px; mã phòng ≥ 32px;
  chữ phụ (người chọn, bài tiếp theo, chat, lời khác) ≥ 14px; QR ≥ 180px. Video rộng ít nhất khoảng 45%
  khung (nhỏ hơn bản vẽ để đủ chỗ cho lời bài hát).
- *Quyết định của người viết:* laptop mở trình duyệt không toàn màn hình (khung chỉ khoảng 1150px) được
  phép nhỏ hơn các mức trên tới khoảng 10% (người xem laptop ngồi gần). TV nên mở toàn màn hình.
- `default`: cũng dùng khung 16:9 (người dùng chốt 2026-10-18: bố cục cũ bị bóp hẹp trên màn lớn); giữ nền
  đổi màu theo bài, mặt số dò đài và thẻ QR nền giấy.

## Bố cục từng chủ đề

Mockup là nguồn chuẩn cho vị trí, màu, chữ và trang trí. Tóm tắt (chữ hiển thị theo chủ đề là lớp trang
trí; nhãn aria giữ tên chuẩn "Tiếp theo", "Trò chuyện", "Quét để chọn bài"):

Các mô tả dưới đây theo bản vẽ (một dòng lời). Khi làm, mỗi bố cục thêm khối lời 2 dòng như mục "Lời
bài hát" và thu nhỏ video cho vừa.

1. **`station` (ga tàu):**
   - Dải đầu: tên phòng và mã phòng bằng chữ lật (`FlipText`), đồng hồ (`Clock`).
   - Trái: video; đèn trạng thái kèm "Sân ga 1"; tên bài lớn; nghệ sĩ, người chọn, lời chúc trên một
     dòng; đường ray (`Track`) làm thời gian; lời bài hát.
   - Phải: QR in thành "Vé lên tàu" (mã + link); bảng "Giờ khởi hành" 3 dòng có giờ dự kiến (`etaTimes`);
     "Hành khách" là người nghe cùng.
   - Dải đáy: chat chạy thành dòng tin (`Ticker`), âm lượng và ngôn ngữ ở cuối dải. Khi giảm chuyển động:
     3 tin mới nhất đứng yên.
2. **`cassette`:**
   - Trái: video; vỏ băng gồm nhãn viết tay "Mặt A" (tên bài, nghệ sĩ, người chọn) và cửa sổ hai cuộn
     băng (`TapeWindow`, quay khi phát) kèm thời gian; lời bài hát viết tay.
   - Phải: QR là tấm sticker trắng, mã phòng in băng dán Dymo; bìa "Mặt B · Tiếp theo" 3 dòng đánh số;
     chat là giấy note màu (3 tin mới nhất); người nghe, âm lượng và ngôn ngữ.
   - Lời chúc là giấy note vàng dán chéo, không che video.
3. **`walnut` (tủ gỗ):**
   - Nền vân gỗ. Trái: video trong khung viền đồng; bàn đĩa gồm mâm quay, tên bài nghiêng, nghệ sĩ,
     người chọn, lời bài hát, kim VU (`Vu`) làm thời gian; lời chúc dưới bàn đĩa.
   - Phải: QR khắc trên bảng đồng ("Mời quét chọn bài", mã, link); "Chồng đĩa tiếp theo" với bìa đĩa
     (ảnh thật của bài); thẻ kem chứa người nghe, chat, âm lượng và ngôn ngữ.
4. **`synthwave`:**
   - Nền mặt trời sọc và lưới chân trời (`Decor` hiện có). Trái: video viền neon hồng; tên bài nghiêng
     ánh chrome; thanh thời gian neon (`LineDial neon`); lời bài hát, lời chúc.
   - Phải: ba khung neon xanh: QR; "Tiếp theo" đánh số; người nghe, chat, âm lượng và ngôn ngữ.
5. **`default`:** giữ nguyên.
6. **`listening` (quán nghe nhạc):**
   - Trái: video; ảnh bìa vuông có đĩa than hé ra bên phải, cạnh tên bài serif nghiêng; lời bài hát,
     lời chúc, mặt số (`LiveDial`).
   - Phải: QR trên lót ly tròn; "Tiếp theo" kiểu thực đơn quán (tên bài … người chọn, có dấu chấm dẫn);
     người nghe, chat, âm lượng và ngôn ngữ.
7. **`hifi82` (dàn máy 1982, nền sáng):**
   - Hàng trên: video | tên "MUSIC ROOM" + đèn cam trạng thái, khối QR, lời chúc.
   - Giữa, hết chiều ngang: màn LCD hổ phách (tên bài, nghệ sĩ, người chọn, giờ, vạch đo; lời bài hát).
     Thay `<Lcd large/>` hiện tại bằng dải này.
   - Hàng dưới: 3 phím vuông đánh số là 3 bài tiếp theo | người nghe, chat, âm lượng và ngôn ngữ.
8. **`midcentury` (áp phích):**
   - Mặt trời vàng lớn sau video ở góc trên trái, vòng cam phía trên phải video; không có hình nào nằm
     sau chữ.
   - Trái: video có bóng khối; tên bài chữ rộng in hoa; thước thời gian (`LineDial mc`); lời bài hát,
     lời chúc.
   - Phải: QR trên nền kem; "Tiếp theo" là 3 bìa tròn (ảnh thật); người nghe, chat, âm lượng và ngôn ngữ.
9. **`transistor` (radio bán dẫn):**
   - Cả màn là thân radio đỏ viền crôm. Trái: ô lưới loa chứa video, tên bài, nghệ sĩ, người chọn, lời
     bài hát.
   - Phải: huy hiệu crôm chứa QR; 3 phím nhớ đài là 3 bài tiếp theo; lời chúc; khung "Thư thính giả"
     chứa người nghe, chat, âm lượng và ngôn ngữ.
   - Đáy, hết chiều ngang: mặt kính dò đài (`Band`), kim đỏ là thời gian.
10. **`astro` (chiêm tinh):**
    - Nền sao (`Decor`). Trái: video viền vàng mảnh; tên bài serif nghiêng; lời bài hát; lời chúc.
    - Phải: vòng 12 cung (`Wheel`, cung vàng là thời gian) **bao quanh QR**, mã phòng và giờ ở giữa;
      "Các sao sắp mọc" là 3 bài tiếp theo; người nghe, chat, âm lượng và ngôn ngữ.
    - Trăng khuyết (`Moon`) vẫn là đồng hồ bỏ phiếu trong lớp phủ bỏ phiếu như hiện nay.
    - Vòng cung không được lấn vào viền trắng của QR.
11. **`cosmos` (vũ trụ):**
    - Nền tinh vân (`Decor`). Trái: video trong cửa sổ tàu (bo tròn, đinh tán); hành tinh với vệ tinh
      chạy quỹ đạo (`Planet`) làm thời gian, cạnh tên bài; lời bài hát, lời chúc.
    - Phải: QR; "Quỹ đạo tiếp theo" là 3 hành tinh nhỏ dần (ảnh thật của bài) kèm tên và người chọn;
      người nghe vẽ thành sao (`Stars`), chat, âm lượng và ngôn ngữ.
12. **`saigon` (Sài Gòn xưa, nền sáng):**
    - Viền gạch bông quanh khung (`Decor`). Dải đầu: biển hiệu tên phòng kèm đèn trạng thái và số người
      nghe.
    - Trái: video khung gỗ; tên bài; nghệ sĩ, người chọn, giờ; thanh thời gian (`LineDial tape`); lời bài
      hát.
    - Phải: QR trên giấy; bảng phấn khung gỗ "Tiếp theo" viết tay; lời chúc là thiệp viết tay; chat,
      âm lượng và ngôn ngữ.
13. **`pixel` (8-bit):**
    - Dải trạng thái trên đầu: thanh máu (`HealthBar`) làm thời gian, giờ, "x N người" (`Lives`), nhãn màn.
    - Trái: video viền pixel có bóng cứng; tên bài; nghệ sĩ, người chọn; lời bài hát.
    - Phải: hộp thoại "Người chơi 2? Quét để vào" chứa QR và mã; "Màn tiếp theo" (Màn 2, 3, 4);
      hộp thoại chứa lời chúc và chat (chữ thường dễ đọc, không dùng font pixel cho câu dài); người
      nghe, âm lượng và ngôn ngữ.
    - Thanh máu boss (`BossBar`) vẫn là đồng hồ bỏ phiếu như hiện nay.

*Quyết định của người viết:*
- Khi bản vẽ và bảng "Nội dung" khác nhau: bản vẽ quyết định hình thức (ví dụ bài tiếp theo chỉ có chữ,
  không ảnh, ở 9 chủ đề), bảng quyết định nội dung phải có. Vì vậy link phòng và người chọn của từng bài
  tiếp theo có ở mọi chủ đề (kể cả `pixel` "Màn 2/3/4" và các bản vẽ không ghi link).
- Chữ đèn trạng thái giữ chuẩn ("ON AIR" / "Tạm dừng" / "Chờ bài") ở mọi chủ đề. Mockup ghi "Đang chạy",
  "Đang phát"… chỉ để minh hoạ.
- `pixel` có thêm "x N người" (số người online, đã có ở trang phòng). Ngoài ra nội dung máy phát không
  đổi.
- Thay đổi này **thay quyết định cũ** trong `2026-10-17-themes-design.md` ("bố cục máy phát giữ như hiện
  nay", "khung video giữ nguyên", "Tiếp theo của máy phát chỉ tạo kiểu bằng CSS"). Người dùng đã duyệt
  mockup có khung video và bố cục riêng. Ràng buộc còn lại: khung không che video.

## Trạng thái biên (mọi chủ đề)

- **Không có bài:** video hiện `IdleCover`; tên bài là `t.host.idle`; ẩn nghệ sĩ, người chọn, thời gian,
  lời bài hát, lời chúc. Trang trí theo thời gian đứng yên (mâm đĩa, cuộn băng, kim).
- **Tạm dừng:** đèn "Tạm dừng", trang trí quay đứng yên.
- **Không có bài tiếp theo:** khối "Tiếp theo" của chủ đề vẫn hiện, với dòng `t.host.nextEmpty`.
- **Không có tin nhắn:** `t.chat.hostEmpty`; dòng tin của `station` hiện câu này đứng yên.
- **Tên bài / tên người / lời chúc rất dài:** cắt gọn (tên bài 2 dòng, còn lại 1–2 dòng), không tràn
  khung.
- **Bị chuyển quyền phát** (`playerRevoked`): thẻ "Phát ở máy này" nằm đúng chỗ video, cùng cỡ.
- **Đang bỏ phiếu bỏ qua / banner / thả tim:** lớp phủ như hiện nay, nằm trên bố cục chủ đề.
- **Chủ đề đang tải:** giữ chủ đề đang hiện (`useShownTheme` như hiện nay), không nháy.

## Kiến trúc (định hướng, chi tiết để builder)

- **Một khung DOM chung cho cả 13 chủ đề:** `HostScreen` luôn dựng cùng một bộ khe theo cùng thứ tự
  (đầu, video, dưới video, cột phải, đáy). Khe không dùng thì trả `null` nhưng vẫn giữ vị trí. Video
  (`PlayerEngine`) luôn ở cùng một chỗ trong cây, nên đổi chủ đề không dựng lại trình phát. Vị trí các
  khe trên màn hình do CSS grid của từng chủ đề quyết định (`grid-template-areas`). Ví dụ `hifi82` đặt
  dải LCD hết chiều ngang giữa hai hàng.
- **Chủ đề cung cấp nội dung khe** qua một mục mới trong `ThemeModule` (ví dụ `host`: các component cho
  từng khe, class khung video). Mục này thay `HostDial` (chỉ báo thời gian giờ nằm trong nội dung khe).
  `HostVoteMeter` và `Decor` giữ nguyên. `default` không có mục này và dùng bố cục hiện tại.
- **Phần dùng chung** (dữ liệu và logic, không theo chủ đề) tách vào `src/components/host/`: video hoặc
  thẻ chuyển quyền, đèn + tên bài + nghệ sĩ + người chọn, lời chúc, QR (luôn đen trên trắng), danh sách 3
  bài tiếp theo (dữ liệu), dòng chat gần nhất, âm lượng + ngôn ngữ. Chủ đề chỉ sắp xếp và tạo kiểu. Không
  chép logic theo chủ đề.
- **Dùng lại** các mảnh đã có của trang phòng: `FlipText`, `Clock`, `Track`, `etaTimes`, `Ticker`
  (`station`); `TapeWindow` (`cassette`); `Vu` (`walnut`); `Band` (`transistor`); `Wheel`, `Moon`
  (`astro`); `Planet`, `Stars` (`cosmos`); `HealthBar`, `BossBar`, `Lives` (`pixel`); `Lcd` (`hifi82`);
  `LineDial`, `LiveDial`.
- CSS máy phát của chủ đề nằm trong thư mục chủ đề đó (tải cùng chunk chủ đề), chỉ áp dưới gốc màn hình
  máy phát để không ảnh hưởng trang phòng.
- **Chữ mới** (vi + en) trong `themeText` ví dụ "Vé lên tàu", "Hành khách", "Mời quét chọn bài", "Các sao
  sắp mọc", "Người chơi 2? Quét để vào", "Màn 2…". Chữ đã có thì dùng lại ("Giờ khởi hành", "Mặt B · Tiếp
  theo", "Chồng đĩa tiếp theo", "Quỹ đạo tiếp theo", "Phím đài · Tiếp theo", "Thư thính giả", "Màn tiếp
  theo", "Sân ga 1").

## Để builder quyết

- Tên và hình dạng chính xác của mục `host` trong `ThemeModule`, và tên các component trong
  `src/components/host/`.
- Cách làm khung 16:9 co giãn (container query trên một hộp tính bằng `min(100vw, 100dvh*16/9)`, hay
  cách khác) và ngưỡng chính xác để chuyển sang một cột.
- Giá trị màu, cỡ, khoảng cách cụ thể: lấy theo mockup, chỉnh để đạt cỡ tối thiểu và AA.
- Thứ tự làm và chia PR: nền tảng (khung chung, phần dùng chung, `default` không đổi) trước, rồi lần lượt
  từng chủ đề. Có thể nhiều PR; chủ đề chưa làm vẫn dùng bố cục cũ cho tới khi xong.

## Kiểm thử

Theo quy ước dự án: không viết test tự động. Chạy `npm run lint`, `npm run typecheck`, build, rồi xem trên
dev:
- **Từng chủ đề, ở 1920×1080, 1280×720, 1440×900 (16:10) và 1366×768:** đủ mọi khối trong bảng "Nội dung",
  không cuộn, không tràn, so với mockup. Thử với bài có lời đồng bộ (đủ 2 dòng hiện, không đè khối khác)
  và bài không có lời (video không đổi cỡ). Ở 900px rộng và 390px (điện thoại): một cột cuộn được, không tràn
  ngang.
- **Trạng thái biên** ở mọi chủ đề: không có bài, tạm dừng, hàng chờ trống, không có tin nhắn, không lời
  bài hát, không lời chúc, tên bài rất dài, đang bỏ phiếu, có banner, bị chuyển quyền phát.
- **Đổi chủ đề phòng khi đang phát:** nhạc không ngắt, video không tải lại (thời điểm phát tiếp tục, không
  về 0:00, không hiện lại `IdleCover`). Thử cả đổi từ `default` sang chủ đề khác và ngược lại.
- **Đổi kích thước cửa sổ** qua ngưỡng một cột ↔ khung 16:9 khi đang phát: nhạc không ngắt.
- **QR:** quét bằng điện thoại ở từng chủ đề (người dùng kiểm trên TV thật); đo cạnh QR ≥ 180px ở 1280×720.
- **Tương phản AA** cho các cặp chữ chính của từng bố cục mới.
- **`prefers-reduced-motion`:** không còn chuyển động trang trí; dòng tin ga tàu thành danh sách tĩnh.
- **Tab Network:** chỉ chunk và font của chủ đề đang hiện được tải.
