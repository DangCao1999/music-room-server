# Chủ đề giao diện (13 chủ đề, phương án B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 13 chủ đề đổi được tức thì (quản trị viên chọn chủ đề phòng, mỗi người chọn riêng), mỗi chủ đề có bố cục + trang trí như mockup B, đủ mọi chức năng.

**Architecture:** Server chỉ thêm `RoomSettings.theme` (+ `room:peek.theme`). Client: `data-theme` trên `<html>` + token CSS theo chủ đề; trang phòng tách thành `RoomFrame` (khung chung: tab, cột phải, lớp phủ) + `stage` (cột trái) do **module chủ đề** cung cấp, tải động (`import()`) kèm CSS và font của chủ đề đó. Mọi logic (bỏ phiếu, hàng chờ, chat, lời bài hát, điều khiển) nằm ở hook / component dùng chung; module chủ đề chỉ trình bày.

**Tech Stack:** NestJS 11 + zod contracts; Next.js 16 (App Router) / React 19 / Tailwind 4; `next/font/google` (`preload: false`); lucide-react.

**Spec:** `docs/specs/2026-10-17-themes-design.md` · Mockup (nguồn chuẩn cho màu, chữ, bố cục, trang trí): `docs/specs/assets/2026-10-17-themes/themes-1-3-and-A-D.html`, `themes-astro-cosmos-saigon-8bit-synth.html` (mỗi chủ đề: bản máy tính + điện thoại + danh sách "Điểm nhấn / Nút / Bỏ phiếu / …" dưới hình).

## Global Constraints

- Theme id (đúng thứ tự, đúng chính tả): `default, listening, hifi82, midcentury, walnut, transistor, cassette, station, astro, cosmos, saigon, pixel, synthwave`. Tên + nhóm hiển thị lấy bảng trong spec; nhóm: Tối giản / Vintage / Bầu trời / Việt Nam / Thập niên.
- `RoomSettings.theme` mặc định `'default'`; thiết lập cũ / id lạ đọc thành `'default'` **mà không làm mất các thiết lập khác**.
- Chủ đề riêng: `localStorage['mr:theme']` = theme id, hoặc `'room'` / không có = theo phòng; bọc try/catch. Hiệu lực = riêng ?? phòng ?? `'default'`. Máy phát luôn dùng chủ đề phòng.
- `default` = trang phòng hiện tại, **không đổi gì** (kể cả nền mờ theo ảnh bìa `Backdrop` + `useRoomMood`). Chủ đề khác: tắt `useRoomMood` và `Backdrop`, nền do chủ đề vẽ.
- Icon chỉ lucide; emoji chỉ ở hàng thả cảm xúc. Mọi emoji / ký tự trong mockup vintage (⤴ ⟲ ⇥ ✅ ❌ 🗳 ⏭ 🎧 🔖 ⧉ 📌 ✉ 📢 ♡ ◉ 👥 ＋ 🔍 ♪) → icon lucide tương ứng.
- Font: chỉ `next/font/google` trong thư mục của chủ đề, `subsets: ['latin', 'vietnamese']`, `preload: false`, `display: 'swap'` (build sẽ lỗi nếu font không có tiếng Việt). Thay: Pixelify Sans → **VT323** (cả tiêu đề), Big Shoulders Display → **Big Shoulders**. Không import font chủ đề ở file nào ngoài `src/themes/<id>/`.
- Tương phản WCAG AA: chữ thường ≥ 4.5:1, chữ lớn / icon ≥ 3:1 (đo các cặp: paper/panel, sage/panel, sage/dial, amber-ink/amber, paper/dial).
- `prefers-reduced-motion`: không quay / chạy chữ / lật chữ (global rule trong `globals.css` đã cắt animation; dòng chữ chạy phải thành danh sách tĩnh, không chỉ đứng yên giữa chừng).
- Nhãn aria / trình đọc màn hình giữ tên chuẩn ("Trò chuyện", "Tiếp theo"…); tên theo chủ đề ("Sổ lời nhắn", "Phím đài"…) chỉ là chữ hiển thị.
- Điện thoại: mọi chủ đề giữ **nút chat nổi** (`ChatOverlay`), 3 tab dưới đáy, `SkipVote` nổi. Máy tính (≥1024px) chủ đề không phải `default`: bỏ phiếu nằm trong sân khấu (ẩn `SkipVote` nổi bằng `lg:hidden`).
- Bump `CONTRACTS_VERSION` (fetch server `origin/develop` ngay trước; số đã dùng thì lấy số kế), client `npm run contracts:sync`.
- Không test tự động (quy ước dự án): mỗi task kết thúc bằng `npm run lint && npm run typecheck` (client) / `npm run lint && npm run typecheck` (server) + xem trên dev. DB dev phải là `localhost:55432/musicroom`. Không commit / push khi chưa được phép — tiến độ ghi ở ledger.
- Nhánh: server `feat/themes` từ `origin/develop`; client `feat/themes` tạo từ `feat/inline-chat` **giữ nguyên thay đổi chưa commit** (khi được phép commit: commit inline-chat trước, themes sau).

## Review Focus

