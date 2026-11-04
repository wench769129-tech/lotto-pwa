// 「開獎」分頁：最新開獎、手動兌獎、我的彩券（自動兌獎）、歷史開獎查詢。
// 歷史資料讀 data/history.json（全部期別＋各獎項單注獎金）；讀不到時先用 latest.json 的近期開獎頂著。
import { TIERS, PRICE, MAX_PICK, TAX_FREE_MAX, nCr, checkTicket, validatePick, ticketStatus, summarize, mergeTickets, daysUntil } from './checker.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => n.toLocaleString('zh-TW');
const pad = (n) => String(n).padStart(2, '0');
const WK = '日一二三四五六';
const todayTW = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const md = (date) => `${date.slice(5).replace('-', '/')}（${WK[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`;
const ymd = (date) => date.replaceAll('-', '/');
const money = (n) => `${fmt(n)} 元`;

const store = {
  get tickets() { try { return JSON.parse(localStorage.getItem('lotto.tickets') || '[]'); } catch { return []; } },
  set tickets(v) { localStorage.setItem('lotto.tickets', JSON.stringify(v)); },
  get seen() { return localStorage.getItem('lotto.seenDraw') || ''; },
  set seen(v) { localStorage.setItem('lotto.seenDraw', v); },
};

let H; // { draws, byPeriod, latest, next, partial }
const st = { picked: new Set(), period: null, other: '', result: null, msg: '', filter: 'all', q: '', shown: 20 };

