# Màn hình máy phát theo chủ đề (`/host`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 12 chủ đề có bố cục máy phát riêng theo mockup đã duyệt (khung 16:9 co giãn, lời bài hát 2 dòng), `default` giữ bố cục hiện tại; mọi chủ đề cùng một bộ nội dung; đổi chủ đề không làm ngắt nhạc.

**Architecture:** `HostScreen` luôn dựng **một khung DOM cố định** (đầu / video / dưới video / cột phải / đáy); `PlayerEngine` luôn ở khe video nên không bao giờ dựng lại. Chủ đề cung cấp nội dung các khe qua `ThemeModule.host: HostSkin` và đặt vị trí khe bằng CSS grid trong `src/themes/<id>/host.css`. Dữ liệu và mảnh dùng chung (đèn, tên bài, QR, bài tiếp theo, chat, âm lượng…) nằm ở `src/components/host/`, đọc qua `useHost()`.

**Tech Stack:** Next.js 16 (App Router) / React 19 / Tailwind 4; CSS container queries (`cqw`); `qrcode.react`; lucide-react.

**Spec:** `docs/specs/2026-10-17-host-themes-design.md` · Mockup (nguồn chuẩn cho vị trí, màu, chữ, trang trí): `docs/specs/assets/2026-10-17-host-themes/host-themes-1.html` (station, cassette, walnut, synthwave), `host-themes-2.html` (default, listening, hifi82, midcentury, transistor, astro, cosmos, saigon, pixel). Mockup vẽ bằng `cqw` trên khung 16:9: tỷ lệ trong mockup dùng thẳng được, **trừ** lời bài hát (mockup 1 dòng, làm 2 dòng: dòng đang hát + dòng kế tiếp).

## Global Constraints

- Chỉ client (`music-room-client`). Không đổi server, contracts, dữ liệu.
- Máy phát luôn theo chủ đề phòng (`useShownTheme(useRoomTheme())`, như hiện nay).
- `PlayerEngine` không được dựng lại khi đổi chủ đề phòng, khi chunk chủ đề tải xong, hay khi đổi cỡ cửa sổ qua ngưỡng bố cục.
- Nội dung bắt buộc ở **mọi** chủ đề: video (hoặc thẻ "Phát ở máy này"), đèn trạng thái (chữ chuẩn `t.host.onAir` / `t.nowPlaying.paused` / `t.host.waiting`), tên bài (2 dòng, không có bài: `t.host.idle`), nghệ sĩ `track.artist ?? track.channel` (ẩn khi null), người chọn, lời bài hát 2 dòng, lời chúc, thời gian (ẩn khi không có bài), âm lượng + `LangSwitch compact`, `Banners`, QR + mã phòng + link, `ListenersStrip`-tương đương (ẩn khi không ai nghe cùng), 3 bài tiếp theo (tên + người chọn; trống: `t.host.nextEmpty`), chat (trống: `t.chat.hostEmpty`), `HeartCanvas`, `SkipVote variant="host"` + `HostVoteMeter`, `Decor`.
- Lời bài hát máy phát: dòng đang hát, dòng kế tiếp, dòng nguồn `t.lyrics.source` (người dùng đổi từ 4 sang 2 dòng); **không có nút ẩn / hiện** (cả `default`); chỉ với lời đồng bộ. Cỡ video không phụ thuộc bài có lời hay không.
- QR: chủ đề khác `default` luôn `fgColor="#111111" bgColor="#ffffff" marginSize={2}`, không xoay, không đè; cạnh ≥ 180px ở khung rộng 1280px. `default` giữ màu hiện tại.
- Khung 16:9: dùng khi `@media (min-width: 960px) and (min-height: 540px)`; khung = `width: min(100vw, calc(100dvh * 16 / 9))`, `aspect-ratio: 16/9`, căn giữa, `container-type: size`; mọi cỡ bên trong bằng `cqw`. Ngoài media đó: một cột cuộn được (video, dưới video, cột phải theo thứ tự), giữ màu / font / trang trí.
- Cỡ tối thiểu ở khung rộng 1280px: tên bài ≥ 28px (≥ 2.2cqw), dòng lời đang hát ≥ 22px (≥ 1.72cqw), mã phòng ≥ 32px (≥ 2.5cqw), chữ phụ ≥ 14px (≥ 1.1cqw), QR ≥ 180px (≥ 14.1cqw). Video rộng ≥ 45% khung (45–54cqw).
- Trang trí không che video: khung (viền, lưới loa, cửa sổ tàu, neon) nằm ngoài vùng 16:9 của video.
- Icon chỉ lucide; không emoji / ký tự unicode làm icon (♪ → `Music`, ● → chấm CSS, ✦ → `Sparkle`, ▶ → `Play`, ♥ → `Heart`, 🔊 → `Volume2`). Vòng `astro` dùng `Wheel` (vạch), không dùng ♈…♓.
- `prefers-reduced-motion`: không quay / lật / chạy chữ; dòng tin `station` thành 3 tin đứng yên.
- Nhãn aria giữ tên chuẩn (`t.host.next`, `t.chat.title`, `t.host.scan`); chữ theo chủ đề chỉ để hiển thị. Chữ mới thêm vào `themeText` ở **cả** `src/i18n/vi.ts` và `src/i18n/en.ts` (`Dict = Widen<typeof vi>`, thiếu bên en là lỗi typecheck).
- Tương phản WCAG AA (chữ thường 4.5:1, chữ lớn 3:1).
- CSS máy phát của chủ đề: `src/themes/<id>/host.css`, import trong `src/themes/<id>/index.tsx`, mọi selector bắt đầu bằng `html[data-theme='<id>'] .host-root`. Không import font ngoài thư mục chủ đề.
- Không test tự động (quy ước dự án): mỗi task kết thúc bằng `npm run lint && npm run typecheck` (client) + xem trên dev. Build (`npm run build`) ở task cuối. Không commit / push khi chưa được phép; tiến độ ghi ở ledger.
- Dev: server + client qua `.claude/launch.json` ("music-room-server", "music-room-client"); DB dev phải là `localhost:55432/musicroom`. Phòng thử trên dev: tạo tự do. Đổi chủ đề phòng: trang phòng (quản trị viên) → Cài đặt phòng → Giao diện của phòng.
- Nhánh: client `feat/host-themes` từ `origin/develop` (`git fetch origin` trước). Tài liệu (spec, plan, mockup) ở server, commit riêng khi được phép.