1. Admin đổi chủ đề phòng trong lúc ô "Cài đặt phòng" đang sửa dở → bấm "Lưu cài đặt" **không** ghi đè chủ đề cũ (form không gửi `theme`) — Task 3 kiểm.
2. Đổi chủ đề khi đang mở hộp thoại / menu ⋯ / đang nghe cùng / mini player → không mất trạng thái nghe cùng, PiP đổi màu theo, không lỗi console — Task 5 + Task 15 kiểm.
3. Trạng thái biên ở mọi chủ đề: không có bài, hàng chờ trống, tên bài rất dài (2 dòng, không tràn), không lời bài hát, không lời chúc, thời lượng không rõ (`durationSec` 0), thành viên thường (không thấy nút quản trị), máy chỉ xem (`isDevice`) — mỗi task chủ đề kiểm theo checklist chung ở Task 6.
4. Tải chậm module chủ đề (mạng 3G) → trang vẫn có header / tab / cột phải, cột trái hiện `RoomSkeleton`, không nhảy về `default` rồi giật sang — Task 5 kiểm (DevTools throttling).
5. Nhập chủ đề riêng là id lạ trong localStorage, hoặc server gửi id lạ → dùng `default`, không trắng trang — Task 2 kiểm.

---

### Task 1: Server — `theme` trong thiết lập phòng và `room:peek`

**Files:**
- Modify: `src/contracts/constants.ts` — `export const THEME_IDS = ['default','listening','hifi82','midcentury','walnut','transistor','cassette','station','astro','cosmos','saigon','pixel','synthwave'] as const;`
- Modify: `src/contracts/schemas.ts` — `ThemeIdSchema = z.enum(THEME_IDS)`, `export type ThemeId`; `RoomSettingsSchema.theme: ThemeIdSchema`; `DEFAULT_SETTINGS.theme = 'default'`.
- Modify: `src/contracts/events.ts` — `'room:peek': { name; memberCount; onlineCount; theme: ThemeId }`.
- Modify: `src/contracts/version.ts` — bump.
- Modify: `src/state/settings.ts` — `readSettings`: trước khi parse, nếu `merged.theme` không thuộc `THEME_IDS` thì đặt `'default'`.
- Modify: `src/members/members.service.ts` — `peek()` trả thêm `theme: readSettings(room.settings).theme`; `updateSettings()`: patch chỉ có `theme` → ghi hoạt động `'đã đổi giao diện phòng'` thay cho `'đã thay đổi cài đặt phòng'` (cùng kind `settings_change`).

**Interfaces:**
- Produces: `THEME_IDS`, `ThemeId`, `ThemeIdSchema`, `RoomSettings.theme`, `'room:peek'` result `.theme` (client đọc qua contracts sync).

- [ ] **Step 1:** `git fetch origin && git switch -c feat/themes origin/develop`; đọc `CONTRACTS_VERSION` trên `origin/develop`, bump lên số kế.
- [ ] **Step 2:** Sửa các file trên.
- [ ] **Step 3:** `npm run lint && npm run typecheck` → không lỗi. Build kiểm bằng `npx tsc -p tsconfig.build.json --outDir <scratchpad>/build-check` (không chạy `npm run build` khi dev server đang watch).
- [ ] **Step 4:** Probe trên dev (`scratchpad/probe-theme.cjs`, socket.io-client như các probe trước; xác nhận DB `localhost:55432`):
  - admin `room:settings {theme:'astro'}` → ok, snapshot mới có `room.settings.theme === 'astro'`, nhật ký có "đã đổi giao diện phòng";
  - `room:settings {theme:'nope'}` → `VALIDATION`; thành viên thường đổi → `FORBIDDEN`;
  - `room:peek` → có `theme: 'astro'`;
  - ghi tay `settings = settings || '{"theme":"gone"}'` vào một phòng thử bằng psql → snapshot đọc `theme:'default'` và các thiết lập khác (ví dụ `skipVoteWindowSec` đã đổi trước đó) **còn nguyên**.
  Expected: tất cả đúng.

### Task 2: Client — nền tảng chủ đề

**Files:**
- Run: `git switch -c feat/themes` (từ `feat/inline-chat`, giữ thay đổi chưa commit); `npm run contracts:sync`.
- Create: `src/themes/registry.ts`
- Create: `src/themes/personal.ts`
- Create: `src/themes/useTheme.ts`
- Create: `src/themes/load.ts`
- Modify: `src/hooks/useRoomMood.ts` — tham số `enabled: boolean` (false → không đặt biến, dọn biến đã đặt).
- Modify: `src/components/room/MiniPlayer.tsx` — PiP chép thêm thuộc tính `data-theme` của `<html>` (và theo dõi nó trong `MutationObserver`, cạnh `class`, `style`).
- Modify: `src/lib/settings-form.ts` — `fromForm` trả `Omit<RoomSettings, 'theme'>` (form không bao giờ gửi `theme`).

