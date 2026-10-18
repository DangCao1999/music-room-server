# Đa ngôn ngữ (tiếng Anh) — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi thiết bị tự chọn Tiếng Việt / English cho toàn bộ app; nhật ký hoạt động, tổng kết và Hỏi DJ theo ngôn ngữ người dùng; link chia sẻ mang ngôn ngữ người chia sẻ.

**Architecture:** Server thêm tham số có cấu trúc cho nhật ký (cột `metadata` có sẵn) và nhận `language` trong `room:recap` / `dj:ask`. Client có kho ngôn ngữ thiết bị (`mr:lang`), từ điển `vi` + `en` cùng kiểu `Dict`, hook `useT()` cho component và `tr()` cho mã ngoài React; mọi chữ viết thẳng đưa vào từ điển.

**Tech Stack:** Next.js 16 / React 19 / Tailwind 4 (client), NestJS + Prisma + Socket.IO + zod (server), contracts dùng chung (server là gốc, client chép bằng `npm run contracts:sync`).

**Spec:** `music-room-server/docs/specs/2026-10-17-i18n-english-design.md`

## Global Constraints

- Ngôn ngữ: `'vi' | 'en'`; localStorage `mr:lang`; không có giá trị = `'vi'`. **Không có ngôn ngữ của phòng.**
- Không tự đoán theo trình duyệt. Thiết bị chưa chọn chỉ nhận ngôn ngữ từ đuôi link `?lang=en|vi`.
- Mọi trường contract mới đều **tuỳ chọn**; client/server cũ–mới phải chạy được với nhau.
- `CONTRACTS_VERSION`: **`git fetch origin` và xem `origin/develop` của server trước khi tăng**; client chạy `npm run contracts:sync`.
- Chuẩn hoá chữ tìm kiếm (`contracts/text.ts`, `toLocaleLowerCase('vi')`) giữ nguyên.
- Không đổi: giọng đọc / lời MC (dự án riêng), Slack, dữ liệu đã lưu, câu tiếng Việt hiện có.
- **Không viết test tự động** (quy ước dự án). Mỗi task kiểm bằng `npm run lint && npm run typecheck` (+ `npm run build` ở task cuối mỗi repo) và chạy thử trên dev. DB dev: `localhost:55432/musicroom`.
- **Không commit / push / mở PR** khi chưa được người dùng cho phép; làm trên nhánh tính năng, giữ thay đổi chưa commit cho tới khi được duyệt.
- Tiếng Anh tự nhiên, ngắn gọn; giữ nguyên tên riêng Music Room, ON AIR, DJ. Số nhiều tiếng Anh đúng (`1 song` / `2 songs`).

## Review Focus

1. Thiết bị chưa từng chọn ngôn ngữ (không có `mr:lang`, link không có `?lang`) → phải là tiếng Việt ở mọi trang, kể cả `/host`. → kiểm ở Task 4.
2. Dòng nhật ký cũ (không có `metadata`) và dòng có `params` thiếu khoá / `variant` lạ → hiện `message` đã lưu, không trống, không lỗi. → kiểm ở Task 9.
3. Đổi ngôn ngữ khi đang trong phòng → mọi phần đang hiển thị (kể cả hộp thoại đang mở, banner, toast mới, theme đang dùng) đổi ngay, không cần tải lại; không còn chữ đọc từ `vi` ở cấp module. → kiểm ở Task 6.
4. Link `?lang=en` mở trên thiết bị **đã chọn** tiếng Việt → vẫn tiếng Việt; trên thiết bị mới → lưu `'en'`. Giá trị `lang` lạ bị bỏ qua. → kiểm ở Task 10.
5. Client cũ nhận `ActivityLogView.params` / server cũ không gửi `params`; `room:recap` / `dj:ask` không có `language` → mặc định `'vi'`, không lỗi `VALIDATION`. → kiểm ở Task 1–3 và Task 11.

---

## Phần 1 — Server (`music-room-server`, nhánh `feat/i18n-server`)

### Task 1: Contracts

**Files:**
- Modify: `src/contracts/schemas.ts` (`dj:ask` dòng ~240, `room:recap` dòng ~242)
- Modify: `src/contracts/snapshot.ts` (`ActivityLogView` dòng ~242, `PlaylistSummaryView` ~39, `PlaylistView` ~75)
- Modify: `src/contracts/version.ts`

