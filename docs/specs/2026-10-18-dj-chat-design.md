# Trợ lý `@DJ` trong chat phòng và Slack

Ngày: 2026-10-18 · Server + client · Contracts: đổi (`ChatMessageView`, bỏ `dj:ask`) · Migration: `chat_message_kind`
Mockup (đã duyệt): `music-room-client/.superpowers/brainstorm/dj-chat/` (không nằm trong repo)

## Vì sao

Nhóm làm việc từ xa, ngồi chung một huddle Slack và mở chung một phòng Music Room. Mọi người muốn
nói chuyện bình thường với phòng nhạc ("skip giúp tôi bài này", "bật dùm bài mới trending của Jack",
"còn bao nhiêu bài nữa tới bài của tôi") thay vì nhớ nút hay lệnh. Tab "Hỏi DJ" hiện có chỉ gợi ý bài,
giới hạn 3 lượt/giờ, và tách khỏi chỗ mọi người đang nói chuyện.

## Mục tiêu

- Gọi trợ lý bằng `@DJ` trong ô chat của phòng, và bằng `@Music Room` (bot Slack sẵn có) trong kênh
  Slack đã nối với phòng. Một "bộ não" dùng chung cho hai nơi.
- DJ **chỉ tự làm những việc mơ hồ** — cần AI hiểu ý để tìm bài ("bài mới trending của Jack",
  "vài bài chill buổi chiều", "bài gì giống bài đang phát") — rồi thêm bài vào hàng chờ **theo đúng
  quyền và giới hạn của người hỏi**.
- Việc **người dùng tự làm được** (skip, lưu bài, thả tim, thêm bài theo tên rõ ràng, chặn bài…):
  DJ không làm thay mà **chỉ cách**. Trong phòng: nút "Chỉ cho tôi" phủ lớp mờ lên trang và chiếu sáng
  đúng nút cần bấm, kèm một dòng hướng dẫn. Trong Slack: trả lời ngắn, gợi ý lệnh cụ thể và `/music help`.
- Câu hỏi **thông tin** (bài đang phát, ai chọn, còn bao nhiêu bài / bao lâu tới bài của tôi, hàng chờ
  dài bao nhiêu): DJ trả lời luôn bằng một câu; nếu có chỗ để chỉ thì kèm "Chỉ cho tôi".
- **Giữ AI miễn phí** (chuỗi Gemini → Groq → OpenRouter sẵn có) và **ít tốn lượt**: câu hiểu được bằng
  luật thì không gọi AI; chỉ câu mơ hồ mới gọi, mỗi yêu cầu tối đa một lần gọi AI.
- Khi xong, **bỏ tab "Hỏi DJ"** và lệnh `dj:ask`; gợi ý bài hỏi thẳng `@DJ`.

## Không làm

- Không nhớ ngữ cảnh hội thoại: mỗi `@DJ` là một yêu cầu độc lập (người dùng chọn). Câu nối tiếp như
  "bài khác đi" được xử lý bằng nút "Gỡ bài này" trên câu trả lời, không bằng trí nhớ.
- Không làm thay các việc người dùng tự bấm được (kể cả skip — quản trị viên cũng chỉ được chỉ nút
  "Chuyển bài").
- Không đổi cài đặt phòng, quyền, mời ra, chặn bài, xoá phòng qua DJ.
- Không đưa nhạc vào huddle Slack (Slack không cho bot vào huddle — đã tra, ngoài phạm vi).
- Không dùng AI trả phí, không tool-calling; AI chỉ trả JSON có cấu trúc.
- Không lời chúc kèm bài qua DJ ở bản này.

## Điều không được để xảy ra

- DJ làm được việc mà người hỏi không có quyền làm (thêm quá giới hạn hàng chờ, thêm bài bị chặn…).
  Mọi hành động đi qua đúng service của web với actor là người hỏi.