**Interfaces:**
- Produces:
  - `registry.ts`: `type ThemeFamily = 'default' | 'stage' | 'object'`; `interface ThemeMeta { id: ThemeId; name: string; group: string; scheme: 'light' | 'dark'; family: ThemeFamily; swatch: { bg: string; panel: string; accent: string; text: string } }`; `THEMES: readonly ThemeMeta[]` (13, đúng thứ tự `THEME_IDS`, màu swatch lấy từ mockup); `THEME_GROUPS: readonly string[]`; `toThemeId(v: unknown): ThemeId` (lạ → `'default'`); `themeMeta(id: ThemeId): ThemeMeta`.
  - `personal.ts`: `PERSONAL_THEME_KEY = 'mr:theme'`; `usePersonalTheme(): ThemeId | 'room'` (`useSyncExternalStore`, nghe cả sự kiện `storage` để tab khác đổi theo; server snapshot `'room'`); `setPersonalTheme(v: ThemeId | 'room'): void`.
  - `useTheme.ts`: `useRoomTheme(): ThemeId` (snapshot `room.settings.theme` qua `toThemeId`, chưa có snapshot → `'default'`); `useEffectiveTheme(): ThemeId`; `useApplyTheme(id: ThemeId, fontClass?: string): void` — đặt `document.documentElement.dataset.theme = id` (`'default'` → xoá thuộc tính), `style.colorScheme` theo `scheme`, `meta[name=theme-color]` = `swatch.bg`, thêm `fontClass` (chuỗi class biến font) vào `<html>`; dọn hết khi unmount / đổi id.
  - `load.ts`: `interface ThemeModule { Stage: React.ComponentType; header?: RoomHeaderSlots; chat?: InlineChatSkin; Decor?: React.ComponentType; HostDial?: React.ComponentType; HostVoteMeter?: React.ComponentType<VoteMeterProps>; fontClass: string }`; `loadTheme(id: Exclude<ThemeId, 'default'>): Promise<ThemeModule>` (một `switch` 12 nhánh `import('./<id>')`, mỗi module `export default`); `useThemeModule(id: ThemeId): ThemeModule | null` (cache theo id; `'default'` → `null`). Các kiểu `RoomHeaderSlots`, `InlineChatSkin`, `VoteMeterProps` do Task 4 định nghĩa — ở task này khai báo tạm trong `load.ts` rồi Task 4 chuyển về nơi định nghĩa.

- [ ] **Step 1:** Viết các file trên. `load.ts` ở task này chỉ cần nhánh trả `Promise.reject` cho id chưa có module (các task chủ đề thêm dần nhánh `import()`); `useThemeModule` khi lỗi tải → trả `null` và `console.error`.
- [ ] **Step 2:** `src/app/r/[code]/page.tsx` và `host/page.tsx`: gọi `useApplyTheme(effective)` / `useApplyTheme(roomTheme)`; `useRoomMood(theme === 'default')`; `Backdrop` chỉ render khi `'default'`.
- [ ] **Step 3:** `npm run lint && npm run typecheck` → sạch.
- [ ] **Step 4:** Dev, trình duyệt: `localStorage['mr:theme']='astro'` + tải lại → `<html data-theme="astro">`, nền mờ ảnh bìa tắt; `'zzz'` → không có `data-theme`, trang như cũ; `'room'` → theo phòng; mở 2 tab, đổi ở tab 1 → tab 2 đổi theo. PiP mở khi `data-theme` có → `<html>` của PiP có cùng `data-theme`.

### Task 3: Chọn chủ đề (riêng + của phòng) và hộp vào phòng

**Files:**
- Create: `src/themes/ThemePicker.tsx` — `ThemeGrid({ value, onPick, followRoom? }: { value: ThemeId | 'room'; onPick: (v: ThemeId | 'room') => void; followRoom?: { roomTheme: ThemeId } })`: lưới thẻ xem trước (ô màu từ `swatch` + tên), nhóm theo `THEME_GROUPS`, thẻ đầu "Theo phòng (<tên>)" khi có `followRoom`; `role="radiogroup"`, mỗi thẻ `role="radio"` + `aria-checked`, điều khiển bằng phím mũi tên. `ThemeDialog({ onClose })` = `Dialog` + `ThemeGrid` cho chủ đề riêng (chọn → `setPersonalTheme`, áp dụng ngay, không đóng hộp).
- Modify: `src/components/room/RoomHeader.tsx` — nút `IconButton` "Giao diện" (`Palette`) trước nút chia sẻ, mở `ThemeDialog` (dynamic import).
- Modify: `src/components/room/SettingsPanel.tsx` — mục "Giao diện của phòng" (trên form, ngoài `<form>`): `ThemeGrid` không có `followRoom`; chọn → `act('room:settings', { theme })`, toast "Đã đổi giao diện phòng".
- Modify: `src/components/room/JoinDialog.tsx` — kết quả `room:peek` có `theme` → `useApplyTheme(peekTheme)` khi người dùng không có chủ đề riêng (hộp vào phòng mang màu phòng).
- Modify: `src/i18n/vi.ts` — `vi.theme = { button: 'Giao diện', title: 'Giao diện', followRoom: (name: string) => \`Theo phòng (${name})\`, roomTitle: 'Giao diện của phòng', roomHint: 'Mặc định cho mọi người và màn hình máy phát. Ai cũng có thể chọn giao diện riêng cho máy mình.', saved: 'Đã đổi giao diện phòng' }`.