async function loadHistory(latestData) {
  let draws = [];
  try {
    const h = await fetch('data/history.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null));
    draws = h?.draws ?? [];
  } catch { /* 離線又沒快取時用 latest.json */ }
  const byPeriod = new Map(draws.map((d) => [d.period, d]));
  for (const d of latestData.draws) {
    if (!byPeriod.has(d.period)) byPeriod.set(d.period, { ...d, redeemBy: null, prize: null, winners: null });
  }
  const all = [...byPeriod.values()].sort((a, b) => Number(b.period) - Number(a.period));
  return { draws: all, byPeriod, latest: all[0], next: latestData.next, partial: draws.length === 0 };
}

// ---------- 小元件 ----------
const drawBalls = (d) => `<div class="balls">${d.numbers.map((n) => `<span class="ball">${pad(n)}</span>`).join('')}<span class="plus">＋</span><span class="ball sp">${pad(d.special)}</span></div>`;

function ticketBalls(nums, draw) {
  const win = new Set(draw?.numbers ?? []);
  return `<div class="balls">${nums.map((n) => {
    const cls = win.has(n) ? ' hit' : draw && n === draw.special ? ' sp-hit' : '';
    return `<span class="ball${cls}">${pad(n)}</span>`;
  }).join('')}</div>`;
}

function prizeTable(d) {
  if (!d.prize) return '<p class="note">各獎項獎金資料更新中。</p>';
  const rows = TIERS.map((t, i) => {
    const w = d.winners?.[i], p = d.prize[i];
    return `<tr><td>${t.name}<br><small class="note">${t.rule}</small></td><td>${w == null ? '—' : fmt(w)}</td><td>${p ? fmt(p) : w === 0 && i < 4 ? '槓龜' : '—'}</td></tr>`;
  }).join('');
  return `<table class="prize"><tr><th>獎項</th><th>中獎注數</th><th>單注獎金（元）</th></tr>${rows}</table>`;
}

function deadline(draw) {
  if (!draw.redeemBy) return '<p class="note">兌獎期限：開獎日起 3 個月內，以彩券背面與台彩公告為準</p>';
  const left = daysUntil(draw.redeemBy, todayTW());
  return left < 0
    ? `<p class="note neg">已過兌獎期限（${ymd(draw.redeemBy)}）</p>`
    : `<p class="note">兌獎期限 ${ymd(draw.redeemBy)}（剩 ${left} 天）</p>`;
}

function resultShort(s) {
  if (s.status === 'pending') return '<span class="note">待開獎</span>';
  if (s.status === 'nodata') return '<span class="note">查無開獎資料</span>';
  const r = s.result;
  if (!r.won) return '<span class="note">未中獎</span>';
  const names = r.counts.map((c, i) => (c ? `${TIERS[i].name}${c > 1 ? `×${c}` : ''}` : '')).filter(Boolean).join('、');
  return `<span class="pos"><b>${names}</b>${r.net ? `・${money(r.net)}` : ''}</span>`;
}

function resultDetail(nums, s) {
  if (s.status === 'pending') return `<p>第 ${st.resultPeriod} 期還沒開獎${st.resultPeriod === H.next.period ? `（${md(H.next.date)} 開獎）` : ''}。存到我的彩券後，開獎資料一更新就會自動兌獎。</p>`;
  if (s.status === 'nodata') return `<p class="neg">查不到第 ${st.resultPeriod} 期的開獎資料，請確認期別。</p>`;
  const { draw, result: r } = s;
  const head = `<div class="row"><span>第 ${draw.period} 期・${md(draw.date)}</span><span>${r.lines > 1 ? `複式 ${r.lines} 注` : '單式'}</span></div>${ticketBalls(nums, draw)}`;
  if (!r.won) {
    return `${head}<p>沒有中獎（對中 ${r.hits.length} 個${r.specialHit ? '＋特別號' : ''}）。</p>`;
  }
  const rows = r.counts.map((c, i) => (c ? `<div class="row"><span>${TIERS[i].name}（${TIERS[i].rule}）× ${c}</span><span>${draw.prize?.[i] ? money(draw.prize[i] * c) : '以台彩公告為準'}</span></div>` : '')).join('');
  const big = r.counts.some((c, i) => c && (draw.prize?.[i] ?? Infinity) > TAX_FREE_MAX);
  return `${head}
    <p class="win">恭喜中獎！</p>
    ${rows}
    ${r.gross ? `<div class="row"><span>合計（稅前）</span><span>${money(r.gross)}</span></div>
    <div class="row"><span>稅後實拿</span><span class="big pos">${money(r.net)}</span></div>` : ''}
    ${r.unknown ? '<p class="note">有獎項的單注獎金資料還沒公布，金額以台彩公告為準。</p>' : ''}
    <p class="note">${big ? '單注獎金超過 5,000 元，扣 20% 所得稅與 0.4% 印花稅，需依台彩公告到指定銀行兌領；500 萬元以上要先打高額兌獎專線預約。' : '單注 5,000 元以下免稅，可到彩券行兌領。'}</p>
    ${deadline(draw)}`;
}

// ---------- 區塊 ----------
function renderBanner() {
  const mine = store.tickets.filter((t) => t.period === H.latest.period);
  const el = $('#d-banner');
  if (!mine.length) { el.innerHTML = ''; return; }
  const s = summarize(mine, H.byPeriod, H.latest.period);
  const isNew = store.seen !== H.latest.period;
  el.innerHTML = `<button class="card mine-banner" data-act="tomine">${isNew ? '<span class="new">新</span>' : ''}
    第 ${H.latest.period} 期你有 ${mine.length} 張彩券：${s.won ? `<b class="pos">中獎 ${s.won} 張${s.net ? `，稅後共 ${money(s.net)}` : ''}</b>` : '都沒有中獎'}</button>`;
}

function renderLatest() {
  const d = H.latest;
  const jw = d.winners?.[0] ?? d.jackpotWinners;
  const jp = d.winners?.[0] > 0 ? `${fmt(d.winners[0])} 注中頭獎，每注 ${money(d.prize[0])}` : jw === 0 ? '頭獎槓龜，累積到下期' : '';
  $('#d-latest').innerHTML = `
    <div class="card">
      <div class="row"><span><b>第 ${d.period} 期</b>・${md(d.date)}</span></div>
      ${drawBalls(d)}
      <p class="note">${[jp, d.redeemBy ? `兌獎期限 ${ymd(d.redeemBy)}` : ''].filter(Boolean).join('・')}</p>
      <details><summary>各獎項中獎注數與獎金</summary>${prizeTable(d)}</details>
    </div>
    <p class="note">下期第 ${H.next.period} 期・${md(H.next.date)} 開獎</p>`;
}

function periodOptions() {
  const today = todayTW();
  const open = H.draws.filter((d, i) => (d.redeemBy ? d.redeemBy >= today : i < 26));
  const opt = (v, label) => `<option value="${v}" ${st.period === v ? 'selected' : ''}>${label}</option>`;
  return [
    opt(H.next.period, `第 ${H.next.period} 期・${md(H.next.date)}（待開獎）`),
    ...open.map((d) => opt(d.period, `第 ${d.period} 期・${md(d.date)}`)),
    opt('other', '其他期別…'),
  ].join('');
}

function renderChecker() {
  const n = st.picked.size;
  const lines = n >= 6 ? nCr(n, 6) : 0;
  const grid = Array.from({ length: 49 }, (_, i) => i + 1)
    .map((k) => `<button class="${st.picked.has(k) ? 'on' : ''}" data-n="${k}">${pad(k)}</button>`).join('');
  $('#d-check').innerHTML = `
    <div class="card">
      <div class="form-row"><label for="c-period">期別</label><select id="c-period">${periodOptions()}</select></div>
      ${st.period === 'other' ? `<div class="form-row"><label for="c-other">輸入期別</label><input id="c-other" inputmode="numeric" maxlength="6" placeholder="例如 115090" value="${st.other}"></div>` : ''}
      <div class="grid49">${grid}</div>
      <div class="row"><span>已選 ${n} 個</span><span>${lines ? `${fmt(lines)} 注・${money(lines * PRICE)}${n > 6 ? '（複式）' : ''}` : `請點選 6~${MAX_PICK} 個號碼`}</span></div>
      <div class="btns"><button data-act="clear">清除</button><button data-act="check" class="go">兌獎</button><button data-act="save">存到我的彩券</button></div>
      ${st.msg ? `<p class="note ${st.msgErr ? 'neg' : 'pos'}">${st.msg}</p>` : ''}
      ${st.result ? `<div class="result">${st.result}</div>` : ''}
    </div>`;
}

function renderMine() {
  const tickets = store.tickets.slice().sort((a, b) => Number(b.period) - Number(a.period) || String(b.added).localeCompare(String(a.added)));
  const s = summarize(tickets, H.byPeriod, H.latest.period);
  const rows = tickets.map((t) => ({ t, s: ticketStatus(t, H.byPeriod, H.latest.period) })).filter(({ s: x }) => {
    if (st.filter === 'won') return x.status === 'result' && x.result.won;
    if (st.filter === 'lost') return x.status === 'result' && !x.result.won;
    if (st.filter === 'pending') return x.status === 'pending';
    return true;
  });
  const chip = (k, label, c) => `<button class="chip ${st.filter === k ? 'on' : ''}" data-filter="${k}">${label} ${c}</button>`;
  const item = ({ t, s: x }) => {
    const draw = x.draw;
    const date = draw?.date ?? (t.period === H.next.period ? H.next.date : null);
    const lines = nCr(t.nums.length, 6);
    return `<div class="tk">
      <div class="row"><span>第 ${t.period} 期${date ? `・${md(date)}` : ''}${lines > 1 ? `・複式 ${lines} 注` : ''}</span>
        <button class="rec-del" data-del="${t.id}" aria-label="刪除">✕</button></div>
      ${ticketBalls(t.nums, draw)}
      <div class="res">${resultShort(x)}</div>
      ${x.status === 'result' && x.result.won ? deadline(draw) : ''}
    </div>`;
  };
  $('#d-mine').innerHTML = `
    <div class="card">
      <div class="kpis small">
        <div class="kpi"><div class="lab">彩券</div><div class="val">${s.count} 張</div></div>
        <div class="kpi"><div class="lab">累計花費</div><div class="val">${fmt(s.cost)}</div></div>
        <div class="kpi"><div class="lab">累計中獎（稅後）</div><div class="val ${s.net ? 'pos' : ''}">${fmt(s.net)}</div></div>
      </div>
      <div class="chips">${chip('all', '全部', s.count)}${chip('won', '中獎', s.won)}${chip('lost', '未中', s.lost)}${chip('pending', '待開獎', s.pending)}</div>
      ${rows.length ? rows.map(item).join('') : `<p class="note">${s.count ? '這個分類沒有彩券' : '還沒有彩券。在上面選號後按「存到我的彩券」，開獎後會自動兌獎。'}</p>`}
      <div class="btns two"><button data-act="export">匯出備份</button><button data-act="import">匯入備份</button></div>
      <input id="imp" type="file" accept=".json,application/json" hidden>
      <p class="note">彩券只存在這支手機的瀏覽器，不會上傳。清除瀏覽器網站資料會一起刪掉，換手機前請先匯出備份。</p>
    </div>`;
}

function renderHistoryList() {
  const q = st.q.trim().replaceAll('/', '-');
  const list = q ? H.draws.filter((d) => d.period.includes(q) || d.date.includes(q)) : H.draws;
  $('#h-list').innerHTML = (list.length ? list.slice(0, st.shown).map((d) => `
    <details class="hd"><summary><span class="hp">${d.period} 期<small>${ymd(d.date)}</small></span>${drawBalls(d)}</summary>
      ${prizeTable(d)}${d.redeemBy ? `<p class="note">兌獎期限 ${ymd(d.redeemBy)}</p>` : ''}</details>`).join('') : '<p class="note">找不到符合的期別或日期</p>') +
    (list.length > st.shown ? `<button class="more" data-act="more">顯示更多（還有 ${fmt(list.length - st.shown)} 期）</button>` : '');
}

function renderAll() {
  const oldest = H.draws.at(-1);
  $('#tab-draw').innerHTML = `
    <div id="d-banner"></div>
    <h2>最新開獎</h2><div id="d-latest"></div>
    <h2>兌獎</h2><div id="d-check"></div>
    <h2>我的彩券</h2><div id="d-mine"></div>
    <h2>歷史開獎</h2>
    <div class="card">
      <input id="h-q" class="search" inputmode="numeric" placeholder="搜尋期別（115090）或日期（2026/10/20）">
      <p class="note">共 ${fmt(H.draws.length)} 期（${ymd(oldest.date)} 起）${H.partial ? '・完整歷史資料下次更新後才會出現' : ''}</p>
      <div id="h-list"></div>
    </div>
    <details>
      <summary>兌獎規則與來源</summary>
      <ul class="note">
        <li>獎項：頭獎 6 個全中、貳獎 5 個＋特別號、參獎 5 個、肆獎 4 個＋特別號、伍獎 4 個（2,000 元）、陸獎 3 個＋特別號（1,000 元）、柒獎 2 個＋特別號（400 元）、普獎 3 個（400 元）。頭獎～肆獎依當期銷售額分配</li>
        <li>各期單注獎金、中獎注數與兌獎截止日直接取自台灣彩券官方開獎資料</li>
        <li>單注獎金 5,000 元以下免稅；超過 5,000 元全額扣 20% 所得稅與 0.4% 印花稅</li>
        <li>複式彩券會展開成所有 6 個號碼的組合逐注兌獎</li>
        <li>App 兌獎只供參考，實際以彩券與台彩公告為準</li>
        <li>來源：<a href="https://www.mirrormedia.mg/external/setn_1905294" target="_blank" rel="noopener">鏡週刊轉述台彩公告</a>、<a href="https://www.nownews.com/news/6860681" target="_blank" rel="noopener">NOWnews 稅率</a>、<a href="https://news.pts.org.tw/article/566848" target="_blank" rel="noopener">公視 5,000 元免稅門檻</a>、<a href="https://www.ctee.com.tw/news/20260422701156-430503" target="_blank" rel="noopener">工商時報 500 萬元以上預約兌獎</a></li>
      </ul>
    </details>`;
  renderBanner(); renderLatest(); renderChecker(); renderMine(); renderHistoryList();
  $('#h-q').value = st.q;
}

export function updateBadge() {
  if (!H) return;
  const has = store.tickets.some((t) => t.period === H.latest.period);
  $('.tabbar a[data-tab="draw"]')?.classList.toggle('dot', has && store.seen !== H.latest.period);
}

// 切到「開獎」分頁時，把最新一期標成已看過
export function onTabShown(tab) {
  if (!H || tab !== 'draw') return;
  if (store.seen !== H.latest.period) {
    renderBanner(); // 先顯示「新」，下次再進來才拿掉
    store.seen = H.latest.period;
  }
  updateBadge();
}

// ---------- 事件 ----------
function currentPeriod() {
  if (st.period !== 'other') return st.period;
  const p = st.other.trim();
  return /^\d{5,6}$/.test(p) ? p : null;
}

function evaluate(save) {
  const nums = [...st.picked].sort((a, b) => a - b);
  const err = validatePick(nums);
  const period = currentPeriod();
  st.msgErr = true;
  if (err) { st.msg = err; st.result = null; return; }
  if (!period) { st.msg = '請輸入 5~6 位數的期別，例如 115090'; st.result = null; return; }
  const s = ticketStatus({ period, nums }, H.byPeriod, H.latest.period);
  st.resultPeriod = period;
  st.result = resultDetail(nums, s);
  st.msg = '';
  if (save) {
    const tickets = store.tickets;
    const dup = tickets.some((t) => t.period === period && t.nums.join() === nums.join());
    if (!dup) {
      tickets.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, period, nums, added: new Date().toISOString() });
      store.tickets = tickets;
    }
    st.msg = dup ? '這張已經在我的彩券裡了' : '已存到我的彩券';
    st.msgErr = false;
    renderMine(); renderBanner(); updateBadge();
  }
}