**Interfaces:**
- Produces:
  - `export const LANGS = ['vi', 'en'] as const; export type Lang = (typeof LANGS)[number]; export const LangSchema = z.enum(LANGS);` (trong `schemas.ts`, export qua `src/contracts/index` như các schema khác).
  - `'dj:ask': { prompt; language?: Lang }`, `'room:recap': { since; tzOffsetMinutes; language?: Lang }`.
  - Trong `snapshot.ts`:
    ```ts
    export interface ActivityParams {
      variant?: string; title?: string; target?: string; targetDevice?: boolean;
      count?: number; yes?: number; no?: number; code?: number; actorDevice?: boolean;
    }
    // ActivityLogView thêm:
    params?: ActivityParams | null;
    // PlaylistSummaryView và PlaylistView thêm (playlist do server tạo, để client hiện tên theo ngôn ngữ):
    kind?: 'liked' | 'mix' | null;
    ```

- [ ] **Step 1:** Thêm `LANGS`/`Lang`/`LangSchema`, trường `language: LangSchema.optional()` cho hai lệnh, `ActivityParams`, `ActivityLogView.params`, `kind` của hai view playlist.
- [ ] **Step 2:** `git fetch origin && git show origin/develop:src/contracts/version.ts` — tăng `CONTRACTS_VERSION` lên số kế tiếp **sau** giá trị trên `origin/develop` (hiện `'2026-10-17.1'` → `'2026-10-17.2'` nếu chưa ai tăng).
- [ ] **Step 3:** Run: `npm run lint && npm run typecheck` — Expected: không lỗi.

### Task 2: Tham số có cấu trúc cho nhật ký

**Files:**
- Modify: `src/social/activity.service.ts` (`log(...)` dòng 19), `src/state/views.ts` (`toLogView` dòng 75)
- Modify (call site): `src/members/members.service.ts` (122–128, 207, 284–285, 338, 375, 508, 531, 583, 603, 636–684, 729–730, 796), `src/chat/chat-room.service.ts:317`, `src/queue/queue.service.ts` (187, 272–273, 298, 323–324, 353), `src/playback/playback.service.ts` (334, 350, 373, 509, 544, 627), `src/library/block.service.ts` (81, 104) — số dòng là ước lượng, tìm theo `activity.log(` và `activityLog.create`.

**Interfaces:**
- Consumes: `ActivityParams` (Task 1).
- Produces:
  - `ActivityService.log(tx, ctx, roomId, actor, type, message, params?: ActivityParams)` — lưu `metadata = { v: 1, ...params, actorDevice: actor?.isDevice || undefined }`. `actor` nhận thêm `isDevice?: boolean` (truyền từ member khi có).
  - `toLogView(l)` trả `params`: nếu `l.metadata` là object có `v === 1` thì trả các khoá của `ActivityParams` (bỏ `v`), ngược lại `null`.
  - Bảng `type` → `variant` / tham số (client Task 9 dựa đúng bảng này):

    | type | variant | tham số |
    |---|---|---|
    | room_create, user_leave, admin_claim, pin_change, player_change | — | — |
    | user_join | `join` · `device` · `slack` | — |
    | user_rejoin | `plain` · `rightsReset` | — |
    | member_kick | — | `target`, `targetDevice` |
    | permission_change | `grantControl` · `revokeControl` · `grantDj` · `revokeDj` · `grantAdmin` · `revokeAdmin` · `makePlayer` · `revokePlayer` | `target`, `targetDevice` |
    | settings_change | `theme` · `other` | — |
    | track_add | `one` · `playlist` | `title` (one) · `count` (playlist) |
    | track_remove, track_heart, track_block, track_unblock | — | `title` |
    | track_pin | `pin` · `unpin` | `title` |
    | track_skip | `by` · `votes` · `timeout` | `title`; `yes` (votes, timeout); `no` (timeout) |
    | skip_kept | — | `title`, `yes`, `no` |
    | track_error | — | `title`, `code` |