**Interfaces:**
- Consumes: Task 2 `THEMES`, `usePersonalTheme`, `setPersonalTheme`, `useRoomTheme`.
- Produces: `ThemeGrid`, `ThemeDialog`.

- [ ] **Step 1:** Viết các thay đổi trên.
- [ ] **Step 2:** `npm run lint && npm run typecheck` → sạch.
- [ ] **Step 3:** Dev, 2 trình duyệt (admin + thành viên): admin chọn "Chiêm tinh" → thành viên đang "Theo phòng" đổi ngay; thành viên chọn riêng "Sài Gòn xưa" → giữ khi admin đổi tiếp, giữ sau tải lại và khi vào phòng khác; chọn lại "Theo phòng" → quay về chủ đề phòng. Review Focus 1: admin mở form cài đặt, đổi số phiếu nhưng chưa lưu, (tab khác) đổi chủ đề phòng, quay lại bấm "Lưu cài đặt" → chủ đề phòng **không** đổi lại. Bàn phím: Tab vào lưới, mũi tên chọn, Enter/Space áp dụng.

### Task 4: Tách logic dùng chung (không đổi giao diện `default`)

**Files:**
- Create: `src/components/room/stage/useNowPlayingActions.ts` — `useNowPlayingActions(): NowPlayingActions | null` (null khi không có bài): `{ np, track, playing, picker: string | null, pickerLabel: string, canVote, canControl, isAdmin, voted, keptSec, voteLabel: string, voteSkip(): void, togglePlay(): void, skipNow(): Promise<void>, skipping: boolean, openBlockMenu(): void, blockMenu: React.ReactNode }` — chuyển nguyên logic từ `NowPlayingCard` (optimistic, nhãn bỏ qua, chặn bài).
- Create: `src/components/room/stage/useSkipVoteState.ts` — `useSkipVoteState(): SkipVoteState` = `{ open: boolean, result: { kind: 'skipped' | 'kept'; title: string } | null, np, leftMs, totalMs, seconds, votes, required, against, mine: 'yes' | 'no' | null, canVote, asksLabel: string, vote(approve: boolean): void, dismissed: boolean, dismiss(): void }` — chuyển từ `SkipVote` (+ `useVoteResult`); `export interface VoteMeterProps { leftMs: number; totalMs: number; votes: number; required: number; against: number; seconds: number }`.
- Create: `src/components/room/stage/useLiveProgress.ts` — `useLiveProgress(target: React.RefObject<HTMLElement | null>, time?: React.RefObject<HTMLElement | null>): { durationSec: number; known: boolean } | null` — đặt `--p` (0…1) 4 lần/giây lên `target`, cập nhật chữ thời gian ở `time`; chuyển vòng `tick` từ `LiveDial` (giữ hiệu ứng "sweep" khi đổi bài như cũ).
- Create: `src/components/room/stage/useQueueView.ts` — `useQueueView(): { items: QueueItemView[]; adding: AddOp[]; me: MemberView | null; openMenu(item: QueueItemView): void; menus: React.ReactNode }` — chuyển `menuFor / wishFor / blockFor` + `ItemMenu` + `WishSheet` + `BlockDialog` từ `QueueList`; export thêm `HeartButton({ item, me })` (nút tim hiện tại) và `hasItemMenu(item, me): boolean`.
- Modify: `NowPlayingCard.tsx`, `SkipVote.tsx` (+ prop `meter?: React.ComponentType<VoteMeterProps>` thay `Drain` khi có), `TuningDial.tsx` (`LiveDial` dùng `useLiveProgress`), `QueueList.tsx` — dùng các hook trên, giao diện giữ nguyên từng pixel.
- Modify: `src/components/room/Lyrics.tsx` — `HostLyrics` → `InlineLyrics({ trackId, size: 'host' | 'stage', storageKey })` (host: `'mr:host-lyrics'` như cũ; stage: `'mr:room-lyrics'`, 3 dòng: trước / đang hát / sau); vẫn chỉ hiện khi có lời đồng bộ. Giữ export `HostLyrics` = `InlineLyrics size="host"` cho trang máy phát.
- Modify: `src/components/room/Chat.tsx` — `export interface InlineChatSkin { title?: string; placeholder?: string; variant?: string }`; `InlineChat(props: InlineChatSkin)` (tiêu đề hiển thị + `aria-label` chuẩn "Trò chuyện"; `data-variant` trên `<section>` để CSS chủ đề tạo kiểu); `ChatComposer` nhận `placeholder`; `ChatOverlay({ variant?: string })` (`data-variant`).
- Modify: `src/components/room/RoomHeader.tsx` — `export interface RoomHeaderSlots { title?: React.ReactNode /* thay <h1> chữ thường, vẫn bọc trong <h1> */; code?: React.ReactNode /* thay hiển thị mã, vẫn là nút sao chép */; extra?: React.ReactNode /* trước các nút icon */; variant?: string }`; `RoomHeader({ onOpenLog, ...slots })`.

**Interfaces:**
- Produces: tất cả tên / kiểu trong mục Files ở trên; các task chủ đề chỉ dùng chúng, không chép logic.