- Chữ do AI viết hiện thẳng cho cả phòng. Câu trả lời của DJ dựng từ **mẫu câu có sẵn** (i18n) + dữ
  liệu có cấu trúc (tên bài, số bài, phút); AI chỉ trả về ý định và tên nghệ sĩ / bài.
- Một yêu cầu `@DJ` tốn nhiều hơn một lần gọi AI, hoặc câu đơn giản cũng gọi AI.
- Hết hạn mức AI miễn phí làm DJ im lặng hoặc báo lỗi khó hiểu. Phải luôn có câu trả lời.
- Lớp chỉ dẫn che mất nút cần bấm, hoặc kẹt trên màn hình không tắt được.
- Tin nhắn của người khác có chữ "dj" bình thường (không có `@DJ`) bị DJ trả lời.

## Gọi DJ

**Trong phòng.** Tin nhắn chat chứa `@DJ` (không phân biệt hoa thường, là một từ riêng) vẫn được lưu
và hiện như tin nhắn thường, sau đó DJ trả lời bằng một tin nhắn mới trong cùng khung chat, **công khai
cho cả phòng** (để người khác cũng học được cách dùng — quyết định của tôi). Phần yêu cầu = tin nhắn bỏ
chữ `@DJ`. Tin nhắn chỉ có `@DJ` → DJ trả lời câu chào kèm vài ví dụ.

- Ô nhập: gõ `@` ở đầu từ → hiện gợi ý "DJ – trợ lý của phòng" kèm 3 câu mẫu; chọn thì chèn `@DJ `.
  Chữ `@DJ` trong tin nhắn hiển thị nổi bật (mockup 4).
- Tin nhắn của DJ: tên "DJ" kèm biểu tượng đĩa (lucide `Disc3`), bong bóng viền vàng (mockup 1–3).
  Màn /host cũng hiện tin nhắn DJ như một dòng chat thường.
- Thành viên là thiết bị (`isDevice`) không chat nên không gọi được DJ (giữ luật chat hiện tại).

**Trong Slack.** `@Music Room <câu>` và `/music <câu>`. Người hỏi được ánh xạ sang thành viên như các
lệnh Slack hiện có (`ChatRoomService.member`). Kênh chưa nối phòng → câu `notLinked` như cũ.

Chỉ coi là **lệnh cứng** khi gõ đúng dạng lệnh (người dùng chọn, 2026-10-18); câu nói tự nhiên đi tới DJ:

| Gõ | Xử lý |
|---|---|
| `skip`, `now`, `queue`, `help`, `here` đứng một mình (cho phép dấu câu cuối) | lệnh cứng như hiện tại |
| (trống) | `now` như hiện tại |
| `add <link YouTube>` | lệnh cứng |
| `add <tên bài>` ngắn gọn (tối đa 8 từ, không có từ mơ hồ / từ "mới, trending, hot…") | lệnh cứng (tìm, cho chọn 3 bài) |
| `connect …`, `disconnect …` | như hiện tại (chỉ bằng `/music`) |
| mọi câu khác, kể cả bắt đầu bằng từ lệnh (`skip giúp tôi bài này`, `add bài mới trending của Jack`) | bộ não DJ |

Đổi hành vi: trước đây `@Music Room skip giúp tôi` bỏ phiếu ngay; nay DJ trả lời chỉ cách
(`/music skip`). `/music help` ghi rõ dạng lệnh ngắn và cách hỏi DJ.

## Bộ não DJ (server, dùng chung)

Đầu vào: phòng, người hỏi (actor + vai trò), câu yêu cầu, nơi hỏi (`room` | `slack`), ngôn ngữ.
Đầu ra: một **câu trả lời có cấu trúc** (`DjReply`), không phải chữ tự do.

Hai bước, theo thứ tự:

1. **Luật (không gọi AI).** Chuẩn hoá câu (bỏ dấu, chữ thường) rồi so khớp từ khoá tiếng Việt và
   tiếng Anh cho các ý định rõ ràng:
   - *Chỉ cách* (`guide`): skip / bỏ qua / qua bài / next; lưu / save; thả tim / like; tạm dừng / pause
     và chuyển bài ngay (chỉ hiện với người có quyền điều khiển); lời bài hát; nghe cùng; chia sẻ / mời
     / QR; thu nhỏ; chặn bài (chỉ quản trị viên); **thêm bài theo tên rõ ràng** ("bật/thêm bài <tên>"
     không có từ mơ hồ) → chỉ ô tìm bài, điền sẵn `<tên>`.
   - *Thông tin* (`info`): bài đang phát; ai chọn bài này; còn bao nhiêu bài / bao lâu tới bài của tôi;
     hàng chờ còn mấy bài / bao lâu; tôi đã thêm mấy bài.
   - Lời chào / cảm ơn / "giúp gì được" → câu chào kèm ví dụ.
   - *Bài mới của một nghệ sĩ* có mẫu rõ ("bài mới / mới nhất / trending / hot / vừa ra của <tên>",
     "<tên> có bài gì mới") → ý định `add` dạng **mới** với nghệ sĩ lấy từ câu, không cần AI.
2. **AI (một lần gọi, chỉ khi luật không khớp).** Gửi câu yêu cầu + bài đang phát (nghệ sĩ – bài) +
   tối đa 40 bài phòng đã nghe (như Hỏi DJ hiện tại). AI trả JSON:
   `{ "intent": "add" | "guide" | "info" | "other", "guide"?: <mã chỉ dẫn>, "info"?: <mã thông tin>,
   "fresh"?: { "artist": string, "mode": "latest" | "popular" },
   "items"?: [{ "artist", "song" }] (tối đa 5) }`. `fresh` khi người hỏi muốn bài **mới / đang hot**
   của một nghệ sĩ — AI không được tự đoán tên bài trong trường hợp này. `guide` / `info` từ AI chỉ được
   chọn trong danh sách mã cố định; mã lạ → coi như `other`.

Xử lý ý định:

- `add` dạng **mới** (`fresh`, người dùng chọn tra thật, 2026-10-18): AI miễn phí không có dữ liệu
  thời gian thực nên không dùng tên bài do AI đoán. Tra YouTube **thật** bằng InnerTube (không tốn quota
  Data API) theo tên nghệ sĩ (youtubei.js 18 hỗ trợ bộ lọc `upload_date`, `prioritize`, `duration`):
  `latest` → `upload_date: 'month'` (không có thì `'year'`), lấy video đầu tiên đạt điều kiện;
  `popular` (trending / hot) → `upload_date: 'year'` + `prioritize: 'popularity'`. Chỉ nhận video giống bài hát: nhúng được,
  1–10 phút, tiêu đề hoặc kênh khớp tên nghệ sĩ, ưu tiên kênh chính thức / "Official"; bỏ video kiểu
  reaction, live dài, tổng hợp. Thêm bài đầu tiên đạt điều kiện. InnerTube lỗi → dùng
  `SearchService.search` thường với "<nghệ sĩ> mới nhất" và nói rõ "bài của <nghệ sĩ> mình tìm được"
  thay vì "mới nhất". Câu trả lời chỉ nói "mới nhất / đang hot" khi đã tra thật thành công.
- `add` thường: lấy `items` theo thứ tự, mỗi bài: tìm trong thư viện phòng (`findKnown` của Hỏi DJ), không
  có thì `SearchService.search` (InnerTube trước, không tốn quota Data API) lấy kết quả đầu nhúng được.
  Thêm **bài đầu tiên** thêm được bằng `QueueService.add(actor của người hỏi)`; bài lỗi (đã có trong
  hàng chờ, bị chặn, quá dài, vừa phát) thì thử bài kế. Trả lời: đã thêm bài X, đứng thứ N, khoảng M
  phút nữa, kèm thẻ bài và nút **"Gỡ bài này"** (gọi `queue:remove` có sẵn — chỉ người hỏi thấy nút).
  Người hỏi hết lượt thêm (`QUEUE_LIMIT`…) → nói rõ lý do bằng câu lỗi sẵn có. Không tìm được bài nào
  → xin lỗi ngắn, gợi ý ô tìm bài.