## Review Focus

1. Đổi chủ đề phòng giữa lúc đang phát, cả `default` ↔ chủ đề khác và chủ đề đã làm ↔ chưa làm → iframe YouTube vẫn là cùng một phần tử, nhạc chạy tiếp — Task 1 (bước kiểm iframe) và lặp lại ở Task 14.
2. Cửa sổ thu / phóng qua ngưỡng 960×540 khi đang phát → nhạc không ngắt, bố cục chuyển một cột ↔ khung 16:9 — Task 2.
3. Bài có lời đồng bộ dài dòng (dòng đang hát rất dài) → dòng bị cắt `truncate`, khối 2 dòng không đẩy các khối khác ra khỏi khung — checklist chung (Task 2), mọi task chủ đề.
4. Tên phòng / tên người / lời chúc / tin chat rất dài, hoặc 3 bài tiếp theo có tên dài → cắt gọn, không tràn khung 16:9 — checklist chung.
5. Laptop mở trình duyệt không toàn màn hình (1366×768 → vùng trang ~1366×650) → không cuộn, chữ phụ không nhỏ hơn ~13px — checklist chung.

---

### Task 1: Nền tảng — khung DOM cố định, phần dùng chung, `default` dời sang khung mới

**Files:**
- Create: `src/components/host/HostContext.tsx`
- Create: `src/components/host/parts.tsx`
- Create: `src/components/host/HostScreen.tsx` (chuyển `HostScreen` ra khỏi `page.tsx`)
- Create: `src/components/host/defaultSkin.tsx`
- Create: `src/components/host/host.css`
- Modify: `src/app/r/[code]/host/page.tsx` — chỉ còn `HostPage` (đăng ký máy phát), render `<HostScreen code={code} />` từ file mới.
- Modify: `src/themes/load.ts` — thêm `HostSkin`, `ThemeModule.host?: HostSkin` (giữ `HostDial` tới Task 14).
- Modify: `src/components/room/Lyrics.tsx` — `InlineLyrics` với `size === 'host'`: không render nút ẩn / hiện, luôn hiện (bỏ đọc `mr:host-lyrics` cho host); `HostLyrics` nhận `className?: string`.