- [ ] **Step 1:** Đổi chữ ký `log` + `toLogView`; `room_create` (tạo trực tiếp bằng `tx.activityLog.create`) ghi `metadata: { v: 1 }`.
- [ ] **Step 2:** Sửa từng call site truyền `params` theo bảng; **giữ nguyên** `message` tiếng Việt.
- [ ] **Step 3:** Run: `npm run lint && npm run typecheck` — Expected: không lỗi.
- [ ] **Step 4:** Chạy dev, trong một phòng thử: thêm bài, ghim, thả tim, bỏ qua, đổi quyền, đổi giao diện. Đọc 10 dòng `ActivityLog` mới nhất ở DB dev — Expected: `metadata` có `v: 1` và đúng `variant`/tham số theo bảng; `message` không đổi. Snapshot/`activity:new` có `params`, dòng cũ có `params: null`.

### Task 3: Tổng kết, Hỏi DJ theo ngôn ngữ; `kind` của playlist

**Files:**
- Modify: `src/library/library.service.ts` (`recap` ~244, `recapComment` ~346–381, khoá cache 10 phút)
- Modify: `src/ai/dj.service.ts` (prompt ~18–24, `ask` ~37)
- Modify: `src/realtime/realtime.gateway.ts` (`dj:ask` ~652, `room:recap` ~671)
- Modify: `src/playlists/playlists.service.ts` (chỗ dựng view, ~69) và mọi chỗ khác trả `PlaylistSummaryView` / `PlaylistView`

**Interfaces:**
- Consumes: `Lang` (Task 1).
- Produces: `LibraryService.recap(..., language: Lang)`; `DjService.ask(..., language: Lang)`; gateway truyền `input.language ?? 'vi'`.

- [ ] **Step 1:** `recapComment`: system prompt bản tiếng Anh tương đương bản Việt (cùng luật: chỉ dùng số trong `facts`, P1/P2…, không emoji, JSON `{"summary":string}`, tối đa 30 từ); chọn theo `language`. Khoá cache: `roomId|since|blocked|language`.
- [ ] **Step 2:** `dj.service`: dòng "ưu tiên nhạc Việt và nhạc quốc tế phổ biến" chỉ có khi `language === 'vi'`; với `'en'` thay bằng "ưu tiên nhạc quốc tế phổ biến" (viết bằng tiếng Anh hoặc tiếng Việt trong prompt đều được — chỉ đổi thiên hướng).
- [ ] **Step 3:** View playlist: `kind = 'liked'` khi `source === 'yt:liked'`, `'mix'` khi `source === 'mix:foryou'`, ngược lại `null`. Tên lưu trong DB giữ nguyên.
- [ ] **Step 4:** Run: `npm run lint && npm run typecheck && npm run build` — Expected: không lỗi.
- [ ] **Step 5:** Dev: gửi `room:recap` có/không `language` và `language: 'en'` (qua client hoặc script socket một phiên) — Expected: không `language` → câu tổng kết tiếng Việt như cũ; `'en'` → tiếng Anh; không lỗi `VALIDATION`.

---

## Phần 2 — Client (`music-room-client`, nhánh `feat/i18n-en`)

### Task 4: Kho ngôn ngữ, kiểu từ điển, `useT` / `tr`

**Files:**
- Create: `src/i18n/lang.ts`, `src/i18n/index.ts`
- Modify: `src/i18n/vi.ts` (đầu file: bỏ ghi chú "Add en.ts later"; `errorMessage` chuyển sang `index.ts`)
- Modify: `src/app/layout.tsx` (gắn runtime đồng bộ `<html lang>`), `src/contracts/*` (`npm run contracts:sync`)

**Interfaces:**
- Consumes: contracts Task 1 (sau `contracts:sync`).
- Produces (`src/i18n/lang.ts`):
  - `export type Lang = 'vi' | 'en'` (dùng lại `Lang` từ contracts nếu tiện).
  - `getLang(): Lang` — đọc `mr:lang`, mặc định `'vi'`, bọc try/catch.
  - `setLang(l: Lang): void` — lưu + phát cho subscriber (mẫu `src/themes/personal.ts`, có sự kiện `storage`).
  - `useLang(): Lang` — `useSyncExternalStore`, server snapshot `'vi'`.
  - `adoptLangFromUrl(search: string): void` — nếu chưa có `mr:lang` và `?lang` là `'vi'|'en'` thì `setLang`.