- `guide`: trả mã chỉ dẫn (xem dưới) + câu ngắn theo **vai trò** người hỏi (ví dụ skip: thành viên →
  "nút Bỏ qua mở bỏ phiếu"; quản trị viên / có quyền điều khiển → "nút Chuyển bài qua ngay").
  Việc người hỏi không có quyền (chặn bài khi không phải quản trị viên) → nói không có quyền và vì sao.
- `info`: server tính từ snapshot (thứ tự `orderQueue`, `durationSec`, phần còn lại của bài đang phát)
  rồi trả số liệu; client ghép thành câu theo ngôn ngữ người xem.
- `other`: câu "mình chưa giúp được việc này" + vài ví dụ.

**AI không trả lời được** (mọi nhà cung cấp đang nghỉ / hết hạn mức / quá giờ): câu "Mình đang hơi
quá tải, bạn thử lại sau ít phút" + gợi ý ô tìm bài. Các ý định theo luật vẫn chạy bình thường.

**Giới hạn lượt.** Chỉ yêu cầu phải gọi AI mới tính lượt: mặc định 10 lượt / giờ / thành viên (biến
môi trường `DJ_AI_PER_HOUR`, quyết định của tôi — thay cho 3 lượt/giờ của Hỏi DJ). Câu theo luật chỉ
chịu giới hạn chat thường (5 tin / 10 giây). Hết lượt → câu báo thời gian chờ (`RATE_LIMITED`).

**Riêng tư.** Câu yêu cầu của người dùng giờ được gửi cho AI miễn phí (trước đây chỉ gửi tên bài).
Báo bằng một dòng, không chặn yêu cầu đầu tiên và không lưu trạng thái "đã đọc" (quyết định của tôi):
trong phòng nằm ở ô gợi ý khi gõ `@` (ai cũng thấy trước khi gửi) và câu chào của DJ; trong Slack nằm
trong `/music help`.

## Câu trả lời và hiển thị

`DjReply` (contracts, mới): `{ kind: 'guide' | 'info' | 'added' | 'hello' | 'other' | 'busy' |
'denied' | 'error', guide?: GuideTarget, info?: {...số liệu}, track?: TrackSummary, queueItemId?,
position?, etaSec?, forMemberId, errorCode? }`. Client ghép câu từ mẫu i18n theo **ngôn ngữ người
xem** (vi / en). Tin nhắn DJ lưu cả `content` dạng chữ (tiếng Việt, cho lịch sử, /host và Slack) lẫn
`dj` có cấu trúc.

Mã chỉ dẫn (`GuideTarget`) bản đầu: `skip` (bỏ phiếu hoặc chuyển bài ngay tuỳ vai trò), `save`,
`heart`, `pause`, `lyrics`, `listen`, `share`, `mini`, `add` (kèm `query` để điền sẵn), `myItem`
(kèm `queueItemId`), `block`.

## Lớp chỉ dẫn (client)

- Nút "Chỉ cho tôi" trên tin nhắn DJ (ai trong phòng cũng bấm được — chỉ dẫn hiện trên máy người bấm).
- Bấm → (điện thoại: thu cửa sổ chat; chuyển tab phòng / thêm bài nếu cần; với `add` thì điền sẵn và
  focus ô tìm bài) → cuộn tới nút → phủ lớp mờ toàn trang, chiếu sáng nút (viền vàng, bo theo nút), khung
  hướng dẫn gồm tiêu đề có biểu tượng `Pointer`, một câu, nút "Đã hiểu" (mockup 1b, 3b, 5).