- [ ] **Step 1:** Viết hook, chuyển logic, sửa component cũ dùng hook.
- [ ] **Step 2:** `npm run lint && npm run typecheck` → sạch.
- [ ] **Step 3:** Dev, chủ đề `default`, so trước / sau (chụp màn hình 1440 và 375): thẻ Đang phát, bỏ phiếu (mở phiếu, ✅/❌, "Để sau", kết quả), tạm dừng / qua ngay, chặn bài đang phát, hàng chờ (tim, ⋯ ghim / lời chúc / xoá / chặn), máy phát (lời bài hát, dial, banner bỏ phiếu) → giống hệt, không lỗi console.

### Task 5: `RoomFrame` và nạp module chủ đề

**Files:**
- Create: `src/components/room/RoomFrame.tsx` — `RoomFrame({ code, stage, header, chat, decor, inlineVote }: { code: string; stage: React.ReactNode; header?: RoomHeaderSlots; chat?: InlineChatSkin; decor?: React.ReactNode; inlineVote: boolean })`: toàn bộ khung đang nằm trong `page.tsx` (tab, cột phải `InlineChat` + Thêm bài / Mọi người, `ChatOverlay` `lg:hidden`, thanh tab đáy, `HeartCanvas`, `MiniPlayerPortal`, `ActivityLog`, `JoinDialog`, `PlayerEngine` cho thành viên có quyền phát, `ListenAlong`, `Banners`); `SkipVote` bọc `lg:hidden` khi `inlineVote`; `chat` truyền cho cả `InlineChat` và `ChatOverlay variant={chat?.variant}`. `decor` render trước `<main>` (nền / dải trang trí, `aria-hidden`, `pointer-events-none`).
- Modify: `src/app/r/[code]/page.tsx` — `effective = useEffectiveTheme()`; `mod = useThemeModule(effective)`; `useApplyTheme(effective, mod?.fontClass)`; `default` → `stage` = `NowPlayingCard` + `ListenAlong` + `QueueList` + `Suggestions` (như hiện nay); chủ đề khác → `mod ? <mod.Stage/> : <RoomSkeleton/>`, `header={mod?.header}`, `chat={mod?.chat}`, `decor={mod?.Decor && <mod.Decor/>}`, `inlineVote`.

**Interfaces:**
- Consumes: Task 2 `useEffectiveTheme`, `useThemeModule`, `useApplyTheme`; Task 4 `RoomHeaderSlots`, `InlineChatSkin`.
- Produces: `RoomFrame` — mọi module chủ đề chỉ cấp `Stage` / `header` / `chat` / `Decor`.

- [ ] **Step 1:** Tách `RoomFrame`; `page.tsx` còn chọn chủ đề + ghép.
- [ ] **Step 2:** `npm run lint && npm run typecheck` → sạch.
- [ ] **Step 3:** Dev: `default` y như trước (so ảnh Task 4). Review Focus 4: đặt chủ đề riêng = id đã có module ở task sau (tạm thời: kiểm `RoomSkeleton` hiện ở cột trái khi module lỗi tải, header / tab / cột phải vẫn dùng được). Review Focus 2: đang nghe cùng + mở mini player, đổi chủ đề → vẫn đang nghe, PiP đổi màu.

### Task 6: Khung "sân khấu" + chủ đề `listening`

**Files:**
- Create: `src/themes/stage/StageLayout.tsx` — `StageLayout({ cover, dial, vote, queue, kicker, aside, className }: { cover: React.ReactNode; dial: React.ReactNode; vote: (s: SkipVoteState) => React.ReactNode; queue?: React.ReactNode; kicker?: string; aside?: React.ReactNode; className?: string })`. Thứ tự (máy tính): nhãn "Đang phát" (`OnAirLamp`, hoặc `kicker`), hàng [`cover` | tên bài display lớn (2 dòng tối đa) + nghệ sĩ/kênh + người chọn + `LyricsButton`], `dial`, `StageControls`, `vote(state)` khi `state.open`, `WishBlock`, `InlineLyrics size="stage"`, `aside`, `queue ?? <StageQueue/>`, `Suggestions`. Không có bài → `StageIdle` (cùng chữ với `NowPlayingCard` idle). Điện thoại (< lg): cover nhỏ hơn đặt trên tên bài, lời bài hát ẩn (vẫn có `LyricsButton`), bỏ phiếu do `SkipVote` nổi lo.
- Create: `src/themes/stage/StageControls.tsx` — các nút từ `useNowPlayingActions` (Bỏ qua, Nghe cùng, Lưu, Thu nhỏ, ⋯ chặn bài cho admin, Tạm dừng / Qua ngay cho người có quyền), class `stage-controls` + `data-variant` để CSS chủ đề tạo kiểu (viên thuốc / phím vuông icon-trên-chữ / nút game…); nút chỉ có icon có `aria-label` + `title`.
- Create: `src/themes/stage/StageQueue.tsx` — `StageQueue({ numbered, variant, title }: { numbered?: boolean; variant?: string; title?: string })`: danh sách từ `useQueueView` (ảnh, tên, người chọn, icon ghim / thư, `HeartButton`, `SaveButton`, ⋯), hàng chờ trống → nút "Thêm bài đầu tiên" như `QueueList`.
- Create: `src/themes/stage/parts.tsx` — `WishBlock`, `StageTitle`, `StageIdle`, `CoverImage({ size, round }: { size: number; round?: boolean })` (thumbnail chất lượng cao: `ytThumb` bản lớn nếu có).
- Create: `src/themes/listening/{index.tsx, theme.css, fonts.ts}` — Fraunces; token + trang trí theo mockup "1 · Phòng nghe nhạc"; `Stage` = `StageLayout` với cover đĩa than hé sau bìa vuông, dial vạch, vote khung viền mảnh + thanh đếm ngược.
- Modify: `src/themes/load.ts` — nhánh `listening`.

