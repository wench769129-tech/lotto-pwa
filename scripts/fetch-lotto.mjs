// 資料流程：抓台彩官方 API 的大樂透開獎結果，輸出 app/data/latest.json（格式見 app/README.md）。
// 由 GitHub Actions 定時執行；本機執行：node scripts/fetch-lotto.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Lotto649Result';
const ROOT = new URL('..', import.meta.url);
const OUT = new URL('app/data/latest.json', ROOT);
const RAW = new URL('app/data/raw-sample.json', ROOT);
const OVERRIDES = new URL('app/data/overrides.json', ROOT);
const MIN_DRAWS = 60;
const MAX_MONTHS = 12;
const DRAW_DAYS = [2, 5]; // 每週二、五開獎

// 頭獎金額欄位名稱尚未從官方文件確認，先列出可能的名稱；第一次執行後依 raw-sample.json 修正
const POOL_KEYS = ['jackpot', 'jackpotAmount', 'firstPrizeAmount', 'prizeAmount', 'totalAmount'];
const WINNER_KEYS = ['jackpotWinners', 'firstPrizeCount', 'firstPrizeNum'];

const readJSON = async (url, fallback) => {
  try { return JSON.parse(await readFile(url, 'utf8')); } catch { return fallback; }
};

// 回傳往前 n 個月的 YYYY-MM（台灣時間）
export function monthsBack(now, n) {
  const tw = new Date(now.getTime() + 8 * 3600e3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const pickNumber = (item, keys) => {
  for (const k of keys) if (typeof item[k] === 'number' && Number.isFinite(item[k])) return item[k];
  return null;
};

// 把 API 的一筆資料轉成前端格式；drawNumberSize 前 6 個是獎號（已排序），第 7 個是特別號
export function parseItem(item) {
  const all = item.drawNumberSize;
  if (!Array.isArray(all) || all.length < 7) throw new Error(`第 ${item.period} 期號碼格式不符`);
  const numbers = all.slice(0, 6).map(Number).sort((a, b) => a - b);
  const special = Number(all[6]);
  if ([...numbers, special].some((n) => !(n >= 1 && n <= 49))) throw new Error(`第 ${item.period} 期號碼超出 1~49`);
  return {
    period: String(item.period),
    date: String(item.lotteryDate).slice(0, 10),
    numbers,
    special,
    jackpotPool: pickNumber(item, POOL_KEYS),
    jackpotWinners: pickNumber(item, WINNER_KEYS),
  };
}

// 最近一期之後的下一個開獎日（二或五）
export function nextDrawDate(lastDate) {
  const d = new Date(`${lastDate}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (!DRAW_DAYS.includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

// 合併：API 沒給的頭獎金額，依序用 overrides.json、上一版 latest.json 補上
export function merge(draws, prev, overrides) {
  const prevByPeriod = new Map((prev?.sample ? [] : prev?.draws ?? []).map((d) => [d.period, d]));
  const ov = overrides?.draws ?? {};
  const merged = draws.map((d) => {
    const old = prevByPeriod.get(d.period) ?? {};
    const o = ov[d.period] ?? {};
    return {
      ...d,
      jackpotPool: o.jackpotPool ?? d.jackpotPool ?? old.jackpotPool ?? null,
      jackpotWinners: o.jackpotWinners ?? d.jackpotWinners ?? old.jackpotWinners ?? null,
    };
  });

  const last = merged[0];
  const period = String(Number(last.period) + 1);
  const nov = overrides?.next?.period === period ? overrides.next : {};
  const prevNext = prev?.next ?? {};
  const samePeriod = prevNext.period === period;
  const next = {
    period,
    date: nextDrawDate(last.date),
    jackpot: nov.jackpot ?? (samePeriod ? prevNext.jackpot : null) ?? prevNext.jackpot ?? last.jackpotPool ?? 100000000,
    estSales: nov.estSales ?? (samePeriod ? prevNext.estSales : null) ?? prevNext.estSales ?? 150000000,
    // 頭獎金額不是本期官方數字時標示為估計
    jackpotEstimated: !(nov.jackpot != null || (samePeriod && prevNext.jackpotEstimated === false)),
  };
  return { next, draws: merged };
}

async function fetchMonth(month) {
  const url = `${API}?period&month=${month}&pageNum=1&pageSize=50`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'lotto-pwa-data-bot' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.rtCode !== undefined && body.rtCode !== 0) throw new Error(`rtCode ${body.rtCode}`);
      return body.content?.lotto649Res ?? [];
    } catch (e) {
      if (attempt >= 3) throw new Error(`抓取 ${month} 失敗：${e.message}`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
}

async function main() {
  const items = [];
  for (const month of monthsBack(new Date(), MAX_MONTHS)) {
    items.push(...(await fetchMonth(month)));
    if (items.length >= MIN_DRAWS) break;
  }
  if (items.length === 0) throw new Error('API 沒有回傳任何開獎資料');
  await writeFile(RAW, JSON.stringify(items.slice(0, 2), null, 1) + '\n');

  const seen = new Set();
  const draws = items.map(parseItem)
    .filter((d) => !seen.has(d.period) && seen.add(d.period))
    .sort((a, b) => Number(b.period) - Number(a.period));

  const prev = await readJSON(OUT, null);
  const overrides = await readJSON(OVERRIDES, {});
  const { next, draws: merged } = merge(draws, prev, overrides);

  // 開獎資料沒變就不更新時間，避免每次排程都產生 commit
  if (prev && !prev.sample && JSON.stringify(prev.draws) === JSON.stringify(merged) && JSON.stringify(prev.next) === JSON.stringify(next)) {
    console.log(`沒有新資料（最新第 ${merged[0].period} 期）`);
    return;
  }
  const out = { sample: false, updatedAt: new Date().toISOString(), next, draws: merged };
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`已更新：${merged.length} 期，最新第 ${merged[0].period} 期（${merged[0].date}），下期 ${next.period}（${next.date}）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