**Interfaces:**
- Produces (`src/themes/load.ts`):
  ```ts
  export interface HostSkin {
    /** On `.host-root`: picks the theme's grid in its host.css. */
    className: string;
    /** On the video slot's wrapper (frame drawn around, never over, the 16:9 video). */
    videoClass?: string;
    Header?: React.ComponentType;
    Below: React.ComponentType;
    Side: React.ComponentType;
    Footer?: React.ComponentType;
  }
  ```
- Produces (`src/components/host/HostContext.tsx`):
  ```ts
  export interface HostData {
    code: string;
    roomName: string;
    joinUrl: string;              // '' before the origin is known
    np: NowPlayingView | null;
    live: boolean;                // np?.status === 'PLAYING'
    picker: string | null;        // np.item.addedBy?.displayName
    artist: string | null;        // track.artist ?? track.channel
    next: QueueItemView[];        // queue.slice(0, 3)
    volume: number;
    setVolume: (v: number) => void;
    theme: ThemeId;
  }
  export function HostProvider(p: { value: HostData; children: React.ReactNode }): JSX.Element;
  export function useHost(): HostData;
  ```
- Produces (`src/components/host/parts.tsx`), mỗi cái nhận `className?: string`:
  - `HostVideo()` — `PlayerEngine volume` hoặc thẻ `playerRevoked` (chuyển nguyên từ page.tsx). **Chỉ `HostScreen` dùng.**
  - `HostLamp()` — `OnAirLamp` với chữ chuẩn.
  - `HostTitle({ as?: 'h1' })` — tên bài / `t.host.idle`, `line-clamp-2`, `[unicode-bidi:plaintext]`.
  - `HostMeta({ show?: ('artist' | 'picker')[] })` — "Nghệ sĩ · Người chọn" (`t.nowPlaying.pickedBy`, `addedByLabel`), null khi không có bài.
  - `HostWish({ withFrom?: boolean })` — null khi không có lời chúc; `withFrom` thêm `t.nowPlaying.wishFrom(picker)`.
  - `HostQr()` — `QRCodeSVG` vẽ cỡ 512, CSS `width:100%;height:auto` (cạnh do vùng chứa quyết); màu theo Global Constraints; `title={joinUrl}`; giữ chỗ vuông khi `joinUrl` rỗng.
  - `HostCode()`, `HostLink()` — mã phòng, link (`[overflow-wrap:anywhere]`).
  - `HostNextEmpty()` — `<p>` `t.host.nextEmpty`.
  - `useHostChat(n: number): ChatMessageView[]` — `n` tin mới nhất.
  - `HostChatLines({ n, showTime?: boolean })` — danh sách tên + nội dung (`line-clamp-2`), trống: `t.chat.hostEmpty`; `aria-labelledby` về tiêu đề chuẩn.
  - `HostControls()` — thanh âm lượng (`t.host.volume`, `t.host.volumeValue`) + `<LangSwitch compact />`.
- Produces (`src/components/host/defaultSkin.tsx`): `defaultSkin(HostDial?: React.ComponentType): HostSkin` — bố cục `/host` hiện tại: `Below` = đèn + tên + `HostMeta` + `HostLyrics` + lời chúc + (`HostDial ?? LiveDial large`) + `HostControls` + `Banners`; `Side` = thẻ `.host-qr` + `ListenersStrip lg` + "Tiếp theo" (ảnh `Thumb` 52) + `HostChat` (4 tin có giờ). `className: 'host-default'`, `videoClass` giữ `max-w-[max(360px,calc((100dvh-27rem)*16/9))]`.

- [ ] **Step 1:** `git fetch origin && git switch -c feat/host-themes origin/develop`.
- [ ] **Step 2:** Viết `HostContext.tsx`, `parts.tsx` (chuyển logic từ page.tsx, không đổi hành vi).
- [ ] **Step 3:** Viết `HostScreen.tsx` với khung cố định (thứ tự con **không đổi** giữa các chủ đề; khe trống trả `null`):
  ```tsx
  <main className={`host-root ${skin.className}`} data-layout={mod?.host ? 'canvas' : 'flow'}>
    {theme === 'default' && <Backdrop height="h-dvh" />}
    {Decor && <Decor />}
    <HeartCanvas />
    <SkipVote variant="host" meter={mod?.HostVoteMeter} />
    <div className="host-frame">
      <div className="host-grid">
        <div className="host-header">{Header ? <Header /> : null}</div>
        <div className={`host-video ${skin.videoClass ?? ''}`}><HostVideo /></div>
        <div className="host-below"><Below /></div>
        <div className="host-side"><Side /></div>
        <div className="host-footer">{Footer ? <Footer /> : null}</div>
      </div>
      <div className="host-banners">{mod?.host ? <Banners /> : null}</div>
    </div>
  </main>
  ```
  `skin = mod?.host ?? defaultSkin(mod?.HostDial)`. `Banners`: bố cục `default` giữ trong `Below` như cũ; bố cục chủ đề hiện ở `.host-banners` (lớp nổi trong khung, Task 2), nên skin chủ đề **không** tự đặt `Banners`. Giữ nguyên các effect hiện có (`useApplyTheme`, `useRoomMood(theme === 'default')`, tự lấy lại quyền phát sau `HOST_RECLAIM_MS`). Bọc trong `HostProvider`.
