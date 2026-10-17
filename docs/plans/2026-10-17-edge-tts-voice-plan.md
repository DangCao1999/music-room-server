# Giọng đọc mới (Edge TTS) — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lời chúc và lời MC đọc trên loa bằng giọng neural Edge (Nam/Nữ người gửi tự chọn, đúng ngôn ngữ Việt/Anh), miễn phí, lùi về giọng trình duyệt khi Edge lỗi.

**Architecture:** Server có `TtsService` tạo mp3 qua Edge (gói `msedge-tts`), giữ trong bộ nhớ theo khoá băm, phục vụ ở `GET /api/tts/:key.mp3`. Lệnh máy phát và snapshot mang `SpeechView { text, audio, lang }`; client phát `<audio>` (hạ nhỏ video như cũ) và lùi về `speechSynthesis` khi không có/không phát được âm thanh. Hộp lời chúc bỏ 6 kiểu giọng, bắt buộc chọn Nam/Nữ.

**Tech Stack:** NestJS + Prisma + Socket.IO + zod (server), Next.js 16 / React 19 (client), contracts dùng chung (server là gốc, client `npm run contracts:sync`), `msedge-tts@2.0.8`.

**Spec:** `music-room-server/docs/specs/2026-10-17-edge-tts-voice-design.md`

## Global Constraints

- Giọng: vi Nam `vi-VN-NamMinhNeural`, vi Nữ `vi-VN-HoaiMyNeural`, en Nam `en-US-AndrewNeural`, en Nữ `en-US-AvaNeural`. Lời MC luôn **Nam**.
- Ngôn ngữ: có chữ tiếng Việt có dấu → `vi`; không dấu → hỏi `AiService`; AI không trả lời → `vi`; AI nói ngôn ngữ khác → `en`.
- Không chọn sẵn giọng ở giao diện; server coi **thiếu giọng = Nam** chỉ để tương thích (lời chúc cũ, client cũ).
- Server mới **vẫn nhận `voicePreset`** (bỏ qua giá trị); client mới **chỉ gửi `voice` khi là `'female'`**.
- Bài hát **không bao giờ chờ** tạo âm thanh; Edge lỗi → giọng trình duyệt, loa không im.
- Âm thanh đi qua **HTTP**, không qua socket. Đường HTTP **chỉ trả khoá đã tạo**, không tạo theo văn bản tuỳ ý.
- Bỏ hẳn 6 kiểu giọng vui (không giả lập cao độ/tốc độ).
- Trang Quyền riêng tư (VI, EN, English summary): thêm Microsoft (Edge Read Aloud); sửa câu hứa về tên.
- `CONTRACTS_VERSION`: `git fetch origin`, xem `origin/develop` của server trước khi tăng; client `npm run contracts:sync`.
- **Không test tự động**: mỗi task kiểm bằng `npm run lint && npm run typecheck` (server: `lint` + `build`) và chạy thử trên dev (DB `localhost:55432/musicroom`).
- **Không commit / push / PR** khi chưa được người dùng cho phép. Nhánh: server `feat/edge-tts`, client `feat/edge-tts`.

## Review Focus

1. Edge không truy cập được / chậm → bài bắt đầu ngay, loa đọc bằng giọng trình duyệt. → kiểm ở Task 3 (công tắc `TTS_ENABLED=false`) và Task 8.
2. Client cũ (chưa tải lại) gửi `voicePreset` hoặc không gửi `voice` → không `VALIDATION`, lời chúc đọc giọng Nam. → kiểm ở Task 1 và Task 8.
3. Lời chúc tiếng Việt **không dấu** khi AI không trả lời → giọng Việt (không phải giọng Anh). → kiểm ở Task 2.
4. `<audio>` ở domain web tải mp3 từ domain API (dev: cổng 3000 → 3001; prod: `musicroom.io.vn` → `api.musicroom.io.vn`) bị chặn bởi CORP/CORS → phải tải được. → kiểm ở Task 2 và Task 8.
5. Người nghe cùng (ListenAlong) nghe lời chúc bằng giọng mới; vào giữa bài (≥ 3 s) hoặc phòng đang dừng → không đọc. → kiểm ở Task 5 và Task 8.