- Tắt khi: bấm "Đã hiểu", bấm ra ngoài, nhấn Esc, hoặc bấm đúng nút được chiếu sáng (nút vẫn hoạt động
  bình thường qua lớp phủ). Khung hướng dẫn tự đặt trên/dưới nút để không ra ngoài màn hình; đổi cỡ
  cửa sổ thì đặt lại.
- Nút đích tìm bằng thuộc tính `data-guide="<mã>"` (thêm vào nút ở thẻ mặc định, 12 chủ đề, thanh nhạc
  nhỏ, hàng chờ: `data-guide-item="<queueItemId>"`). Có nhiều nút cùng mã → lấy nút **đang hiện** đầu
  tiên. Không tìm thấy nút (bài đã đổi, chủ đề không có nút đó, ví dụ `pause` khi không có quyền) →
  chỉ hiện câu hướng dẫn, không phủ lớp.
- Tương phản đạt WCAG AA trên cả chủ đề sáng (hifi82, Sài Gòn) và tối; biểu tượng chỉ dùng lucide;
  tôn trọng `prefers-reduced-motion` (không hiệu ứng trượt).

## Slack

- Ý định `guide` → trả lời **riêng** (ephemeral): một câu + lệnh tương ứng nếu có (`/music skip`,
  `/music add <tên>`, `/music queue`) + "Gõ `/music help` để xem mọi lệnh". Việc chỉ làm được trên web
  (lưu, thả tim, chặn, lời bài hát…) → gợi ý mở phòng (nút `open_room` sẵn có).
- `info` → trả lời riêng bằng một câu.
- `add` → **công khai** trong thread (như các lệnh hiện có): "Đã thêm X cho @người hỏi, đứng thứ N".
  Gọi AI có thể lâu: trả lời ngay "Đang tìm bài…" rồi gửi kết quả qua `later` (cơ chế `SlackAnswer`
  hiện có). Không có nút gỡ ở Slack bản này.
- `busy` / `other` / `denied` → trả lời riêng.

## Bỏ "Hỏi DJ"

Bỏ tab `dj` khỏi `AddTrackPanel`, `DjAsk.tsx`, lệnh `dj:ask` (schema, kết quả, gateway, `DJ_LIMIT`).
Logic chọn bài của `DjService` (prompt, `findKnown`, bỏ bài đã có / bị chặn / quá dài) được tái dùng
cho ý định `add`. Chuỗi i18n chỉ Hỏi DJ dùng thì xoá. `snapshot.aiEnabled` giữ (ô gợi ý `@` và câu chào
dựa vào nó: AI tắt → DJ vẫn chạy phần luật, câu chào nói rõ chỉ làm được việc đơn giản).

## Trạng thái biên

- Phòng trống, chưa có bài đang phát: info "bài đang phát" → "Phòng chưa phát bài nào"; `skip` → câu
  ngắn, không phủ lớp.
- Người hỏi chưa có bài trong hàng chờ: "Bạn chưa có bài nào đang chờ" + chỉ ô tìm bài.
- Người hỏi rời phòng hoặc bị mời ra trong lúc DJ đang tìm: bỏ kết quả, không thêm bài.
- Hai yêu cầu `@DJ` liền nhau của cùng người: xử lý tuần tự theo người (không thêm trùng bài).
- Tin nhắn `@DJ` bị chặn bởi lọc từ (`maskBlocked`): vẫn lưu dạng đã che như hiện tại; DJ xử lý phần
  chữ sau khi che.
- Lịch sử chat chỉ giữ 200 tin (`KEEP_CHAT`): tin DJ tính chung.
- Mạng chậm: tin nhắn của người hỏi hiện ngay (gửi lạc quan như hiện tại); DJ trả lời khi xong, không
  có trạng thái "đang gõ" ở bản này.

## Kiến trúc (định hướng, chi tiết để builder)