- [ ] **Step 4:** `host.css` (import trong `HostScreen.tsx`): `.host-header:empty, .host-footer:empty { display: none }`; `.host-default` dựng lại đúng lưới cũ: `max-width: 1600px`, ≥1024px `grid-template-columns: minmax(0,1fr) 340px`, `grid-template-areas: "video side" "below side"`, khoảng cách như cũ; dưới 1024px một cột (video, below, side).
- [ ] **Step 5:** Sửa `Lyrics.tsx` như trên.
- [ ] **Step 6:** `npm run lint && npm run typecheck` → không lỗi.
- [ ] **Step 7:** Dev, phòng `default` có bài đang phát (bài có lời đồng bộ): so ảnh chụp trước/sau ở 1440×900 và 390×844 — giống hệt, trừ (a) có thêm nghệ sĩ cạnh người chọn, (b) không còn nút "Ẩn lời". Đổi phòng sang `astro`: máy phát hiện như trước (bố cục cũ + `Wheel`), không lỗi console.
- [ ] **Step 8 (Review Focus 1):** Trên máy phát đang phát, chạy trong console `window.__yt = document.querySelector('.host-video iframe')`; đổi chủ đề phòng `default` → `astro` → `default`; rồi `document.querySelector('.host-video iframe') === window.__yt`. Expected: `true`, nhạc không ngắt, giờ phát không về 0:00.

### Task 2: Khung 16:9 co giãn + `station` (chủ đề đầu tiên)

**Files:**
- Modify: `src/components/host/host.css` — khung canvas dùng chung.
- Create: `src/themes/station/host.css`; Modify: `src/themes/station/index.tsx`, `src/i18n/vi.ts`, `src/i18n/en.ts`.

**Interfaces:**
- Consumes: `HostSkin`, `useHost`, các mảnh trong `parts.tsx` (Task 1).
- Produces: khung canvas — mọi task sau chỉ viết `grid-template-*` và cỡ `cqw` trong `@media (min-width: 960px) and (min-height: 540px)`. Lớp lời dùng chung `.host-root[data-layout='canvas'] .lyrics-inline`.
- Produces: **Checklist máy phát** (dưới đây), mọi task chủ đề chạy lại.

- [ ] **Step 1:** `host.css` thêm, trong media query trên:
  `.host-root[data-layout='canvas']` → `min-height: 100dvh; display: grid; place-items: center; overflow: hidden`;
  `[data-layout='canvas'] .host-frame` → `width: min(100vw, calc(100dvh * 16 / 9)); aspect-ratio: 16/9; container-type: size; position: relative`;
  `[data-layout='canvas'] .host-grid` → `position: absolute; inset: 0; display: grid; font-size: 1cqw; overflow: hidden` (từng chủ đề đặt `grid-template-*`, `padding`, `gap`);
  mỗi khe `min-width: 0; min-height: 0; overflow: hidden`; `.host-video > *` giữ `aspect-ratio: 16/9; width: 100%`;
  `.host-banners` → `position: absolute; left: 50%; top: 1.5cqw; transform: translateX(-50%); width: min(60cqw, 90%); z-index` trên lưới (ngoài media: theo dòng, sau `.host-grid`);
  lời: dòng đang hát `font-size: max(1.72cqw, 22px)` → đề xuất `2.2cqw`, dòng khác `1.5cqw`, nguồn `0.85cqw`, mọi dòng `truncate`.
  Ngoài media: `.host-grid` một cột `gap: 1.25rem; padding: 1rem`, thứ tự header, video, below, side, footer.
