# Giọng đọc mới: lời MC và lời chúc bằng Edge TTS

Ngày: 2026-10-17 · Server + client · Contracts: **có đổi** · Migration DB: tuỳ người làm (xem mục 4)

## Vì sao

Lời MC giới thiệu bài và lời chúc đọc trên loa máy phát hiện nghe **không giống người thật**: trình duyệt
đọc bằng giọng `vi-VN` có sẵn của máy (`speechSynthesis`), các "kiểu giọng" (MC đài, Em bé, Sóc chuột…)
chỉ là chỉnh cao độ/tốc độ của cùng giọng máy đó, và mỗi máy phát cài giọng khác nhau nên đọc khác nhau.
Văn phòng có cả người Việt và người nước ngoài, lời chúc có thể bằng tiếng Việt hoặc tiếng Anh.

Người dùng đã nghe mẫu (giọng máy, Edge/Azure, Gemini TTS) và **chọn Edge TTS**: miễn phí là ưu tiên số một.

## Mục tiêu

- Lời MC và lời chúc đọc bằng **giọng neural tự nhiên của Edge** (cùng họ giọng Azure: HoaiMy, NamMinh…).
- Đọc **đúng ngôn ngữ của câu**: câu tiếng Việt giọng Việt, câu tiếng Anh giọng Anh, tự nhận ra.
- Người gửi lời chúc **bắt buộc tự chọn giọng Nam hoặc Nữ**: **không chọn sẵn**, chưa chọn thì chưa gửi được.
- Mọi máy phát và người nghe cùng nghe **cùng một giọng**, không phụ thuộc máy cài gì.
- **Miễn phí**: không thêm dịch vụ trả phí, không cần thẻ thanh toán.

## Không làm

- **Bỏ hẳn các kiểu giọng vui** (MC đài, Kịch tính, Em bé, Hoảng hốt, Sóc chuột, Buồn ngủ): không giả lập
  bằng cao độ/tốc độ, chỉ dùng giọng Edge nguyên bản.
- Không đọc chat, không thêm lời chúc từ Slack (hiện Slack không có lời chúc).
- Không dùng dịch vụ trả phí (Azure có key, Google Cloud, Gemini TTS…).
- Không đổi cách viết câu MC (prompt AI3 giữ nguyên) và không đổi kiểm duyệt lời chúc (AI4).
- Không đổi thời điểm đọc: bài vẫn bắt đầu ngay, giọng đọc phát đè lên video đang được hạ nhỏ (như hiện nay).

## Điều không được để xảy ra

- **Loa im lặng** vì Edge TTS lỗi/bị chặn: phải lùi về đọc bằng giọng trình duyệt như hiện nay.
- Bài hát **bị chờ** hoặc **chậm bắt đầu** vì đang tạo âm thanh.
- Client cũ (chưa tải lại, còn gửi `voicePreset`) bị lỗi `VALIDATION` khi thêm bài / sửa lời chúc,
  dù server hay web lên trước.
- Lời chúc tiếng Việt bị đọc bằng giọng Anh (hoặc ngược lại) khi câu có dấu rõ ràng.
- File âm thanh lớn đi qua socket (giới hạn `MAX_PACKET_BYTES`): âm thanh đi qua HTTP.

## Hiện trạng (để người làm nắm)

- Lời chúc: `QueueItem.wishMessage` + `voicePreset` (Prisma), đặt qua `queue:add` / `queue:set-message`
  sau kiểm duyệt AI4. Tới máy phát qua `PlayerCommand.wish`; người nghe cùng (ListenAlong) đọc từ
  `QueueItemView.wishMessage/voicePreset` trong snapshot.
- Lời MC (AI3, cài đặt `mcIntro`): `McService` viết sẵn sau khi bài được thêm (debounce 10 s, gom 6 bài),
  giữ trong bộ nhớ (`Map`, tối đa 1000). Chỉ gửi cho máy phát qua `PlayerCommand.intro`, khi bài không có lời
  chúc. Chưa viết xong lúc bài bắt đầu thì không đọc.
- Client: `speak()` trong `PlayerEngine.tsx` (máy phát) và `ListenAlong.tsx` (người nghe): video phát ngay,
  hạ âm lượng còn 20 trong lúc đọc, trả lại khi đọc xong hoặc sau thời gian dự phòng; bỏ qua khi vào giữa bài
  (≥ 3 s) hoặc phòng đang dừng.

## Thiết kế

### 1. Tạo âm thanh trên máy chủ