---

## Phần 1 — Server (`music-room-server`, nhánh `feat/edge-tts`)

### Task 1: Contracts và lưu lựa chọn giọng

**Files:**
- Modify: `src/contracts/constants.ts` (thêm `VOICES`, giữ `VOICE_PRESETS` cho schema cũ)
- Modify: `src/contracts/schemas.ts:129-141` (`queue:add`, `queue:set-message`)
- Modify: `src/contracts/snapshot.ts` (`SpeechView`, `PlayerCommand`, `QueueItemView`)
- Modify: `src/contracts/version.ts`
- Modify: `src/queue/queue.service.ts:170-178`, `:376-381`; `src/state/views.ts:53-54`; `src/playback/playback.service.ts:698-703`

**Interfaces:**
- Produces:
  - `export const VOICES = ['male', 'female'] as const; export type Voice = (typeof VOICES)[number];`
  - `export interface SpeechView { text: string; /** khoá mp3 trên máy chủ, null = chưa có */ audio: string | null; lang: Lang }`
  - `PlayerCommand.speech?: SpeechView | null` (lời chúc, hoặc lời MC khi không có lời chúc). `wish` / `intro` giữ cho client cũ: `wish.voicePreset` luôn `null`.
  - `QueueItemView.voice?: Voice | null` (giọng đã lưu; giá trị cũ không phải `male|female` → `null`), `QueueItemView.wishSpeech?: SpeechView | null` (chỉ điền cho bài đang phát, Task 3). Bỏ `voicePreset` khỏi `QueueItemView`.
  - Lệnh: `queue:add` và `queue:set-message` thêm `voice: z.enum(VOICES).optional()`, **giữ** `voicePreset: z.enum(VOICE_PRESETS).optional()` (bỏ qua giá trị, ghi chú "client cũ").
- Lưu: dùng lại cột `QueueItem.voicePreset` (không migration), ghi `input.voice ?? 'male'` khi có lời chúc, `null` khi không.

- [ ] **Step 1:** `git fetch origin`; kiểm `origin/develop:src/contracts/version.ts`; tăng `CONTRACTS_VERSION` lên số kế tiếp trong ngày.
- [ ] **Step 2:** Sửa contracts, `queue.service`, `views.ts`, `playback.service.ts` (tạm `speech: null` — Task 3 điền).
- [ ] **Step 3:** `npm run lint && npm run build` — Expected: không lỗi.
- [ ] **Step 4 (Review Focus 2):** Dev: gửi `queue:set-message` với `{ voicePreset: 'baby' }` (client cũ) → lưu, `voicePreset` cột = `'male'`; với `{ voice: 'female' }` → `'female'`; không có lời chúc → `null`.

### Task 2: `TtsService`, Edge provider, nhận ngôn ngữ, đường HTTP

**Files:**
- Create: `src/tts/tts.provider.ts`, `src/tts/tts-lang.ts`, `src/tts/tts.service.ts`, `src/tts/tts.controller.ts`
- Modify: `package.json` (`"msedge-tts": "2.0.8"` — ghim chính xác), `src/config/env.ts` (`TTS_ENABLED`), `src/app.module.ts` (đăng ký provider + controller)