- [ ] **Step 2:** Chữ mới `themeText.station`: `ticket: 'Vé lên tàu'` / `'Boarding pass'`, `passengers: 'Hành khách'` / `'Passengers'`.
- [ ] **Step 3:** `station` `host: HostSkin`, `className: 'host-station'`:
  - `Header`: `FlipText` tên phòng (`roomName`), `CodeFlaps` (mã), `Clock large`.
  - `Below`: `HostLamp` + nhãn `t.themeText.station.platform`; `HostTitle`; `HostMeta` + `HostWish` trên một dòng; `Track large`; `HostLyrics`.
  - `Side`: thẻ "vé" (`HostQr`, `ticket`, `t.host.scan`, `HostCode`, `HostLink`); bảng `departures` 3 dòng với giờ từ `etaTimes(now, np, next)` (định dạng HH:mm như `Board`, null → "—"), tên, người chọn; trống → `HostNextEmpty`; "Hành khách" = người nghe cùng (như `ListenersStrip`).
  - `Footer`: `Ticker` dùng lại (xuất từ `station/index.tsx`) + `HostControls`; không có tin → `t.chat.hostEmpty` đứng yên; reduced motion → 3 tin mới nhất đứng yên.
  - Lưới (`station/host.css`): `grid-template-columns: 47cqw 1fr; grid-template-rows: auto auto 1fr auto; grid-template-areas: "header header" "video side" "below side" "footer footer"`. Màu, chữ, vé, bảng theo mockup.
- [ ] **Step 4:** `npm run lint && npm run typecheck` → không lỗi.
- [ ] **Step 5 — Checklist máy phát** (phòng `station` trên dev):
  1. 1920×1080, 1280×720, 1440×900, 1366×650: đủ mọi nội dung trong Global Constraints, không thanh cuộn (`document.scrollingElement.scrollHeight <= innerHeight`), không khối nào bị cắt ngoài ý muốn, so với mockup.
  2. Đo bằng DevTools ở 1280×720: tên bài ≥ 28px, dòng lời đang hát ≥ 22px, mã ≥ 32px, chữ phụ ≥ 14px, QR ≥ 180px; video ≥ 45% khung.
  3. Bài có lời đồng bộ (2 dòng + nguồn hiện, không đè) và bài không có lời (`.host-video` cùng `getBoundingClientRect().width`).
  4. Không có bài; tạm dừng; hàng chờ trống; không chat; không lời chúc; tên bài / tên người / lời chúc / tin chat rất dài (dán chuỗi 200 ký tự); đang bỏ phiếu bỏ qua; có banner; `playerRevoked` (mở máy phát thứ hai rồi bấm "Phát ở máy này" ở máy kia).
  5. 900×700 và 390×844: một cột cuộn được, không tràn ngang.
  6. Kéo cửa sổ qua 960px khi đang phát: chạy kiểm iframe như Task 1 Step 8 → `true` (Review Focus 2).
  7. Emulate `prefers-reduced-motion: reduce`: không còn chuyển động trang trí.
  8. Tương phản AA các cặp chữ chính (DevTools contrast).
  9. Tab Network: chỉ chunk + font của chủ đề phòng.
  10. Đổi `vi` ↔ `en`: chữ mới đổi theo, không tràn.
  Expected: tất cả đạt.

### Task 3: `cassette`

**Files:** Create `src/themes/cassette/host.css`; Modify `src/themes/cassette/index.tsx`.
**Interfaces:** Consumes Task 1–2.

- [ ] **Step 1:** `host`, `className: 'host-cassette'`: `Below` = vỏ băng (nhãn viết tay "Mặt A" `t.themeText.cassette.sideA` + `HostLamp`, `HostTitle`, `HostMeta`; cửa sổ `TapeWindow large playing={live}` + giờ `TimeText`) rồi `HostLyrics`; `Side` = sticker trắng (`HostQr`, `t.host.scan`), băng Dymo (`HostCode`), `HostLink`, bìa J-card `sideB` đánh số 1–3 (tên + người chọn), giấy note = `useHostChat(3)`, hàng người nghe + `HostControls`; lời chúc (`HostWish withFrom`) là giấy note vàng xoay nhẹ trong `Side`/`Below`, không đè video. Lưới `"video side" "below side"`, cột trái 47cqw.
- [ ] **Step 2:** `npm run lint && npm run typecheck`; chạy Checklist máy phát (Task 2 Step 5) với phòng `cassette`. Expected: đạt.