- Máy chủ gọi Edge TTS (dịch vụ "Đọc to" của trình duyệt Edge, cổng WebSocket không chính thức) để tạo
  **mp3** cho từng câu. Trình duyệt không gọi thẳng được cổng này nên phải làm ở máy chủ.
- Toàn bộ phần gọi Edge nằm **gọn trong một lớp riêng** (ví dụ `TtsProvider`), để khi cổng bị chặn có thể
  thay bằng Azure gói miễn phí (cùng họ giọng) mà không đụng phần còn lại.
- Dùng thư viện npm có sẵn hay tự viết giao thức (kể cả tham số `Sec-MS-GEC`) là **việc của người làm**;
  ghim phiên bản, có timeout, không để lỗi Edge làm hỏng lệnh của phòng.

### 2. Giọng

| Ngôn ngữ | Nam | Nữ |
|---|---|---|
| Tiếng Việt | `vi-VN-NamMinhNeural` | `vi-VN-HoaiMyNeural` |
| Tiếng Anh | `en-US-AndrewNeural` *(quyết định của người viết)* | `en-US-AvaNeural` *(quyết định của người viết)* |

- **Lời MC** luôn dùng giọng **Nam** *(quyết định của người viết: lời MC không có người gửi để chọn)*.
- Lời chúc dùng giọng người gửi chọn. Chỉ để tương thích: lời chúc cũ (có `voicePreset` kiểu cũ hoặc trống) và
  lệnh từ client cũ không có trường giọng → đọc giọng Nam.
- Chỉ hai ngôn ngữ Việt/Anh. Câu ngôn ngữ khác → đọc bằng giọng Anh *(quyết định của người viết)*.

### 3. Nhận ra ngôn ngữ (miễn phí)

1. Câu có chữ cái tiếng Việt có dấu (ă, â, đ, ê, ô, ơ, ư hoặc dấu thanh) → **tiếng Việt**.
2. Không có dấu → hỏi AI miễn phí dự án đang dùng (`AiService`, Groq/Gemini) một câu ngắn
   "vi hay en"; kết quả nhớ theo nội dung câu.
3. AI không trả lời kịp → **tiếng Việt** (người dùng đã chọn).

Lời MC do AI3 viết bằng tiếng Việt có dấu nên luôn rơi vào bước 1.

### 4. Lưu lựa chọn Nam/Nữ

- Contracts: thêm `VOICES = ['male', 'female']`; `queue:add` và `queue:set-message` nhận `voice?: 'male' | 'female'`.
  **Vẫn nhận `voicePreset` cũ** (bỏ qua giá trị) để client cũ không lỗi; gỡ hẳn ở một đợt sau.
- Lưu ở cột mới hay dùng lại cột `voicePreset` là **việc của người làm**; giá trị cũ / trống đọc là `male`.
- `QueueItemView` có trường giọng mới (tuỳ chọn) thay cho `voicePreset`; bỏ dần `voicePreset` khỏi view.

### 5. Khi nào tạo âm thanh, giữ ở đâu, gửi thế nào

- **Tạo sẵn**: ngay sau khi lời chúc được lưu (sau kiểm duyệt) và ngay sau khi `McService` viết xong lời MC.
  Không chặn lệnh của người dùng: tạo ở nền, lỗi thì ghi log.
- **Giữ**: bộ nhớ đệm theo khoá `(câu, giọng)` (băm), giới hạn dung lượng/số mục, bỏ cái cũ nhất trước;
  có thể ghi thêm vào `DATA_DIR` — tuỳ người làm. Mất khi khởi động lại thì tạo lại khi cần.
- **Phục vụ**: một đường HTTP mới trả mp3, ví dụ `GET /api/tts/:key.mp3`, chỉ trả câu máy chủ đã tạo
  (không nhận văn bản tuỳ ý từ URL, để không ai dùng máy chủ làm dịch vụ đọc miễn phí). Đặt header để thẻ
  `<audio>` ở domain web tải được (Helmet đang mặc định `Cross-Origin-Resource-Policy: same-origin`);
  cho cache lâu vì nội dung theo khoá không đổi.
- **Gửi đường dẫn**: `PlayerCommand.wish` / `PlayerCommand.intro` mang thêm đường dẫn âm thanh (tuỳ chọn);
  `QueueItemView` mang đường dẫn âm thanh của lời chúc cho người nghe cùng.
- **Chưa có âm thanh lúc bài bắt đầu**: gửi lệnh như thường **không có** đường dẫn (không chờ). Có thể thử
  tạo ngay với timeout ngắn rồi gửi bổ sung — tuỳ người làm, miễn bài không bị chờ.

