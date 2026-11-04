// 資料流程：抓台彩官方 API 的大樂透開獎結果，輸出 app/data/latest.json（格式見 app/README.md）。
// 由 GitHub Actions 定時執行；本機執行：node scripts/fetch-lotto.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Lotto649Result';
const ROOT = new URL('..', import.meta.url);
const OUT = new URL('app/data/latest.json', ROOT);
const RAW = new URL('app/data/raw-sample.json', ROOT);
const OVERRIDES = new URL('app/data/overrides.json', ROOT);
const HISTORY = new URL('app/data/history.json', ROOT);
const FIRST_MONTH = '2004-01'; // 大樂透 2004 年 1 月開賣
const RECENT_MONTHS = 2; // 最近幾個月每次都重抓（新開獎、獎金更新）
const TIER_KEYS = ['jackpotAssign', 'secondAssign', 'thirdAssign', 'fourthAssign', 'fifthAssign', 'sixthAssign', 'seventhAssign', 'normalAssign'];
const MIN_DRAWS = 60;
const MAX_MONTHS = 12;
const DRAW_DAYS = [2, 5]; // 每週二、五開獎

const SALES_AVG_DRAWS = 4; // 下期銷售額以最近幾期平均估計

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

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// API 期別為 115000102（民國年 + 6 位序號），轉成台彩公告用的 115102
export function displayPeriod(apiPeriod) {
  const p = Number(apiPeriod);
  return `${Math.floor(p / 1e6)}${String(p % 1e6).padStart(3, '0')}`;
}

// 把 API 的一筆資料轉成前端格式；drawNumberSize 前 6 個是獎號（已排序），第 7 個是特別號
// jackpotAssign.prize 是本期銷售提撥的頭獎，lastPrize 是上期累積，兩者相加為本期頭獎總額
export function parseItem(item) {
  const all = item.drawNumberSize;
  if (!Array.isArray(all) || all.length < 7) throw new Error(`第 ${item.period} 期號碼格式不符`);
  const numbers = all.slice(0, 6).map(Number).sort((a, b) => a - b);
  const special = Number(all[6]);
  if ([...numbers, special].some((n) => !(n >= 1 && n <= 49))) throw new Error(`第 ${item.period} 期號碼超出 1~49`);
  const jp = item.jackpotAssign ?? {};
  const prize = num(jp.prize), carry = num(jp.lastPrize);
  return {
    period: displayPeriod(item.period),
    date: String(item.lotteryDate).slice(0, 10),
    numbers,
    special,
    jackpotPool: prize == null ? null : prize + (carry ?? 0),
    jackpotWinners: num(jp.winnerCount),
    sales: num(item.sellAmount),
    jackpotShare: prize != null && item.sellAmount > 0 ? prize / item.sellAmount : null,
  };
}