### Task 4: `walnut`

**Files:** Create `src/themes/walnut/host.css`; Modify `src/themes/walnut/index.tsx`, `vi.ts`, `en.ts`.

- [ ] **Step 1:** Chữ mới `themeText.walnut.scan: 'Mời quét chọn bài'` / `'Scan to pick a song'`.
- [ ] **Step 2:** `host`, `className: 'host-walnut'`, `videoClass: 'host-walnut-bezel'` (viền đồng quanh video): `Below` = bàn đĩa (mâm quay dùng lại kiểu `.wal-turntable` với ảnh bìa ở nhãn, dừng khi không phát; `HostLamp`, `HostTitle` serif nghiêng, `HostMeta`; `Vu large`), `HostLyrics`, `HostWish`; `Side` = bảng đồng (`HostQr`, `scan`, `HostCode`, `HostLink`), "Chồng đĩa tiếp theo" (`t.themeText.walnut.next`, bìa `Thumb` thật + tên + người chọn), thẻ kem (người nghe, `HostChatLines n=3`, `HostControls`). Nền vân gỗ trên `.host-frame`.
- [ ] **Step 3:** Lint + typecheck; Checklist máy phát với `walnut`. Expected: đạt.

### Task 5: `synthwave`

**Files:** Create `src/themes/synthwave/host.css`; Modify `src/themes/synthwave/index.tsx`.

- [ ] **Step 1:** `host`, `className: 'host-synthwave'`, `videoClass` viền neon hồng: `Below` = `HostLamp`, `HostTitle` (chữ nghiêng ánh chrome), `HostMeta`, `LineDial variant="neon"`, `HostLyrics`, `HostWish`; `Side` = 3 khung neon xanh: (`HostQr`, `t.host.scan`, `HostCode`, `HostLink`), "Tiếp theo" đánh số 01–03, (người nghe, `HostChatLines n=3`, `HostControls`). Mặt trời + lưới từ `Decor` hiện có, đặt sao cho mặt trời lộ giữa hai cột như mockup.
- [ ] **Step 2:** Lint + typecheck; Checklist với `synthwave`. Expected: đạt.

### Task 6: `listening`

**Files:** Create `src/themes/listening/host.css`; Modify `src/themes/listening/index.tsx`.

- [ ] **Step 1:** `host`, `className: 'host-listening'`: `Below` = hàng (ảnh bìa vuông + đĩa than hé phải, dùng lại `Cover` / `.rec`; cạnh đó `HostLamp`, `HostTitle` Fraunces nghiêng, `HostMeta`), `HostLyrics`, `HostWish`, `LiveDial size="large"`; `Side` = lót ly tròn (`HostQr` ≥ 14.1cqw, `t.host.scan`, `HostCode`, `HostLink` dưới lót ly), thực đơn "Tiếp theo" (tên … người chọn, dấu chấm dẫn), người nghe + `HostChatLines n=3` + `HostControls`.
- [ ] **Step 2:** Lint + typecheck; Checklist với `listening`. Expected: đạt.

### Task 7: `hifi82`

**Files:** Create `src/themes/hifi82/host.css`; Modify `src/themes/hifi82/index.tsx`.

- [ ] **Step 1:** `host`, `className: 'host-hifi82'`: `Side` = hàng tên phòng + đèn cam (`HostLamp`), khối QR (`HostQr`, `t.host.scan`, `HostCode`, `HostLink`), `HostWish`; `Footer` = **dải LCD hết chiều ngang** (thay `<Lcd large/>`): `HostTitle`, `HostMeta`, giờ + vạch đo (logic như `Lcd`), và `HostLyrics` trong dải (màu LCD); `Below` = 3 phím vuông đánh số (tên + người chọn) | khung người nghe + `HostChatLines n=3` + `HostControls`. Lưới: `grid-template-areas: "video side" "footer footer" "below below"`; cột trái ≈ 50cqw.
- [ ] **Step 2:** Lint + typecheck; Checklist với `hifi82` (chủ đề sáng: kiểm AA chữ LCD trên nền tối và chữ trên nhôm). Expected: đạt.

### Task 8: `midcentury`

**Files:** Create `src/themes/midcentury/host.css`; Modify `src/themes/midcentury/index.tsx`.