- Produces (`src/i18n/index.ts`):
  - `export type Dict = Widen<typeof vi>` (chuỗi literal → `string`, mảng readonly giữ độ dài linh hoạt, hàm giữ chữ ký).
  - `dicts: Record<Lang, Dict>` (Task 4: `en` tạm trỏ `vi`; Task 7 thay bằng `en.ts`).
  - `useT(): Dict`, `tr(): Dict` (ngôn ngữ hiện tại, cho mã ngoài React), `errorMessage(code, params): string` (dùng `tr()`), `export type { ClientErrorCode }`.
  - `LangRuntime` (component client): gọi `adoptLangFromUrl(location.search)` một lần và đặt `document.documentElement.lang`. Gắn trong root layout cạnh `RoomRuntime`.

- [ ] **Step 1:** Viết `lang.ts`, `index.ts`, `LangRuntime`; `npm run contracts:sync`.
- [ ] **Step 2:** Run: `npm run lint && npm run typecheck` — Expected: không lỗi.
- [ ] **Step 3:** Dev: xoá `mr:lang`, mở trang chủ → `<html lang="vi">`; mở `/?lang=en` → `mr:lang = 'en'`; đặt `mr:lang='vi'` rồi mở `/?lang=en` → vẫn `'vi'`; `?lang=fr` → bỏ qua.

### Task 5: Đưa chữ viết thẳng vào `vi.ts`

**Files (Modify):** `src/themes/registry.ts`, các theme `pixel`, `hifi82`, `synthwave`, `astro`, `stage/StageVote.tsx`, `stage/dials.tsx`, `transistor`, `station`, `cassette`, `walnut`, `cosmos` (index.tsx), `src/components/legal/LegalPage.tsx`, `src/app/page.tsx` (chân trang), `src/components/ui/Dialog.tsx` (nhãn "Đóng"), `src/lib/time.ts`, `src/components/room/PeoplePanel.tsx` (`localeCompare`), `src/components/account/GoogleButton.tsx` (`locale`), `src/app/layout.tsx` + `src/lib/web-manifest.ts` (mô tả), `src/i18n/vi.ts`.

**Interfaces:**
- Produces (khoá mới trong `vi`, builder đặt tên chi tiết nhưng phải có):
  - `themes.groups: Record<ThemeGroupId, string>`, `themes.names: Record<ThemeId, string>`; `THEME_GROUPS` đổi thành mảng **id** (`'default' | 'minimal' | 'vintage' | 'sky' | 'vietnam' | 'decades'`), `ThemeMeta` bỏ `name` (hoặc giữ làm id) — UI lấy tên từ từ điển.
  - `themeText.<theme>.*` cho chữ trang trí từng theme (danh sách trong báo cáo rà: "Sân ga 1", "Mặt B · Tiếp theo", "Màn 1: đang phát", vote "đồng ý / nghe tiếp"…).
  - `legal.updated(date)`, `legal.privacy`, `legal.terms`, `legal.home`; `common.close`.
  - `time.justNow`, `time.minutesAgo(n)`, `time.hoursAgo(n)`, `time.daysAgo(n)`, `time.locale` (`'vi-VN'` / `'en-GB'`).
  - `meta.description`.
  - `lib/time.ts`: `formatClock(iso, timeZone?, locale = tr().time.locale)`, `formatAgo(iso, now?, t = tr())`.

- [ ] **Step 1:** Chuyển chữ vào `vi.ts`, đọc lại qua `tr()`/`useT()` (Task 6 làm phần lớn component; task này xử lý các file trên).
- [ ] **Step 2:** Run: `grep -rnP "[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵĐ]" src --include=*.tsx --include=*.ts | grep -v "src/i18n/\|^\s*//\|src/contracts/\|/\*"` — Expected: chỉ còn chú thích, `contracts/text.ts`, trang pháp lý (Task 8), TTS (ngoài phạm vi), dữ liệu kiểm duyệt.
- [ ] **Step 3:** `npm run lint && npm run typecheck` — Expected: không lỗi. Dev: 13 theme hiển thị như cũ bằng tiếng Việt.

### Task 6: Thay mọi chỗ dùng `vi` bằng từ điển hiện tại

**Files:** 67 file đang `import { vi } / { errorMessage, vi } / { errorMessage } / type { ClientErrorCode } from '@/i18n/vi'` (gồm `state/room-store.ts`, `hooks/useAddTrack.ts`, `hooks/useAct.ts`, `hooks/useRoomDeleted.ts`, `lib/added-by.ts`).

