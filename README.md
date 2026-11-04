# 大樂透分析 PWA

手機瀏覽的大樂透數據分析：稅後期望值、號碼特徵、包牌覆蓋、預算控管。純數學與機率，不做走勢預測。

網址：https://wench769129-tech.github.io/lotto-pwa/

## 結構
- `app/`：前端（說明見 `app/README.md`）
- `split-risk/`：撞號風險與期望值計算模組，前端以相對路徑引用
- `scripts/fetch-lotto.mjs`：抓台彩官方 API，輸出 `app/data/latest.json`
- `.github/workflows/update-data.yml`：每週二、五開獎後與每天早上自動執行，資料有變才提交

## 資料來源
- 開獎號碼：台灣彩券官方 API `api.taiwanlottery.com/TLCAPIWeB/Lottery/Lotto649Result`
- 頭獎：API 的 `jackpotAssign.prize`（本期提撥）＋ `lastPrize`（上期累積）
- 下期頭獎為估計：上期無人中則累積，再加最近 4 期平均銷售額 × 上期頭獎提撥比例；可在 `app/data/overrides.json` 填台彩公告數字覆蓋
- `app/data/raw-sample.json` 留下最新兩筆 API 原始資料供核對

## 測試
```
node --test scripts/fetch-lotto.test.mjs app/picker.test.mjs split-risk/split-risk.test.mjs
```