- Server: module mới `src/dj/` gồm bộ phân tích luật (thuần, không phụ thuộc Nest), `DjBrainService`
  (gọi luật → AI → hành động, trả `DjReply`), và phần dựng câu chữ tiếng Việt cho `content` / Slack.
- `SocialService.chat`: sau khi lưu và phát tin nhắn, nếu có `@DJ` thì gọi bộ não **không chặn** việc
  trả về của `chat:send`; tin trả lời lưu bằng `ChatMessage` với `kind = 'dj'`, `memberId = 'dj'`,
  `displayName = 'DJ'`, `payload` = `DjReply`.
- Migration `chat_message_kind`: thêm `kind String @default("member")` và `payload Json?` vào
  `ChatMessage`. `ChatMessageView` thêm `kind?: 'dj'` và `dj?: DjReply`. Bump `CONTRACTS_VERSION`
  (fetch `origin/develop` trước khi bump — đồng đội có thể đã bump).
- Slack: `SlackCommands.run` nhánh `default` → bộ não DJ với `platform: 'slack'`; dựng `SlackOut`
  từ `DjReply`.
- Client: `Chat.tsx` vẽ tin DJ (bong bóng riêng, thẻ bài, nút "Chỉ cho tôi" / "Gỡ bài này"), gợi ý `@`
  trong ô nhập; component `GuideSpotlight` + bus kiểu `find-songs.ts` để mở tab / điền ô tìm bài.

## Để builder quyết

- Danh sách từ khoá cụ thể cho từng ý định (vi + en, có / không dấu) và cách tách "tên bài rõ ràng"
  với "yêu cầu mơ hồ" (ví dụ có các từ "mới", "trending", "hot", "giống", "chill", "vui", "buồn",
  "vài bài", "gì đó" → mơ hồ).
- Lời nhắn hệ thống (system prompt) cho AI và nhiệt độ.
- Cách dựng câu chữ i18n và thời gian tính ETA (làm tròn phút).
- Vị trí khung hướng dẫn, kiểu lớp phủ trên từng chủ đề (miễn đạt AA và không che nút).

## Kiểm thử

Không có test tự động (quy ước dự án). Mỗi task: `npm run lint` + `npm run typecheck` (server, client),
`npm run build` client khi không chạy song song dev server. Thử trên dev (DB `localhost:55432`):
- mỗi ý định theo luật (vi + en) không gọi AI (log `AiService` không có dòng mới);
- câu mơ hồ thêm đúng 1 bài theo quyền người hỏi; hết lượt / AI nghỉ → câu dự phòng;
- "Chỉ cho tôi" trên 13 chủ đề × 1366 / 1920 px + điện thoại, mỗi mã chỉ dẫn;
- Slack: cần app Slack dev; nếu chưa có thì thử `SlackCommands.run` bằng script gọi trực tiếp.

## Quyết định thêm khi triển khai (2026-10-18)

- Câu trả lời DJ trên web do client tự viết theo ngôn ngữ người xem; `content` lưu câu tiếng Việt cho lịch sử, màn loa cũ và Slack.
- "Bỏ qua" theo quyền của người xem: có quyền điều khiển → chỉ nút Chuyển bài; không → nút Bỏ qua (bỏ phiếu).
- "Chỉ cho tôi" đặt focus vào nút được chỉ (chú thích là mô tả của nút); bấm, gõ hoặc Enter vào nút đó là đóng lớp phủ. Không thấy nút → chỉ hiện chú thích.
- Gợi ý thêm bài có tên bài: ô Thêm bài được điền sẵn, người dùng bấm Tìm.
- Tìm "bài mới / trending": tra YouTube với `"<nghệ sĩ> MV"`, chỉ nhận bài 1–10 phút của kênh nghệ sĩ, kênh official hoặc có dấu phát hành (MV, Official…).
- Câu "giống / tương tự bài đang phát" luôn đi qua AI.