`theme.css` của mỗi chủ đề: `html[data-theme='<id>'] { --color-dial … --color-online; --radius-panel; --radius-row; --font-display-face: var(--font-<x>); --font-body: … }` + mọi class trang trí đặt dưới `html[data-theme='<id>']` (không rò sang chủ đề khác). Đặt cả biến cho hộp thoại / toast (chúng dùng cùng token).

**Checklist kiểm mỗi chủ đề (dùng lại ở Task 7–14):**
1. 1440 + 1280 + 375: so với mockup (bố cục, trang trí, chữ), không tràn ngang.
2. Đi hết danh sách chức năng trong "Điều không được để xảy ra" của spec (bấm thử từng cái), cả quyền admin và thành viên thường.
3. Biên (Review Focus 3).
4. Tương phản AA các cặp ở Global Constraints (đo bằng script JS trong trang: đọc `getComputedStyle(document.documentElement)` các biến, tính tỉ lệ).
5. `prefers-reduced-motion` (DevTools Rendering) → không còn chuyển động trang trí.
6. Network: chỉ font của chủ đề này được tải; đổi về `default` không tải thêm font.
7. Không lỗi console.

- [ ] **Step 1:** Viết khung + `listening`.
- [ ] **Step 2:** `npm run lint && npm run typecheck` → sạch.
- [ ] **Step 3:** Checklist cho `listening`.

### Task 7: `hifi82` + `midcentury`

**Files:** `src/themes/hifi82/*`, `src/themes/midcentury/*` (cấu trúc như `listening`); `load.ts` thêm 2 nhánh.
- `hifi82` (sáng, Barlow + Barlow Condensed): dial = màn LCD hổ phách (`useLiveProgress`, số `mm:ss` + vạch đoạn theo `--p`), đèn tín hiệu cam, `StageControls data-variant="keys"` (phím vuông, icon trên chữ, phím đang tác dụng sáng cam), vote viền cam trong mặt máy, `StageQueue numbered`.
- `midcentury` (Archivo `wdth 75`): cover bìa tròn trên mặt trời vàng + vòng cam lồng nhau, nút viên thuốc, `StageQueue variant="round"` (bìa tròn nhỏ, gạch chân mảnh), chat khối xanh đậm, tin của mình cam.

- [ ] **Step 1:** Viết 2 chủ đề. **Step 2:** lint + typecheck. **Step 3:** Checklist Task 6 × 2.

### Task 8: `astro` + `cosmos`

**Files:** `src/themes/astro/*`, `src/themes/cosmos/*`; `load.ts`.
- `astro` (Cormorant Garamond + Be Vietnam Pro): `Decor` nền sao; cover = vòng 12 cung (SVG) quanh bìa tròn, cung vàng = thời gian (`stroke-dashoffset` theo `--p`), dial chỉ còn hàng chữ thời gian; `HostVoteMeter`/vote = trăng khuyết dần theo `leftMs/totalMs` + chữ "trăng tắt sau N giây".
- `cosmos` (Space Grotesk): `Decor` tinh vân; cover = hành tinh (bìa tròn + bóng tối) + quỹ đạo nghiêng, vệ tinh chạy theo `--p`; `aside` = "N người đang nghe cùng" vẽ thành sao (N = số thành viên `listening` trong snapshot, cùng nguồn với `ListenersStrip`; 0 → ẩn); `queue` = "Quỹ đạo tiếp theo": hàng hành tinh nhỏ dần (tối đa 6) là `<button>`, bấm mở `Dialog` thông tin bài (tên, người chọn, `HeartButton`, và nút mở ⋯ của bài đó qua `openMenu`), dưới là `StageQueue` đầy đủ; `chat = { title: 'Tín hiệu', placeholder: 'Gửi tín hiệu cho cả phòng…', variant: 'cosmos' }`.

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Checklist × 2; hàng hành tinh dùng được bằng bàn phím.

### Task 9: `saigon`