### 6. Máy phát và người nghe cùng (client)

- Có đường dẫn → phát bằng `<audio>`; giữ cách hạ âm lượng video (20) trong lúc đọc và trả lại khi xong.
- Không có đường dẫn, tải lỗi hoặc `play()` bị chặn → **đọc bằng giọng trình duyệt như hiện nay**
  (giọng sẵn có của trình duyệt, không còn cao độ/tốc độ theo kiểu giọng; có dấu tiếng Việt → `vi-VN`, không dấu →
  cũng `vi-VN` theo mục 3 bước 3; máy chủ có gửi kèm ngôn ngữ đã nhận ra hay không là tuỳ người làm).
- Giữ nguyên quy tắc bỏ qua khi vào giữa bài (≥ 3 s) hoặc phòng đang dừng.
- Âm lượng giọng đọc theo thanh âm lượng của máy (như video).

### 7. Giao diện

- Hộp "Gửi lời chúc" (`WishSheet`): bỏ danh sách 6 kiểu giọng, thay bằng chọn **Nam / Nữ**, **không chọn sẵn**;
  nút lưu bị khoá (kèm gợi ý "Chọn giọng đọc") cho tới khi có lời chúc **và** đã chọn giọng. Sửa một lời chúc đã
  có giọng thì hiện sẵn giọng đã chọn. Chữ theo `vi.ts` / `en.ts` (khoá mới; xoá `wish.voices`).
- Xoá lời chúc không cần chọn giọng.
- Không thêm cài đặt phòng mới; công tắc "MC giới thiệu bài" giữ nguyên.

### 8. Quyền riêng tư

- Nội dung lời chúc và **nguyên câu MC, kể cả tên hiển thị của người chọn bài** (người dùng đã chọn: gửi cả câu
  có tên để đọc tự nhiên) được gửi tới Microsoft (Edge) để tạo giọng. Chỉ gửi câu chữ, không gửi email, mã tài khoản.
- Trang Quyền riêng tư, **cả bản tiếng Việt, bản tiếng Anh và đoạn English summary**:
  - thêm **Microsoft (Edge Read Aloud)** vào mục "Dịch vụ bên ngoài nhận một phần dữ liệu": lời chúc và lời MC,
    có thể gồm tên hiển thị trong phòng, để đọc thành giọng nói;
  - sửa câu hứa "không gửi tên của bất kỳ ai" cho đúng: tên vẫn **không** gửi cho các nhà cung cấp AI viết câu
    (Gemini, Groq, OpenRouter), nhưng có thể được gửi tới dịch vụ đọc giọng của Microsoft.

## Tương thích và thứ tự lên bản

- Trường mới đều tuỳ chọn; server mới vẫn nhận `voicePreset` cũ; client mới gặp server cũ (không có đường dẫn
  âm thanh) thì đọc bằng giọng trình duyệt.
- Lệnh của server cũ là `strictObject`: client mới **chỉ gửi `voice` khi chọn Nữ** (server coi thiếu là Nam, chỉ
  để tương thích) *(quyết định của người viết)*, nên lời chúc giọng Nam không lỗi dù web lên trước; vẫn
  **lên server trước**.
- Máy phát chỉ đọc khi `queueItemId` đổi: nếu người làm chọn gửi bổ sung đường dẫn âm thanh sau khi bài đã bắt
  đầu thì client phải xử lý trường hợp này (hoặc không gửi bổ sung).
- Đổi contracts → tăng `CONTRACTS_VERSION` (kiểm tra `origin/develop` trước khi tăng).

## Kiểm tra (không test tự động)

- `lint` / `typecheck` / `build` cả hai repo.
- Dev: lời chúc tiếng Việt Nam/Nữ, lời chúc tiếng Anh Nam/Nữ, lời chúc không dấu, lời MC; người nghe cùng
  nghe lời chúc; chặn mạng tới Edge (hoặc ép provider lỗi) → vẫn đọc bằng giọng trình duyệt, bài không chờ;
  client cũ gửi `voicePreset` → không lỗi; trang Quyền riêng tư có dòng Microsoft ở hai ngôn ngữ.

## Để người làm quyết định

- Thư viện / tự viết giao thức Edge, định dạng mp3 cụ thể (bitrate), cách băm khoá.
- Cột DB mới hay dùng lại `voicePreset`; dung lượng bộ nhớ đệm; có ghi đĩa hay không.
- Có tạo bù khi âm thanh chưa sẵn lúc bài bắt đầu hay không (miễn không làm bài chờ).
- Tên đường HTTP, tên trường trong contracts.