**Interfaces:**
- Consumes: `useT`, `tr`, `errorMessage`, `ClientErrorCode` (Task 4).

- [ ] **Step 1:** Component/hook React: `const t = useT()` rồi `t.*`. Mã ngoài React (store, lib, route Next): `tr()` **tại lúc gọi**, không đọc từ điển ở cấp module (không `const X = vi.foo` ngoài hàm).
- [ ] **Step 2:** Run: `grep -rn "from '@/i18n/vi'" src | grep -v "src/i18n/"` — Expected: không còn dòng nào.
- [ ] **Step 3:** `npm run lint && npm run typecheck` — Expected: không lỗi.
- [ ] **Step 4:** Dev (Review Focus 3): trong phòng, mở hộp thoại Mọi người + theme stage, gọi `setLang('en')` từ console (tạm, `en` vẫn là `vi`) — Expected: không lỗi React; sau Task 7 kiểm lại là mọi chữ đổi ngay.

### Task 7: Từ điển tiếng Anh `en.ts`

**Files:** Create `src/i18n/en.ts`; Modify `src/i18n/index.ts` (`dicts.en = en`).

**Interfaces:**
- Consumes: `Dict` (Task 4), mọi khoá mới của Task 5.
- Produces: `export const en: Dict`.

- [ ] **Step 1:** Dịch đủ mọi khoá (≈515 + khoá mới), số nhiều tiếng Anh đúng, lỗi `ERRORS` đủ mọi mã, `time.locale = 'en-GB'`, `playlists.youtubeName` / `songList.defaultName` bằng tiếng Anh.
- [ ] **Step 2:** `npm run typecheck` — Expected: không lỗi (thiếu/thừa khoá phải báo lỗi; thử xoá một khoá để chắc chắn TypeScript bắt được, rồi hoàn lại).
- [ ] **Step 3:** Dev: `setLang('en')` → rà trang chủ, phòng (3 tab, mọi hộp thoại, 13 theme), `/host`, banner, lỗi — Expected: không còn chữ Việt (trừ dữ liệu người dùng và dòng nhật ký cũ).

### Task 8: Trang pháp lý tiếng Anh

**Files:** Create `src/app/privacy/content.tsx`, `src/app/terms/content.tsx` (client component chọn `vi`/`en` theo `useLang()`); Modify `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` (giữ `metadata` tiếng Việt, body là component trên).

- [ ] **Step 1:** Bản tiếng Anh tương đương nội dung hiện có (không đổi nội dung pháp lý, giữ `CONTACT_EMAIL`, ngày cập nhật).
- [ ] **Step 2:** `npm run lint && npm run typecheck`; dev: mở `/privacy`, `/terms` ở hai ngôn ngữ.

### Task 9: Nhật ký theo ngôn ngữ người xem, tên thiết bị, tên playlist

**Files:** Create `src/i18n/activity.ts`; Modify `src/components/room/ActivityLog.tsx`, `src/components/room/PeoplePanel.tsx`, các chỗ hiện tên thành viên (banner, khung chờ `/host` trong `PlayerEngine.tsx`, `ListenersStrip`, chat), `vi.ts` / `en.ts` (khoá `log.events.*`, `deviceName(n?: number)`).

**Interfaces:**
- Consumes: `ActivityLogView.params` (Task 1/2, bảng variant ở Task 2), `Dict`.
- Produces:
  - `memberName(m: { displayName: string; isDevice?: boolean }, t: Dict): string` — thiết bị: `t.deviceName(n)` với `n` là số ở cuối tên đã lưu ("Máy phát 2" → 2), không có số → `t.deviceName()`.
  - `playlistName(p: { name: string; kind?: 'liked' | 'mix' | null }, t: Dict): string` — `liked` → `t.playlists.likedName`, `mix` → `t.playlists.mixName`, ngược lại `p.name`. Dùng ở mọi chỗ hiện tên playlist.
  - `logLine(row: ActivityLogView, t: Dict): { actor: string | null; text: string }` — có `params` và `type`/`variant` biết → câu theo `t.log.events`; tên người làm qua `memberName` (`actorDevice`), `target` qua `memberName` (`targetDevice`); **không có `params`, hoặc type/variant lạ → `{ actor: row.displayName, text: row.message }`**.