**Interfaces:**
- Consumes: `Voice`, `SpeechView`, `Lang` (Task 1); `AiService.json<T>(task, system, user, { timeoutMs })`.
- Produces:
  - `tts-lang.ts`: `export function hasVietnameseMarks(text: string): boolean` — đúng khi có ít nhất một chữ trong `ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ` (không phân biệt hoa thường).
  - `tts.provider.ts`: `export interface TtsProvider { synthesize(text: string, voiceName: string): Promise<Buffer> }`; `export class EdgeTtsProvider implements TtsProvider` dùng `msedge-tts` theo README của gói, định dạng `audio-24khz-48kbitrate-mono-mp3`, timeout **15 s**, mỗi lần gọi một kết nối mới. `export const VOICE_NAMES: Record<Lang, Record<Voice, string>>` (giá trị ở Global Constraints).
  - `tts.service.ts` (`@Injectable() TtsService`):
    - `speech(text: string, voice: Voice): SpeechView` — đồng bộ: trả `audio` nếu đã có trong bộ đệm, `lang` nếu đã biết (chưa biết → theo `hasVietnameseMarks`, không dấu → `'vi'`); nếu chưa có âm thanh thì **khởi động `prepare` ở nền** (không chờ).
    - `prepare(text: string, voice: Voice): Promise<string | null>` — nhận ngôn ngữ → chọn `VOICE_NAMES[lang][voice]` → `synthesize` → lưu → trả khoá; lỗi/`TTS_ENABLED=false` → `null` và log `warn` một dòng. Gộp các lần gọi trùng đang chạy (map promise theo `text|voice`).
    - `get(key: string): Buffer | undefined`.
    - Khoá = 32 ký tự đầu của `sha256(voiceName + '\n' + text)` dạng hex.
    - Bộ đệm âm thanh: `Map<key, Buffer>`, tối đa **300 mục**, bỏ mục cũ nhất trước. Bộ nhớ ngôn ngữ: `Map<text, Lang>`, tối đa **1000**.
    - Nhận ngôn ngữ không dấu: `ai.json<{ lang?: string }>('tts-lang', SYSTEM, text, { timeoutMs: 5000 })` với SYSTEM yêu cầu JSON `{"lang":"vi"|"en"|"other"}`; `'vi'` → vi; `'en'`/`'other'` → en; `null` → **vi**.
  - `tts.controller.ts`: `@Controller('tts')`, `@Get(':file')`; `file` phải khớp `/^([a-f0-9]{32})\.mp3$/`, không có trong bộ đệm → 404; có → `Content-Type: audio/mpeg`, `Cache-Control: public, max-age=86400, immutable`, `Cross-Origin-Resource-Policy: cross-origin` (ghi đè helmet), trả Buffer.
  - `env.ts`: `TTS_ENABLED: z.enum(['true','false']).default('true')` (công tắc tắt Edge khi bị chặn).

- [ ] **Step 1:** Cài `msedge-tts@2.0.8` (`npm install --save-exact msedge-tts@2.0.8`).
- [ ] **Step 2:** Viết 4 file + đăng ký trong `AppModule` (`providers`, `controllers`).
- [ ] **Step 3:** `npm run lint && npm run build` — Expected: không lỗi.
- [ ] **Step 4 (Review Focus 3, 4):** Dev, qua một script tạm trong scratchpad hoặc REPL Nest:
  - `prepare('Chúc mừng sinh nhật Lan', 'female')` → khoá; `curl -sI http://localhost:3001/api/tts/<khoá>.mp3` → `200`, `audio/mpeg`, `cross-origin-resource-policy: cross-origin`; tải về nghe được giọng HoaiMy.
  - `prepare('Happy birthday Lan', 'male')` → giọng Andrew.
  - Khoá lạ / `abc.mp3` → 404.
  - Câu không dấu `'chuc mung sinh nhat Lan'` với AI tắt (bỏ key AI trong lần chạy thử) → giọng Việt.

### Task 3: Nối vào lời chúc, lời MC, lệnh máy phát, snapshot

**Files:**
- Modify: `src/queue/queue.service.ts` (sau khi `add` / `setMessage` lưu lời chúc), `src/ai/mc.service.ts:109` (sau `this.lines.set`), `src/playback/playback.service.ts:681-711` (`buildPlayerCommand`), `src/state/views.ts` (`toItemView`), `src/state/snapshot.service.ts:115`

**Interfaces:**
- Consumes: `TtsService.speech`, `TtsService.prepare` (Task 2).
- Produces:
  - `toItemView(i: ItemWithRelations, speechFor?: (text: string, voice: Voice) => SpeechView): QueueItemView` — chỉ snapshot truyền `speechFor` cho **bài đang phát** để điền `wishSpeech`.
  - `PlayerCommand.speech`: có lời chúc → `tts.speech(wish, voiceOf(item))`; không có lời chúc và có lời MC (điều kiện hiện tại) → `tts.speech(line, 'male')`; ngược lại `null`.
  - `voiceOf(item): Voice` = cột `voicePreset` là `'female'` → `'female'`, còn lại `'male'`.