// 最近一期之後的下一個開獎日（二或五）
export function nextDrawDate(lastDate) {
  const d = new Date(`${lastDate}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (!DRAW_DAYS.includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

// 下一期期別：同一年序號加一，跨年從 001 開始
export function nextPeriod(period, nextDate) {
  const year = Math.floor(Number(period) / 1000), seq = Number(period) % 1000;
  const nextYear = Number(nextDate.slice(0, 4)) - 1911;
  return nextYear === year ? String(year * 1000 + seq + 1) : `${nextYear}001`;
}

// 下期頭獎估計：上期無人中頭獎則累積本期總額，再加上依平均銷售額與提撥比例估算的新提撥
export function estimateNext(draws) {
  const recent = draws.slice(0, SALES_AVG_DRAWS).filter((d) => d.sales);
  const last = draws[0];
  if (!recent.length || last.jackpotPool == null || last.jackpotWinners == null) return {};
  const estSales = Math.round(recent.reduce((a, d) => a + d.sales, 0) / recent.length);
  const share = last.jackpotShare ?? 0.22;
  const carry = last.jackpotWinners > 0 ? 0 : last.jackpotPool;
  return { jackpot: Math.round(carry + estSales * share), estSales };
}

// 合併：API 沒給的頭獎金額，依序用 overrides.json、上一版 latest.json 補上
export function merge(rawDraws, prev, overrides) {
  const est = estimateNext(rawDraws);
  const draws = rawDraws.map(({ sales, jackpotShare, ...d }) => d);
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
  const date = nextDrawDate(last.date);
  const period = nextPeriod(last.period, date);
  const nov = overrides?.next?.period === period ? overrides.next : {};
  const prevNext = prev?.next ?? {};
  const next = {
    period,
    date,
    jackpot: nov.jackpot ?? est.jackpot ?? prevNext.jackpot ?? 100000000,
    estSales: nov.estSales ?? est.estSales ?? prevNext.estSales ?? 150000000,
    // 下期頭獎是估計值（累積 + 預估提撥），手動填入官方公告數字時才為 false
    jackpotEstimated: nov.jackpot == null,
  };
  return { next, draws: merged };
}

// ---------- 全部歷史（app/data/history.json，給「開獎」分頁查詢與兌獎） ----------
// 每期另存兌獎截止日與頭獎～普獎的單注獎金、中獎注數（順序同 TIER_KEYS）
export function parseHistoryItem(item) {
  const d = parseItem(item);
  return {
    period: d.period,
    date: d.date,
    numbers: d.numbers,
    special: d.special,
    redeemBy: item.redeemableDate ? String(item.redeemableDate).slice(0, 10) : null,
    prize: TIER_KEYS.map((k) => num(item[k]?.perPrize)),
    winners: TIER_KEYS.map((k) => num(item[k]?.winnerCount)),
  };
}

// FIRST_MONTH 到 now（台灣時間）所在月份，由舊到新
export function allMonths(now, first = FIRST_MONTH) {
  return monthsBack(now, 12 * 40).filter((m) => m >= first).reverse();
}

// 要抓哪些月份：最近 RECENT_MONTHS 個月必抓；更早的月份已有資料或確定沒資料就跳過
export function monthsToFetch(history, months) {
  const have = new Set(history.draws.map((d) => d.date.slice(0, 7)));
  const empty = new Set(history.emptyMonths ?? []);
  const recent = new Set(months.slice(-RECENT_MONTHS));
  return months.filter((m) => recent.has(m) || (!have.has(m) && !empty.has(m)));
}

// 以期別合併（新資料覆蓋舊資料），由新到舊排序
export function mergeHistory(oldDraws, newDraws) {
  const byPeriod = new Map(oldDraws.map((d) => [d.period, d]));
  for (const d of newDraws) byPeriod.set(d.period, d);
  return [...byPeriod.values()].sort((a, b) => Number(b.period) - Number(a.period));
}

// 一期一行，檔案小又方便看 diff
export function formatHistory(h) {
  return `{"updatedAt":${JSON.stringify(h.updatedAt)},"emptyMonths":${JSON.stringify(h.emptyMonths)},"draws":[\n${h.draws.map((d) => JSON.stringify(d)).join(',\n')}\n]}\n`;
}

async function updateHistory(getMonth) {
  const prev = await readJSON(HISTORY, null);
  const history = { draws: prev?.draws ?? [], emptyMonths: prev?.emptyMonths ?? [] };
  const months = allMonths(new Date());
  const todo = monthsToFetch(history, months);
  const recent = new Set(months.slice(-RECENT_MONTHS));
  const fresh = [], failed = [];
  for (const m of todo) {
    let items;
    try { items = await getMonth(m); } catch (e) { failed.push(m); console.warn(e.message); continue; }
    if (!items.length && !recent.has(m)) history.emptyMonths.push(m);
    for (const it of items) {
      try { fresh.push(parseHistoryItem(it)); } catch (e) { console.warn(`略過：${e.message}`); }
    }
    if (!recent.has(m)) await new Promise((r) => setTimeout(r, 300)); // 補抓舊資料時放慢，別給 API 太大壓力
  }
  history.draws = mergeHistory(history.draws, fresh);
  history.emptyMonths = [...new Set(history.emptyMonths)].sort();
  if (failed.length) console.warn(`這些月份抓取失敗，下次再補：${failed.join(', ')}`);
  if (prev && JSON.stringify(prev.draws) === JSON.stringify(history.draws) && JSON.stringify(prev.emptyMonths) === JSON.stringify(history.emptyMonths)) {
    console.log(`歷史資料沒有變動（${history.draws.length} 期）`);
    return;
  }
  history.updatedAt = new Date().toISOString();
  await writeFile(HISTORY, formatHistory(history));
  console.log(`歷史資料已更新：共 ${history.draws.length} 期（抓了 ${todo.length} 個月）`);
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
  // 同一個月份只抓一次，最新資料與歷史資料共用
  const cache = new Map();
  const getMonth = async (m) => {
    if (!cache.has(m)) cache.set(m, await fetchMonth(m));
    return cache.get(m);
  };
  const items = [];
  for (const month of monthsBack(new Date(), MAX_MONTHS)) {
    items.push(...(await getMonth(month)));
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

  await updateHistory(getMonth);

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