function exportTickets() {
  const blob = new Blob([JSON.stringify({ app: 'lotto-pwa', version: 1, exportedAt: new Date().toISOString(), tickets: store.tickets }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `大樂透彩券備份-${todayTW()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importTickets(file) {
  try {
    const body = JSON.parse(await file.text());
    const { tickets, added } = mergeTickets(store.tickets, body.tickets ?? body);
    store.tickets = tickets;
    alert(`匯入完成：新增 ${added} 張彩券`);
  } catch {
    alert('匯入失敗：檔案格式不對');
  }
  renderMine(); renderBanner(); updateBadge();
}

function onClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.n) {
    const k = Number(btn.dataset.n);
    if (st.picked.has(k)) st.picked.delete(k);
    else if (st.picked.size < MAX_PICK) st.picked.add(k);
    st.msg = st.picked.size >= MAX_PICK && !st.picked.has(k) ? `最多 ${MAX_PICK} 個號碼` : '';
    st.result = null;
    return renderChecker();
  }
  if (btn.dataset.filter) { st.filter = btn.dataset.filter; return renderMine(); }
  if (btn.dataset.del) {
    if (!confirm('刪除這張彩券？')) return;
    store.tickets = store.tickets.filter((t) => t.id !== btn.dataset.del);
    renderMine(); renderBanner(); updateBadge();
    return;
  }
  switch (btn.dataset.act) {
    case 'clear': st.picked.clear(); st.result = null; st.msg = ''; return renderChecker();
    case 'check': evaluate(false); renderChecker(); return $('#d-check .result, #d-check .note')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    case 'save': evaluate(true); return renderChecker();
    case 'export': return exportTickets();
    case 'import': return $('#imp').click();
    case 'tomine': return $('#d-mine').scrollIntoView({ behavior: 'smooth' });
    case 'more': st.shown += 50; return renderHistoryList();
  }
}

function onChange(e) {
  if (e.target.id === 'c-period') {
    st.period = e.target.value; st.result = null; st.msg = '';
    renderChecker();
    if (st.period === 'other') $('#c-other').focus();
  } else if (e.target.id === 'imp' && e.target.files[0]) {
    importTickets(e.target.files[0]);
  }
}

function onInput(e) {
  if (e.target.id === 'c-other') st.other = e.target.value;
  else if (e.target.id === 'h-q') { st.q = e.target.value; st.shown = 20; renderHistoryList(); }
}

export async function initDraw(latestData) {
  H = await loadHistory(latestData);
  st.period = H.latest.period;
  renderAll();
  const tab = $('#tab-draw');
  tab.addEventListener('click', onClick);
  tab.addEventListener('change', onChange);
  tab.addEventListener('input', onInput);
  updateBadge();
}