- [ ] **Step 1:** `queue.service`: sau khi lệnh lưu lời chúc thành công (ngoài khoá phòng), `void this.tts.prepare(wish, voice)`.
- [ ] **Step 2:** `mc.service`: mỗi dòng vừa lưu → `void this.tts.prepare(line, 'male')` (không chờ, không làm hỏng `prepare` của MC khi lỗi).
- [ ] **Step 3:** `buildPlayerCommand` và snapshot như Interfaces.
- [ ] **Step 4:** `npm run lint && npm run build` — Expected: không lỗi.
- [ ] **Step 5 (Review Focus 1):** Dev: thêm bài kèm lời chúc → vài giây sau log không lỗi, `player:command` có `speech.audio` khác null. Chạy server với `TTS_ENABLED=false` → `speech.audio` null, bài vẫn bắt đầu ngay.

---

## Phần 2 — Client (`music-room-client`, nhánh `feat/edge-tts`)

### Task 4: Đồng bộ contracts và lớp phát giọng đọc

**Files:**
- Run: `npm run contracts:sync`
- Create: `src/lib/speech.ts`
- Modify: `src/components/player/PlayerEngine.tsx:30-95` (chuyển `speak` + `VOICE` ra `lib/speech.ts`, bỏ `VOICE`)

**Interfaces:**
- Consumes: `SpeechView`, `Lang` (contracts), `SERVER_URL` (`src/lib/socket.ts`).
- Produces (`src/lib/speech.ts`):
  - `export function ttsUrl(key: string): string` → `${SERVER_URL}/api/tts/${key}.mp3`.
  - `export function playSpeech(s: SpeechView, volume: number, onDone: () => void): boolean` — có `audio` → một `HTMLAudioElement` duy nhất (dừng cái đang phát), `volume = volume / 100`; `onended` → `onDone`; lỗi tải hoặc `play()` bị từ chối → `speakText(s.text, s.lang, onDone)`. Không có `audio` → `speakText`. Trả `false` chỉ khi cả hai cách đều không có (không có `Audio` lẫn `speechSynthesis`).
  - `export function speakText(text: string, lang: Lang, onDone: () => void): boolean` — `speechSynthesis` như `speak()` cũ (giữ mẹo `currentUtterance`), `lang` `'vi'` → `vi-VN`, `'en'` → `en-US`, chọn giọng trình duyệt có `lang` cùng tiền tố; không cao độ/tốc độ riêng.
  - `export function stopSpeech(): void` — dừng audio và `speechSynthesis` (dùng khi đổi bài).
  - `export function legacySpeech(text: string | null | undefined): SpeechView | null` — cho server cũ: `{ text, audio: null, lang: 'vi' }`.

- [ ] **Step 1:** `npm run contracts:sync`; viết `lib/speech.ts`; `PlayerEngine` dùng `playerCommand.speech ?? legacySpeech(playerCommand.wish?.message ?? playerCommand.intro)` thay cho `wish ?? intro`; gọi `playSpeech(s, volume, …)`, giữ nguyên hạ âm lượng 20, thời gian dự phòng và điều kiện `expected < 3 && autoplay`; đổi bài → `stopSpeech()`.
- [ ] **Step 2:** `npm run lint && npm run typecheck` — Expected: không lỗi.

### Task 5: Người nghe cùng (ListenAlong)

**Files:**
- Modify: `src/components/player/ListenAlong.tsx:11`, `:161-178`

**Interfaces:**
- Consumes: `playSpeech`, `stopSpeech`, `legacySpeech` (Task 4); `QueueItemView.wishSpeech` (Task 1/3).

- [ ] **Step 1:** Đọc `np.item.wishSpeech ?? legacySpeech(np.item.wishMessage)`; âm lượng = âm lượng nghe cùng; giữ điều kiện `expected < 3`, đang phát, hạ âm lượng như cũ.
- [ ] **Step 2:** `npm run lint && npm run typecheck`.
- [ ] **Step 3 (Review Focus 5):** Dev: hai trình duyệt, một máy phát, một bật Nghe cùng; bài có lời chúc → cả hai nghe giọng Edge; người nghe vào khi bài đã chạy > 3 s → không đọc.