**Files:** `src/themes/saigon/*`; `load.ts`.
- Sáng; Bungee (biển hiệu, tiêu đề) + Patrick Hand (chữ viết tay: bảng phấn, lời chúc, thời gian) + Be Vietnam Pro.
- `Decor` dải gạch bông đầu trang; `header.title` = biển hiệu tên phòng (khung xanh ngọc, viền vàng, bóng đỏ gạch) trong `<h1>`; cover trong khung có bóng xanh ngọc; dial băng giấy đỏ gạch; `queue` = `StageQueue variant="chalk"` trong bảng phấn khung gỗ (chữ viết tay, vẫn đủ tim / ⋯ / ghim / thư); lời chúc kiểu thiệp viết tay.

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Checklist; riêng chữ viết tay đọc rõ dấu tiếng Việt ở 375.

### Task 10: `pixel` + `synthwave`

**Files:** `src/themes/pixel/*`, `src/themes/synthwave/*`; `load.ts`.
- `pixel` (VT323 cho tiêu đề và số, Be Vietnam Pro cho chat / nội dung dài): cover trong khung màn hình game; dial = thanh máu từng ô (16 ô, số ô sáng theo `--p`); vote = thanh máu boss, mỗi ô một phiếu đồng ý (`required` ô, sáng `votes` ô) + chữ "Boss: <người> muốn qua bài"; `kicker` "Màn 1: đang phát"; `StageQueue title="Màn tiếp theo"`; `header.extra` = "x N người" (N = `snapshot.onlineCount`); nút bóng đổ cứng (`data-variant="pixel"`).
- `synthwave` (Exo 2 nghiêng đậm cho tiêu đề): `Decor` + cover = mặt trời sọc trên lưới chân trời sau bìa viền neon; tên bài nghiêng phát sáng; dial dải neon chuyển màu; vote = số LED đếm ngược phát sáng.

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Checklist × 2.

### Task 11: `walnut` (Tủ hi-fi gỗ óc chó)

**Files:** `src/themes/walnut/{index.tsx, WalnutStage.tsx, theme.css, fonts.ts}`; `load.ts`.
- `Stage` riêng (không dùng `StageLayout`), lắp từ `useNowPlayingActions`, `useSkipVoteState`, `useLiveProgress`, `useQueueView`, `InlineLyrics`, `WishBlock`, `Suggestions` (dữ liệu từ hook của `Suggestions`, hoặc dùng nguyên component trong khung "đĩa gợi ý"):
  - mâm đĩa than quay (bìa ở nhãn đĩa, quay khi `PLAYING`, dừng khi tạm dừng) + cần đĩa; tên + người chọn + tim + lời chúc bên phải mâm;
  - kim VU (góc kim theo `--p`) trên mặt kính xanh;
  - dải bỏ phiếu đỏ có đếm ngược + nút đồng ý / nghe tiếp (icon lucide `Check`, `X`);
  - lời bài hát 3 dòng dưới mâm; nút đồng thau (`StageControls data-variant="brass"`);
  - "Chồng đĩa tiếp theo": hàng bìa vuông cuộn ngang, mỗi đĩa có tim + ⋯ (`openMenu`), đĩa gợi ý cuối có nhãn "gợi ý" + nút Thêm.
- `chat = { title: 'Sổ lời nhắn', variant: 'walnut' }`. Điện thoại: theo bản điện thoại trong mockup.

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Checklist.

### Task 12: `transistor` (Đài bán dẫn)

**Files:** `src/themes/transistor/*`; `load.ts`.
- Mặt kính dò sóng hổ phách đầu sân khấu, kim đỏ chạy theo `--p` (số phút in trên thang như `DialScale`); tên bài, người chọn, thời gian; lời chúc + lời bài hát; ô đèn hổ phách cho bỏ phiếu; nút chính là núm vặn có chữ (Bỏ qua đỏ); "Phím đài · Tiếp theo": các phím màu ngà, mỗi phím một bài (tên ngắn + người chọn + tim), ⋯ trong mỗi phím; phím "Thêm bài hoặc gợi ý" mở `Dialog` chứa `Suggestions`.
- `header.variant = 'chrome'`: nút chia sẻ / lịch sử / rời phòng có chữ bên cạnh icon trên thanh crôm.
- `chat = { title: 'Thư thính giả', placeholder: 'Gửi thư cho cả phòng…', variant: 'transistor' }` (lưới loa sau khung thư; DJ pads trong khung như `InlineChat` sẵn có).

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Checklist.

### Task 13: `cassette` (Băng cassette tự thu)

**Files:** `src/themes/cassette/*`; `load.ts`.
- Patrick Hand (viết tay) + Bungee (nhãn dập nổi, chữ in hoa ngắn) + Be Vietnam Pro.
- Nhãn băng viết tay "Mặt A" cho bài đang phát; cửa sổ băng 2 cuộn quay (cuộn trái nhỏ dần, phải lớn dần theo `--p`; quay khi `PLAYING`); thanh thời gian; phím cơ có nhãn chữ, lún khi bấm (`StageControls data-variant="tape"`); bỏ phiếu khung "BỎ PHIẾU"; lời chúc giấy note vàng viết tay; lời bài hát; "Mặt B · Tiếp theo" = bìa băng (J-card) đánh số, mỗi dòng tim + ⋯, gợi ý là dòng viết tay cuối bìa (nút Thêm).
- `header.variant = 'dymo'` (chia sẻ / lịch sử là nhãn dập nổi, vẫn kèm icon); tab Thêm bài / Mọi người ở cột phải kiểu nhãn dập nổi (CSS qua `data-theme` trên `TabList` pill).
- `chat = { variant: 'cassette' }` — tin nhắn là giấy note nhiều màu; cửa sổ chat nổi trên điện thoại cũng kiểu giấy note.

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Checklist.