- [ ] **Step 1:** Viết `activity.ts` + khoá từ điển cho mọi dòng trong bảng Task 2 (cả `vi` — câu giống câu server đang lưu — và `en`).
- [ ] **Step 2:** `ActivityLog.tsx` dùng `logLine`; mọi chỗ hiện tên thành viên dùng `memberName`; mọi chỗ hiện tên playlist dùng `playlistName`.
- [ ] **Step 3:** `npm run lint && npm run typecheck`.
- [ ] **Step 4 (Review Focus 2):** Dev: làm các hành động ở Task 2 Step 4 → nhật ký đúng ở VI và EN; dòng cũ (trước Task 2) vẫn hiện câu tiếng Việt; sửa tay một dòng dev có `metadata = {"v":1,"variant":"xyz"}` → hiện `message`, không lỗi. Tên "Máy phát 2" hiện "Speaker 2" khi EN.

### Task 10: Link chia sẻ mang ngôn ngữ

**Files:** Modify `src/components/room/ShareDialog.tsx` (và mọi nút "Sao chép link"/`navigator.share` — tìm `/r/${code}` dựng link), `src/app/r/[code]/layout.tsx` (`generateMetadata`), `src/app/r/[code]/share-image/route.tsx`.

**Interfaces:**
- Consumes: `getLang`, `dicts`.
- Produces: `shareUrl(origin: string, code: string, lang: Lang): string` — thêm `?lang=en` chỉ khi `lang === 'en'`. QR trên `/host` **không** dùng hàm này (giữ link thường).

- [ ] **Step 1:** Nút chia sẻ/sao chép dùng `shareUrl`. `generateMetadata({ params, searchParams })` đọc `lang` (`'en'` → `dicts.en`, khác → `dicts.vi`) cho tiêu đề, mô tả, `og:url`, ảnh; URL ảnh mang `lang` và tham số chống cache có `lang`. `share-image` đọc `lang` từ query.
- [ ] **Step 2:** `npm run lint && npm run typecheck`.
- [ ] **Step 3 (Review Focus 4):** Dev: `curl -s "http://localhost:3000/r/<CODE>?lang=en" | grep -o '<meta property="og:title"[^>]*>'` → tiếng Anh; không `lang` → tiếng Việt; mở ảnh `share-image?lang=en` → chữ tiếng Anh. Thiết bị mới mở link `?lang=en` → giao diện EN; thiết bị đã chọn VI → vẫn VI.

### Task 11: Nút chọn ngôn ngữ + gửi `language` cho tổng kết / Hỏi DJ

**Files:** Create `src/components/ui/LangSwitch.tsx`; Modify trang chủ (`src/app/page.tsx` hoặc component đầu trang chủ), thanh đầu trang phòng (cạnh nút Giao diện — tìm `vi.header`/nút theme trong `RoomFrame`/header), `src/app/r/[code]/host/page.tsx`, nơi gửi `room:recap` và `dj:ask`.

**Interfaces:**
- Consumes: `useLang`, `setLang`, `getLang`, `Lang` từ contracts.
- Produces: `<LangSwitch />` — hai lựa chọn *Tiếng Việt* / *English*, nhãn không dịch (luôn hiện đúng tên ngôn ngữ), dùng được trên điện thoại.

- [ ] **Step 1:** Gắn `LangSwitch` ở trang chủ, đầu trang phòng, `/host`.
- [ ] **Step 2:** `room:recap` và `dj:ask` gửi thêm `language: getLang()`.
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm run build` — Expected: không lỗi.
- [ ] **Step 4 (Review Focus 1, 5):** Dev: thiết bị sạch → VI ở trang chủ, phòng, `/host`; đổi EN ở trang chủ → vào phòng vẫn EN, tải lại vẫn EN; hai trình duyệt khác ngôn ngữ cùng phòng; tổng kết EN ra câu tiếng Anh; Hỏi DJ EN không ép nhạc Việt.

---

## Hoàn tất

- [ ] Server deploy trước (tương thích ngược), client sau. Kiểm lại toàn bộ checklist "Kiểm tra" trong spec trên dev.
- [ ] Báo người dùng kết quả + xin phép commit / push / mở PR / merge (merge chỉ khi CI xanh) cho từng repo.
