// 兌獎計算（純函式，不碰畫面）：判斷獎項、複式展開、稅後金額、我的彩券統計。
// 獎項規則：台灣彩券大樂透，01~49 選 6 個，另開 1 個特別號。
export const PRICE = 50;
export const TIERS = [
  { name: '頭獎', rule: '6 個全中' },
  { name: '貳獎', rule: '5 個＋特別號' },
  { name: '參獎', rule: '5 個' },
  { name: '肆獎', rule: '4 個＋特別號' },
  { name: '伍獎', rule: '4 個' },
  { name: '陸獎', rule: '3 個＋特別號' },
  { name: '柒獎', rule: '2 個＋特別號' },
  { name: '普獎', rule: '3 個' },
];
// 單注獎金超過 5,000 元：所得稅 20% ＋ 印花稅 0.4%，實拿 79.6%；5,000 元以下免稅
export const TAX_FREE_MAX = 5000;
export const TAX_KEEP = 0.796;
export const MIN_PICK = 6;
export const MAX_PICK = 16;

export function nCr(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

// 一注（6 個號碼）對上一期開獎，回傳獎項索引（0=頭獎 … 7=普獎），沒中回傳 -1
export function tierOf(six, draw) {
  const win = new Set(draw.numbers);
  const m = six.filter((n) => win.has(n)).length;
  const sp = six.includes(draw.special);
  if (m === 6) return 0;
  if (m === 5) return sp ? 1 : 2;
  if (m === 4) return sp ? 3 : 4;
  if (m === 3) return sp ? 5 : 7;
  if (m === 2 && sp) return 6;
  return -1;
}

export function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]);
    yield* combos(arr, k, i + 1, acc);
    acc.pop();
  }
}

export function validatePick(nums) {
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 49)) return '號碼要在 01~49 之間';
  if (new Set(nums).size !== nums.length) return '號碼不能重複';
  if (nums.length < MIN_PICK) return `請選 ${MIN_PICK} 個號碼（目前 ${nums.length} 個）`;
  if (nums.length > MAX_PICK) return `最多 ${MAX_PICK} 個號碼`;
  return null;
}

export const afterTax = (amount) => (amount > TAX_FREE_MAX ? Math.round(amount * TAX_KEEP) : amount);

// 一張彩券（6 個為單式，7~16 個為複式）對上一期：各獎項中幾注、稅前與稅後總額
export function checkTicket(nums, draw) {
  const sorted = [...nums].sort((a, b) => a - b);
  const counts = Array(TIERS.length).fill(0);
  for (const six of combos(sorted, 6)) {
    const t = tierOf(six, draw);
    if (t >= 0) counts[t]++;
  }
  let gross = 0, net = 0, unknown = false;
  counts.forEach((c, t) => {
    if (!c) return;
    const per = draw.prize?.[t];
    if (per == null || per <= 0) { unknown = true; return; }
    gross += per * c;
    net += afterTax(per) * c;
  });
  const win = new Set(draw.numbers);
  return {
    lines: nCr(sorted.length, 6),
    counts,
    won: counts.some((c) => c > 0),
    gross, net, unknown,
    hits: sorted.filter((n) => win.has(n)),
    specialHit: sorted.includes(draw.special),
  };
}

// 我的彩券的狀態：result（已開獎）、pending（還沒開獎）、nodata（期別太舊或打錯，查不到開獎資料）
export function ticketStatus(ticket, drawsByPeriod, latestPeriod) {
  const draw = drawsByPeriod.get(ticket.period);
  if (draw) return { status: 'result', draw, result: checkTicket(ticket.nums, draw) };
  if (Number(ticket.period) > Number(latestPeriod)) return { status: 'pending' };
  return { status: 'nodata' };
}

export function summarize(tickets, drawsByPeriod, latestPeriod) {
  const s = { count: tickets.length, cost: 0, gross: 0, net: 0, won: 0, lost: 0, pending: 0, nodata: 0 };
  for (const t of tickets) {
    s.cost += nCr(t.nums.length, 6) * PRICE;
    const st = ticketStatus(t, drawsByPeriod, latestPeriod);
    if (st.status === 'result') {
      if (st.result.won) { s.won++; s.gross += st.result.gross; s.net += st.result.net; } else s.lost++;
    } else s[st.status]++;
  }
  return s;
}

// 匯入備份：以 id 合併，略過格式不對的資料
export function mergeTickets(current, incoming) {
  const byId = new Map(current.map((t) => [t.id, t]));
  let added = 0;
  for (const t of Array.isArray(incoming) ? incoming : []) {
    if (!t || typeof t.id !== 'string' || !/^\d{5,6}$/.test(String(t.period)) || !Array.isArray(t.nums)) continue;
    const nums = t.nums.map(Number);
    if (validatePick(nums)) continue;
    if (!byId.has(t.id)) added++;
    byId.set(t.id, { id: t.id, period: String(t.period), nums: nums.sort((a, b) => a - b), added: t.added ?? null });
  }
  return { tickets: [...byId.values()], added };
}

// 天數差（台灣日期字串 YYYY-MM-DD），today 也是 YYYY-MM-DD
export function daysUntil(dateStr, today) {
  return Math.round((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
}
