# GyroPlay（game.tryit.wtf）

手機當手把的體感小遊戲平台。電腦顯示遊戲，手機掃 QR code 後用陀螺儀 + 螢幕按鈕控制。
GitHub `AAAZZZR/GamePlatform`，本機放在 `Desktop\tryit\gameplatform`（跟同網域的 VideoSaas 並排）。

## 架構

- **前端**：Next.js `output: "export"`，`next build` 輸出靜態檔到 `out/`。
- **部署**：Cloudflare Workers（`wrangler.jsonc`）。靜態檔由 Workers static assets 直接送（免費、不叫醒 Worker）；Worker 只處理 `/ws`。
- **連線方式：只走 P2P**
  1. 電腦開房間（12 碼隨機房號），連 `/ws?role=host` 牽線 WebSocket，連線一直留著（沒訊息時伺服器休眠、不計費）讓新手機能加入。
  2. 手機掃 QR code 連 `/ws?role=player`，透過房間交換 WebRTC offer / answer / ICE。
  3. DataChannel 一通，手機就關掉牽線連線。之後陀螺儀、按鈕、切換遊戲、狀態同步全部走 P2P，**不經過伺服器**。
  4. P2P 打不通（通常是手機和電腦不在同一個 Wi-Fi）就直接告訴玩家，**不會改走伺服器轉發**，也沒有 TURN。這是擁有者的決定（2026-11-17）：遊戲資料不准走 Workers。
- **程式位置**
  - `lib/signal.ts`：牽線規格（防護數字 `LIMITS`、close code、房號格式），Worker 和前端共用
  - `worker/index.ts`：`/ws` 入口與門口三道關；`worker/room.ts`：房間 Durable Object（Hibernation API）；`worker/budget.ts`：全站每日上限 Durable Object
  - `lib/peer/`：瀏覽器端 P2P（`hostLink.ts` 電腦、`playerLink.ts` 手機、`messages.ts` 訊息格式）
  - `hooks/useHostLink.ts`、`hooks/usePlayerLink.ts`：React 接上述物件（singleton + useSyncExternalStore）
  - `platform/`：遊戲外殼與輸入正規化；`games/`：各遊戲

## 防護（擋人狂開連線耗額度）

數字的正本在 `lib/signal.ts` 的 `LIMITS`；每 IP 限流在 `wrangler.jsonc` 的 `ratelimits`（兩邊要一起改）；每日上限在 `wrangler.jsonc` 的 `vars.DAILY_CONNECTION_LIMIT`。

| 層 | 規則 | 違反時 |
|---|---|---|
| Worker 門口 | 只接受同網域來源；房號格式要對 | HTTP 403 / 400 |
| Worker 門口 | 每 IP 每 60 秒 10 條連線（Cloudflare Rate Limiting，每個機房各算、約略值） | close 4029 |
| Worker 門口 | 全站每天 2000 條連線（UTC 0 點重置） | close 4030 |
| 房間 | 電腦 1、手機同時最多 2 支在牽線；沒電腦的房間手機進不來 | 4001 / 4002 |
| 房間 | 手機牽線時限 30 秒 | 4006 |
| 房間 | 每條連線每秒最多 10 則、單則 16KB 內、只收 `{t:'signal'}` | 4003 / 4005 |
| 房間 | 每條連線總訊息：手機 50、電腦 200；電腦送給不存在的手機最多 20 則 | 4004 / 4005 |

Workers 帳號層的「支出上限」管不到 Durable Objects，所以靠上面這幾層自己擋。

## 指令（在這個資料夾裡跑）

- `npm run dev`：Next 開發伺服器。牽線要靠 Worker，所以這個模式下大廳連不了手機；改遊戲用 `/dev?game=game5` 試玩頁（鍵盤模擬傾斜，不用手機）。
- `npm run preview`：`next build` + `wrangler dev`，本機完整跑一次（含 Durable Objects、限流模擬）。
- `npm run check`：前端與 Worker 型別檢查。`npm run lint`：ESLint。
- `npm run types`：改了 `wrangler.jsonc` 後重新產生 `worker/worker-configuration.d.ts`。
- `npm run deploy`：build 並部署到 game.tryit.wtf（要先 `npx wrangler login`）。**push 到 GitHub 不會自動部署。**
- 真的手機測試要 HTTPS（陀螺儀權限需要安全連線），所以用部署後的正式站測。

不寫自動化測試（擁有者規定）；驗證靠型別檢查、lint、`/dev` 試玩頁和 `npm run preview` 實際跑。

## 遊戲

- 遊戲合約在 `platform/types.ts`：電腦端收 `{ inputRef, paused, callbacks }`，手機端只收 `{ sendAction }`。
- `inputRef.current.move` 是 ±15 的傾斜量；`actions` 有按住型（`xxx-start`/`xxx-end`）和單次型（`start-game` 等，約 150ms 後自動清掉）。換算在 `platform/input.ts`。
- 新增遊戲：`types/game.ts` 的 `GamePlayId` 和 `games/registry.ts` 一起改。
- 2026-11-17 只留 Tilt to Live（game5）和 Sky Fighter（game9），其他 8 個下架；要找回去看 commit `33a2af5`。
- 同一天兩個遊戲都改版過，結構都是「數值設定 / 純邏輯 / 繪製 / 音效 / index 接平台」分檔，遊戲狀態放 ref、每幀原地更新，不靠 React state 重繪：
  - Tilt to Live：`config.ts`、`engine.ts`、`render.ts`（canvas 2D）、`sounds.ts`。最佳紀錄存 localStorage `gyroplay.game5.best`。
  - Sky Fighter：`config.ts`、`sim.ts`、`scene.tsx`（R3F）、`hud.tsx`、`sound.ts`。刻意拿掉「機頭朝下碰海就死」：手機陀螺儀一飄就會無辜墜海，改成越接近海面越拉平。
- 多人模式（Lobby 的 Multiplayer）還沒完成，大廳選了會顯示 Coming Soon；連線層已支援最多 2 支手機。
- 目前只有手機 → 電腦的訊息，沒有電腦 → 手機的遊戲事件，所以受傷、撿道具時手機不會震動（只有按鈕本身的震動）。