- [ ] **Step 1:** `host`, `className: 'host-midcentury'`: hai hình trang trí (mặt trời vàng sau góc trên trái video, vòng cam trên phải video) là phần tử `aria-hidden` trong `.host-frame` (hoặc `::before/::after` của `.host-grid`), **không nằm sau chữ**; `videoClass` bóng khối. `Below` = `HostLamp` + `HostMeta`, `HostTitle` (Archivo rộng, in hoa), `LineDial variant="mc"`, `HostLyrics`, `HostWish`; `Side` = QR nền kem (`HostQr`, `t.host.scan`, `HostCode`, `HostLink`), "Tiếp theo" 3 bìa tròn (`Thumb` thật) + tên + người chọn, người nghe + `HostChatLines n=3` + `HostControls`.
- [ ] **Step 2:** Lint + typecheck; Checklist với `midcentury`. Expected: đạt.

### Task 9: `transistor`

**Files:** Create `src/themes/transistor/host.css`; Modify `src/themes/transistor/index.tsx`.

- [ ] **Step 1:** `host`, `className: 'host-transistor'`: thân radio đỏ viền crôm là nền `.host-frame`; ô lưới loa phủ vùng `video` + `below` bằng `.host-grid::before { grid-area: video / video / below / below }` (pseudo-element là phần tử lưới). `Below` = `HostLamp` + `HostMeta`, `HostTitle`, `HostLyrics`; `Side` = huy hiệu crôm (`HostQr`, `t.host.scan`, `HostCode`, `HostLink`), 3 phím nhớ đài (`t.themeText.transistor.next`; số, tên, người chọn), `HostWish`, khung "Thư thính giả" (`t.themeText.transistor.chat`: người nghe, `HostChatLines n=2`, `HostControls`); `Footer` = `Band large` hết chiều ngang (kim đỏ = thời gian; ẩn kim khi không có bài). Lưới `"video side" "below side" "footer footer"`.
- [ ] **Step 2:** Lint + typecheck; Checklist với `transistor`. Expected: đạt.

### Task 10: `astro`

**Files:** Create `src/themes/astro/host.css`; Modify `src/themes/astro/index.tsx`, `vi.ts`, `en.ts`.

- [ ] **Step 1:** Chữ mới `themeText.astro.next: 'Các sao sắp mọc'` / `'Rising next'`.
- [ ] **Step 2:** `host`, `className: 'host-astro'`, `videoClass` viền vàng mảnh: `Below` = `HostLamp` + `HostMeta`, `HostTitle` (Cormorant nghiêng), `HostLyrics`, `HostWish`; `Side` = `Wheel size="host"` cỡ ≈ 24cqw (cung vàng = thời gian; khi không có bài: vòng không cung) **bao quanh** khối giữa (`HostQr` ≥ 14.1cqw, `HostCode`, giờ `TimeText`) — viền trắng của QR không bị vòng lấn; `HostLink` dưới vòng; "Các sao sắp mọc" (`Sparkle` + tên + người chọn); người nghe + `HostChatLines n=2` + `HostControls`. `Moon` vẫn là `HostVoteMeter`.
- [ ] **Step 3:** Lint + typecheck; Checklist với `astro`. Expected: đạt.

### Task 11: `cosmos`

**Files:** Create `src/themes/cosmos/host.css`; Modify `src/themes/cosmos/index.tsx`.

- [ ] **Step 1:** `host`, `className: 'host-cosmos'`, `videoClass: 'host-cosmos-port'` (cửa sổ tàu bo tròn + đinh tán, ngoài vùng video): `Below` = hàng (`Planet withCover={false}` cỡ ≈ 9cqw, vệ tinh = thời gian; cạnh đó `HostLamp`, `HostTitle`, `HostMeta`, `TimeText`), `HostLyrics`, `HostWish`; `Side` = khung QR (`HostQr`, `t.host.scan`, `HostCode`, `HostLink`), "Quỹ đạo tiếp theo" (`t.themeText.cosmos.next`): 3 hành tinh nhỏ dần là ảnh bìa thật bo tròn + tên + người chọn, khung `Stars` + `HostChatLines n=2` + `HostControls`.
- [ ] **Step 2:** Lint + typecheck; Checklist với `cosmos`. Expected: đạt.

### Task 12: `saigon`

**Files:** Create `src/themes/saigon/host.css`; Modify `src/themes/saigon/index.tsx`.