### Task 14: `station` (Bảng giờ tàu nhà ga)

**Files:** `src/themes/station/{index.tsx, StationStage.tsx, FlipText.tsx, eta.ts, Ticker.tsx, theme.css, fonts.ts}`; `load.ts`.
- `FlipText({ text, className }: { text: string; className?: string })` — mỗi ký tự một ô chữ lật; đổi chữ → lật lần lượt (reduced-motion: đổi ngay); `aria-label` = chữ đầy đủ, ô con `aria-hidden`.
- `header.title` = `FlipText` tên phòng, `header.code` = `FlipText` mã phòng (vẫn là nút sao chép), `header.extra` = đồng hồ `HH:mm` (cập nhật mỗi phút).
- Bài đang phát chữ lật lớn, nhãn "Đang phát · Sân ga 1"; dial; nút; bỏ phiếu nút vàng nổi bật; lời chúc + lời bài hát.
- `eta.ts`: `etaTimes(now: number, np: { positionSec: number; durationSec: number } | null, queue: { track: { durationSec: number } }[]): (number | null)[]` — giờ dự kiến mỗi bài (ms epoch) = `now + (np.durationSec − np.positionSec) + Σ thời lượng các bài trước`; gặp bài thời lượng 0 / không rõ → bài đó và mọi bài sau là `null` (hiện "—").
- "Tiếp theo" = bảng giờ khởi hành: cột Dự kiến / Bài / Người chọn / Ghi chú (icon ghim, thư, tim) + ⋯; gợi ý là dòng mờ cuối bảng có nút Thêm. Điện thoại: 2 cột (Dự kiến, Bài + người chọn) như mockup.
- `Ticker` (chỉ máy tính, trên khung chat): loa nhà ga chạy 5 tin chat mới nhất "Tên: nội dung"; reduced-motion → danh sách tĩnh 2 dòng; `aria-hidden` (khung chat bên dưới đã đọc được).
- `chat = { variant: 'station' }`; ticker đặt qua `aside` của khung hoặc phần trên `chat` — builder chọn, miễn đúng vị trí mockup.

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Checklist; thêm: kiểm `etaTimes` bằng tay trên dev (hàng chờ 3 bài có thời lượng → giờ tăng đúng; thêm một bài không rõ thời lượng ở giữa → từ bài đó "—").

### Task 15: Máy phát theo chủ đề phòng

**Files:**
- Modify: `src/app/r/[code]/host/page.tsx` — `roomTheme = useRoomTheme()` (không đọc chủ đề riêng); `mod = useThemeModule(roomTheme)`; `useApplyTheme(roomTheme, mod?.fontClass)`; `Decor` của chủ đề; dial = `mod?.HostDial ? <mod.HostDial/> : <LiveDial size="large"/>`; `SkipVote variant="host" meter={mod?.HostVoteMeter}`; thẻ QR: `fgColor` / `bgColor` theo token (`--color-dial` / `--color-paper` đọc từ `getComputedStyle`), danh sách "Tiếp theo" tạo kiểu bằng CSS chủ đề (`data-theme`). Khung video giữ nguyên.
- Mỗi module chủ đề: export `HostDial` (họ sân khấu: dial / vòng cung / quỹ đạo / thanh máu / LCD / neon cỡ lớn; họ đồ vật: kim VU, mặt dò sóng, cuộn băng, đồng hồ chữ lật) và `HostVoteMeter` khi chủ đề có kiểu bỏ phiếu riêng — dùng lại đúng component đã viết ở trang phòng với prop cỡ lớn, không viết lại.

- [ ] **Step 1:** Viết. **Step 2:** lint + typecheck. **Step 3:** Dev, máy phát 1920×1080 và 1366×768 với cả 13 chủ đề: dial / bỏ phiếu đúng kiểu, QR quét được (đủ tương phản), không tràn; đổi chủ đề phòng → máy phát đổi ngay; máy phát không đổi theo `mr:theme` của trình duyệt đó.

### Task 16: Rà soát toàn nhánh

- [ ] **Step 1:** Client `npm run lint && npm run typecheck && npm run build` (tắt `next dev` trước khi build, mở lại sau); server lint + typecheck + `tsc -p tsconfig.build.json --outDir <scratchpad>`.
- [ ] **Step 2:** Build: kiểm kích thước chunk trang `/r/[code]` không tăng đáng kể so với trước (`.next` build output) — code + font + CSS chủ đề nằm ở chunk riêng.
- [ ] **Step 3:** Chạy lại checklist Task 6 nhanh cho cả 13 chủ đề (ảnh 1440 + 375 gửi người dùng), và Review Focus 1–5.
- [ ] **Step 4:** Reviewer mới (model mạnh nhất) đọc toàn nhánh client + server theo spec + plan; sửa Critical / Important; báo người dùng. Không commit / push khi chưa được phép.
