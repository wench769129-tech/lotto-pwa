# 大樂透分析 PWA 前端

純 HTML、CSS、JS，不需要建置。版面依 `../../frontend/wireframe.md`（v2）。

## 檔案
- `index.html`、`style.css`：框架、底部 5 分頁、跟隨系統深淺色
- `app.js`：讀 `data/latest.json`，畫出期望值、號碼、包牌、預算分頁
- `draw-tab.js`：「開獎」分頁（預設首頁）：最新開獎、手動兌獎（單式／複式 6~16 個）、我的彩券（存在手機、開獎後自動兌獎、篩選、匯出匯入）、歷史開獎查詢
- `checker.js`：兌獎計算（獎項判斷、複式展開、5,000 元以上扣 20.4% 稅）
- `data/history.json`：全部歷史開獎（2004 年起），每期含兌獎截止日 `redeemBy`、頭獎～普獎單注獎金 `prize[8]` 與中獎注數 `winners[8]`；由 `scripts/fetch-lotto.mjs` 第一次執行時補抓，之後每次只重抓最近兩個月
- `picker.js`：選號（隨機選再刪熱門組合，任兩組最多重複 2 個號碼）
- `stats.js`：組合數、對中機率、損益兩平頭獎、本月剩餘期數
- `sw.js`、`manifest.json`、`icons/`：PWA 離線快取與加到主畫面（`icon.svg` 為原稿，PNG 由它輸出；iPhone 用 `apple-touch-icon.png`）
- `data/latest.json`：**目前是示意資料**（`"sample": true`），由資料流程接手後改成真實資料
- `preview/`：手機預覽截圖
- 撞號風險與期望值計算直接引用 `../split-risk/split-risk.js`，部署時要保留這個相對位置

## 本機預覽
在 `lotto-pwa/` 資料夾執行 `python3 -m http.server`，開 `http://localhost:8000/app/`。

## 測試
`node --test picker.test.mjs checker.test.mjs`

## data/latest.json 格式
```json
{
  "sample": false,
  "updatedAt": "2026-11-01T02:00:00+08:00",
  "next": { "period": "115102", "date": "2026-11-03", "jackpot": 160000000, "estSales": 150000000 },
  "draws": [
    { "period": "115101", "date": "2026-10-30", "numbers": [1,8,10,15,37,45], "special": 22, "jackpotPool": 130000000, "jackpotWinners": 0 }
  ]
}
```
`draws` 由新到舊，建議至少 60 期。`estSales` 是下期預估銷售額（估計值），用來推算分獎。

## 尚未完成
- 選號單上排成圖形的過濾：官方選號單版面還沒查證，暫不納入
- 預算紀錄只存在手機瀏覽器，換手機不會跟著過去