- [ ] **Step 1:** `host`, `className: 'host-saigon'`, `videoClass` khung gỗ: viền gạch bông quanh khung 16:9 (dùng lại `.saigon-tiles` hoặc nền `.host-frame`), giấy kem bên trong. `Header` = biển hiệu (`roomName`, Bungee) + `HostLamp` + số người nghe cùng; `Below` = `HostTitle`, `HostMeta` + `TimeText`, `LineDial variant="tape"`, `HostLyrics`; `Side` = QR trên giấy (`HostQr`, `t.host.scan`, `HostCode`, `HostLink`), bảng phấn khung gỗ "Tiếp theo" viết tay (Patrick Hand; tên + người chọn), thiệp `HostWish withFrom`, `HostChatLines n=2` + `HostControls`. Lưới `"header header" "video side" "below side"`.
- [ ] **Step 2:** Lint + typecheck; Checklist với `saigon` (chủ đề sáng: kiểm AA chữ phấn trên bảng đen, chữ trên giấy kem). Expected: đạt.

### Task 13: `pixel`

**Files:** Create `src/themes/pixel/host.css`; Modify `src/themes/pixel/index.tsx`, `vi.ts`, `en.ts`.

- [ ] **Step 1:** Chữ mới `themeText.pixel.join: 'Người chơi 2? Quét để vào'` / `'Player 2? Scan to join'`, `level: (n: number) => \`Màn ${n}\`` / `` (n) => `Level ${n}` ``.
- [ ] **Step 2:** `host`, `className: 'host-pixel'`, `videoClass` viền pixel + bóng cứng: `Header` = HUD (`HealthBar large` = thời gian, `TimeText`, `Lives` ("x N người"), `t.themeText.pixel.stage`); `Below` = `HostLamp`, `HostTitle` (VT323), `HostMeta`, `HostLyrics` (dòng lời giữ font thân, không VT323); `Side` = hộp thoại `join` (`HostQr`, `HostCode`, `HostLink`), hộp thoại `t.themeText.pixel.next` (`level(2..4)` · tên · người chọn, mũi tên `Play` ở dòng đầu), hộp thoại `HostWish withFrom` + `HostChatLines n=2` (font thân), người nghe + `HostControls`. `BossBar` vẫn là `HostVoteMeter`. Lưới `"header header" "video side" "below side"`.
- [ ] **Step 3:** Lint + typecheck; Checklist với `pixel`. Expected: đạt.

### Task 14: Dọn dẹp và kiểm toàn bộ

**Files:**
- Modify: `src/themes/load.ts` — xoá `HostDial` khỏi `ThemeModule`; `host` vẫn optional (chỉ `default` không có).
- Modify: `src/components/host/HostScreen.tsx`, `defaultSkin.tsx` — `defaultSkin()` không còn tham số `HostDial`, dùng `LiveDial size="large"`.
- Modify: 12 `src/themes/<id>/index.tsx` — xoá khai báo `HostDial` và component chỉ dùng cho nó (`HostTape`, `HostClockTrack`, …) nếu không còn nơi dùng.
- Modify: `theme.css` của `astro`, `cosmos`, `saigon`, `midcentury`, `synthwave`, `station` — xoá class `*-host` cũ (`.astro-host`, `.cosmos-host`, `.line-dial.saigon-host`, `.line-dial.mc-host`, `.line-dial.synth-host`, `.st-host`) nếu không còn nơi dùng (`LC_ALL=C grep -rnF` để chắc).

- [ ] **Step 1:** Sửa như trên.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm run build` → không lỗi. (Client: `npm run build` an toàn; chỉ server mới có bẫy nest watch.)
- [ ] **Step 3:** Kiểm iframe (Task 1 Step 8) qua chuỗi đổi chủ đề `default → station → hifi82 → pixel → default` khi đang phát. Expected: `true`, nhạc không ngắt.
- [ ] **Step 4:** Chụp 13 chủ đề ở 1920×1080 và 1366×650 (bài có lời, có lời chúc, có hàng chờ, có chat) đặt cạnh mockup; ghi chỗ lệch có chủ ý (video so với bản vẽ) vào ledger.
- [ ] **Step 5:** Khi được phép: commit client (`feat(host): themed speaker screens`), tài liệu server (spec + plan + mockup) ở nhánh riêng; push, PR, merge chỉ khi CI xanh.