### Task 6: Hộp lời chúc chọn Nam/Nữ

**Files:**
- Modify: `src/components/room/WishSheet.tsx`, `src/i18n/vi.ts:415-431`, `src/i18n/en.ts` (khối `wish`)

**Interfaces:**
- Consumes: `Voice`, `QueueItemView.voice` (contracts).
- Produces: khoá từ điển `wish.voiceMale` ('Giọng nam' / 'Male voice'), `wish.voiceFemale` ('Giọng nữ' / 'Female voice'), `wish.pickVoice` ('Chọn giọng đọc' / 'Choose a voice'); xoá `wish.voices`. `wish.note` đổi thành: VI 'Loa đọc lời chúc bằng giọng bạn chọn ngay trước khi bài của bạn phát.' / EN 'The speaker reads your message in the voice you pick, right before your song plays.'

- [ ] **Step 1:** Thay danh sách 6 kiểu giọng bằng hai nút chọn Nam / Nữ (`aria-pressed`), trạng thái ban đầu = `item.voice ?? null` (không chọn sẵn). Nút lưu khoá khi chưa có lời chúc **hoặc** chưa chọn giọng, kèm dòng `t.wish.pickVoice` khi thiếu giọng. Xoá lời chúc không cần giọng. Gửi `queue:set-message` với `{ queueItemId, wishMessage, ...(voice === 'female' ? { voice } : {}) }`.
- [ ] **Step 2:** `npm run lint && npm run typecheck` — Expected: TypeScript bắt mọi chỗ còn dùng `wish.voices` / `VoicePreset`; sửa hết.

### Task 7: Trang Quyền riêng tư

**Files:**
- Modify: `src/app/privacy/content.tsx` (`PrivacyVi`, `PrivacyEn`, đoạn English summary trong `PrivacyVi`)

- [ ] **Step 1:** Mục "Dịch vụ bên ngoài nhận một phần dữ liệu" / "Outside services…": thêm dòng
  - VI: **Microsoft (Edge Read Aloud):** nội dung lời chúc và lời MC giới thiệu bài, có thể gồm tên hiển thị của người trong phòng, để đọc thành giọng nói trên loa.
  - EN: **Microsoft (Edge Read Aloud):** wish messages and the MC's song introductions, which may include people's display names in the room, to turn them into speech for the speaker.
- [ ] **Step 2:** Sửa câu hứa về tên ở mục nhà cung cấp AI (VI + EN + summary): tên **không** gửi cho các nhà cung cấp AI viết câu (Gemini, Groq, OpenRouter), nhưng có thể được gửi tới dịch vụ đọc giọng của Microsoft. Thêm Microsoft vào câu liệt kê dịch vụ trong English summary.
- [ ] **Step 3:** `npm run lint && npm run typecheck`; dev: `/privacy` ở VI và EN có dòng Microsoft.

### Task 8: Build và kiểm tra tổng trên dev

- [ ] **Step 1:** Server `npm run lint && npm run build`; client `npm run lint && npm run typecheck && npm run build` — Expected: không lỗi.
- [ ] **Step 2 (Review Focus 1, 2, 4, 5):** Dev (máy phát `/host` + một máy thành viên + một máy Nghe cùng):
  - Lời chúc có dấu Nam / Nữ, lời chúc tiếng Anh Nam / Nữ, lời chúc không dấu → đúng giọng, nghe ở máy phát và máy Nghe cùng; Network: mp3 tải từ cổng 3001 về trang cổng 3000 không lỗi CORP.
  - Bật MC giới thiệu bài, thêm bài không có lời chúc → lời MC giọng Nam (NamMinh).
  - Server `TTS_ENABLED=false` → đọc giọng trình duyệt, bài không chờ.
  - Gửi lệnh kiểu client cũ (`voicePreset: 'radio'`, không `voice`) → không lỗi, giọng Nam.
  - Hộp lời chúc: chưa chọn giọng → không lưu được; sửa lời chúc đã chọn Nữ → hiện sẵn Nữ.
- [ ] **Step 3:** Báo kết quả, xin phép commit / push / PR / merge (server trước, chỉ merge khi CI xanh).
