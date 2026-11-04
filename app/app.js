// 大樂透分析 PWA 主程式：讀取 data/latest.json，畫出 4 個分頁。
import { RULES, analyzeCombo, fixedPrizeEV, midPrizeEV, validateCombo } from '../split-risk/split-risk.js';
import { pickSets } from './picker.js';
import { C, matchProb, breakEvenJackpot, drawsLeftInMonth, comboSummary, frequency } from './stats.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n, d = 0) => n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
const yi = (n) => `${fmt(n / 1e8, n >= 1e9 ? 0 : 1)}億`;
const pad = (n) => String(n).padStart(2, '0');
const balls = (nums) => `<div class="balls">${nums.map((n) => `<span class="ball">${pad(n)}</span>`).join('')}</div>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let data;
const state = { picks: [], selected: null, pickCount: 3, packN: 8 };

// ---------- 本機儲存（預算與購買紀錄，只存在這支手機） ----------
const store = {
  get budget() { return JSON.parse(localStorage.getItem('lotto.budget') || '{"monthly":1000,"perDraw":2}'); },
  set budget(v) { localStorage.setItem('lotto.budget', JSON.stringify(v)); },
  get records() { return JSON.parse(localStorage.getItem('lotto.records') || '[]'); },
  set records(v) { localStorage.setItem('lotto.records', JSON.stringify(v)); },
};

function monthSpent() {
  const ym = new Date().toISOString().slice(0, 7);
  return store.records.filter((r) => r.date.startsWith(ym)).reduce((a, r) => a + r.cost, 0);
}

// 平均組合（不考慮熱門度）的每注稅後期望值
function baseline() {
  const r = analyzeCombo([1, 13, 22, 34, 41, 48], { jackpot: data.next.jackpot, sales: data.next.estSales });
  return { ev: r.baseline.ev, jackpotEV: r.baseline.ev - fixedPrizeEV() - midPrizeEV() };
}

// ---------- SVG 小圖 ----------
function barChart(values, labels, { height = 120, highlight = -1, unit = (v) => v } = {}) {
  const w = 320, top = 16, bottom = 20, max = Math.max(...values) || 1;
  const bw = w / values.length;
  const bars = values.map((v, i) => {
    const h = ((height - top - bottom) * v) / max;
    const x = i * bw + bw * 0.15, y = height - bottom - h;
    const fill = i === highlight ? 'var(--accent)' : 'var(--bar)';
    const showVal = values.length <= 10 || i === values.length - 1 || i === highlight;
    return `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${h}" rx="3" fill="${fill}"/>` +
      (showVal ? `<text x="${x + bw * 0.35}" y="${y - 3}" text-anchor="middle">${unit(v)}</text>` : '') +
      (labels[i] ? `<text x="${x + bw * 0.35}" y="${height - 5}" text-anchor="middle">${labels[i]}</text>` : '');
  });
  return `<svg viewBox="0 0 ${w} ${height}" role="img">${bars.join('')}</svg>`;
}

// ---------- 分頁 1：期望值 ----------
function renderEV() {
  const b = baseline();
  const net = b.ev - RULES.price;
  const left = store.budget.monthly - monthSpent();
  const be = breakEvenJackpot();
  const nextDate = new Date(data.next.date);
  const wk = '日一二三四五六'[nextDate.getDay()];
  const recent = data.draws.slice(0, 20).reverse();
  const parts = [fixedPrizeEV(), midPrizeEV(), b.jackpotEV];
  const pct = Math.min(100, (b.ev / RULES.price) * 100);

  $('#tab-ev').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="lab">下期頭獎</div><div class="val">${yi(data.next.jackpot)}</div></div>
      <div class="kpi"><div class="lab">每注稅後期望</div><div class="val ${net < 0 ? 'neg' : 'pos'}">${net < 0 ? '−' : '+'}${fmt(Math.abs(net))}元</div></div>
      <a class="kpi" href="#budget"><div class="lab">本月預算</div><div class="val ${left < 0 ? 'neg' : ''}">餘${fmt(left)}</div></a>
    </div>
    <p class="note">下期開獎 ${data.next.date.slice(5).replace('-', '/')}（${wk}）・第 ${data.next.period} 期${data.next.jackpotEstimated ? '・頭獎為估計值（上期累積＋預估提撥）' : ''}</p>

    <h2>每注 50 元能拿回多少</h2>
    <div class="card">
      <div class="row"><span class="big">${fmt(b.ev, 1)} 元</span><span class="note">成本 50 元</span></div>
      <div class="meter"><div style="width:${pct}%"></div></div>
      <div class="row"><span>固定獎（伍～普獎）</span><span>${fmt(parts[0], 2)} 元</span></div>
      <div class="row"><span>貳～肆獎（稅後）</span><span>${fmt(parts[1], 2)} 元</span></div>
      <div class="row"><span>頭獎（稅後、含分獎）</span><span>${fmt(parts[2], 2)} 元</span></div>
    </div>

    <h2>頭獎累積（近 ${recent.length} 期）</h2>
    <div class="card">
      ${barChart(recent.map((d) => d.jackpotPool / 1e8), recent.map((d, i) => (i % 4 === 0 ? d.date.slice(5).replace('-', '/') : '')), { highlight: recent.length - 1, unit: (v) => fmt(v, 1) })}
      <p class="note">單位：億元。這是獎金累積，不是號碼走勢。</p>
    </div>

    <h2>損益兩平頭獎</h2>
    <div class="card">
      <div class="row"><span>稅後打平需要</span><span class="big">約 ${yi(be)}</span></div>
      <div class="row"><span>目前頭獎</span><span>${yi(data.next.jackpot)}（還差 ${yi(Math.max(0, be - data.next.jackpot))}）</span></div>
      <p class="note">假設一人獨得。實際上頭獎越高買的人越多，分獎機率也越高。</p>
    </div>

    <details>
      <summary>計算方式與官方來源</summary>
      <ul class="note">
        <li>總獎金為銷售額 56%，扣除固定獎後，頭獎分 82%、貳獎 6.5%、參獎 7%、肆獎 4.5%</li>
        <li>單注獎金超過 5,000 元扣 20% 所得稅與 0.4% 印花稅，實拿 79.6%</li>
        <li>分獎依下期預估銷售額 ${yi(data.next.estSales)}（估計值）用卜瓦松分布推算</li>
        <li>來源：<a href="https://www.mirrormedia.mg/external/setn_1905294" target="_blank" rel="noopener">鏡週刊轉述台彩公告</a>、<a href="https://www.nownews.com/news/6860681" target="_blank" rel="noopener">NOWnews 稅率</a>（2026-10-31 查證）</li>
      </ul>
    </details>`;
}

// ---------- 分頁 2：號碼特徵（含選號） ----------
function analysisCard(nums) {
  const err = validateCombo(nums);
  if (err) return `<div class="card neg">${err}</div>`;
  const s = comboSummary(nums);
  const r = analyzeCombo(nums, { jackpot: data.next.jackpot, sales: data.next.estSales, lastDraw: data.draws[0].numbers });
  const dots = { low: 1, medium: 3, high: 5 }[r.riskLevel];
  const label = { low: '低', medium: '中', high: '高' }[r.riskLevel];
  const inRange = s.sum >= 115 && s.sum <= 185;
  return `
    <h2>這組號碼的特徵</h2>
    <div class="card">
      ${balls(r.numbers)}
      <div class="row" style="margin-top:8px"><span>總和</span><span>${s.sum}（${inRange ? '在' : '不在'}常見區間 115~185）</span></div>
      <div class="row"><span>奇偶</span><span>${s.odd}:${s.even}</span></div>
      <div class="row"><span>大小（25 以上為大）</span><span>${s.big}:${s.small}</span></div>
      <div class="row"><span>連號</span><span>${s.pairs} 組</span></div>
      <div class="row"><span>同尾數</span><span>${s.sameTail} 組</span></div>
    </div>
    <h2>跟別人撞號的風險</h2>
    <div class="card">
      <div class="row"><span class="dots ${r.riskLevel}">${'●'.repeat(dots)}${'○'.repeat(5 - dots)}</span><span class="${r.riskLevel}">${label}・熱門倍數 ${fmt(r.multiplier, 2)}</span></div>
      <div class="row"><span>中頭獎時預估實拿</span><span>${yi(r.takeHomeIfWin)}</span></div>
      <div class="row"><span>比平均組合</span><span class="${r.evVsAverage < 0 ? 'neg' : 'pos'}">${r.evVsAverage < 0 ? '−' : '+'}${fmt(Math.abs(r.evVsAverage), 2)} 元/注</span></div>
      ${r.features.length ? `<p class="note">命中特徵：${r.features.map((f) => esc(f.label)).join('、')}</p>` : ''}
      <p class="note">每組號碼的中獎機率都一樣。冷門組合中頭獎時，跟你分獎金的人比較少。熱門倍數是估計值。</p>
    </div>`;
}

function heatGrid() {
  const f = frequency(data.draws);
  const max = Math.max(...f.slice(1)), min = Math.min(...f.slice(1));
  const cells = [];
  for (let n = 1; n <= 49; n++) {
    const t = max === min ? 0.5 : (f[n] - min) / (max - min);
    cells.push(`<div style="background:color-mix(in srgb, var(--accent) ${Math.round(8 + t * 60)}%, transparent)" title="${f[n]} 次">${pad(n)}</div>`);
  }
  return `<div class="heat">${cells.join('')}</div>
    <p class="note">近 ${data.draws.length} 期各號碼出現次數，顏色越深越多。只供參考：過去開出的號碼不影響未來，選號時也不會用到。</p>`;
}

function renderNums() {
  const sel = state.selected;
  $('#tab-nums').innerHTML = `
    <h2>幫我選號</h2>
    <div class="card">
      <div class="row"><span>組數（1~10）</span>
        <div class="stepper"><button data-act="dec" aria-label="減少">−</button><output>${state.pickCount}</output><button data-act="inc" aria-label="增加">＋</button></div></div>
      <button class="primary" data-act="pick">幫我選號</button>
      <div id="picks">${state.picks.map((p, i) => `
        <div class="set ${sel === i ? 'sel' : ''}"><span class="idx">${'①②③④⑤⑥⑦⑧⑨⑩'[i]}</span>${balls(p)}<button data-act="analyze" data-i="${i}">分析</button></div>`).join('')}</div>
      ${state.picks.length > 1 ? '<p class="note">任兩組最多重複 2 個號碼</p>' : ''}
      <details><summary>已避開哪些組合</summary><ul class="note">
        <li>6 個號碼都在 31 以內（生日型）</li><li>3 個以上連號，或 6 個號碼呈等差</li>
        <li>同一個尾數出現 3 個以上</li><li>跟過去開出的號碼或上一期重複 4 個以上</li>
        <li>選號單上排成圖形：官方選號單版面還沒查證，暫不納入</li></ul></details>
    </div>
    <h2>或自己輸入 6 個號碼</h2>
    <div class="card">
      <div class="num-inputs">${Array.from({ length: 6 }, () => '<input inputmode="numeric" maxlength="2">').join('')}</div>
      <button class="primary" data-act="manual">分析這組</button>
    </div>
    <div id="analysis">${state.analysis ? analysisCard(state.analysis) : ''}</div>
    <h2>歷史分布（純統計）</h2>
    <div class="card">${heatGrid()}</div>`;
}

function onNumsClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'dec' || act === 'inc') {
    state.pickCount = Math.min(10, Math.max(1, state.pickCount + (act === 'inc' ? 1 : -1)));
  } else if (act === 'pick') {
    state.picks = pickSets(state.pickCount, { lastDraw: data.draws[0].numbers, pastDraws: data.draws.map((d) => d.numbers) });
    state.selected = 0;
    state.analysis = state.picks[0];
  } else if (act === 'analyze') {
    state.selected = Number(btn.dataset.i);
    state.analysis = state.picks[state.selected];
  } else if (act === 'manual') {
    state.selected = null;
    state.analysis = [...document.querySelectorAll('.num-inputs input')].map((i) => Number(i.value));
  } else return;
  renderNums();
  if (act === 'analyze' || act === 'manual') $('#analysis').scrollIntoView({ behavior: 'smooth' });
}

// ---------- 分頁 3：包牌 ----------
function renderPack() {
  const n = state.packN;
  const tickets = C(n, 6);
  const range = Array.from({ length: 10 }, (_, i) => i + 7);
  const rows = [6, 5, 4, 3].map((k) => {
    const p = matchProb(n, k);
    return `<tr><td>對中 ${k} 個</td><td>${p > 0 ? `1 / ${fmt(Math.round(1 / p))}` : '—'}</td></tr>`;
  }).join('');
  $('#tab-pack').innerHTML = `
    <h2>包牌方式：複式</h2>
    <div class="card">
      <div class="row"><span>選幾個號碼（7~16）</span>
        <div class="stepper"><button data-act="dec" aria-label="減少">−</button><output>${n}</output><button data-act="inc" aria-label="增加">＋</button></div></div>
    </div>
    <h2>成本與覆蓋</h2>
    <div class="card">
      <div class="row"><span>注數</span><span>${fmt(tickets)} 注</span></div>
      <div class="row"><span>成本</span><span class="big">${fmt(tickets * RULES.price)} 元</span></div>
      <div class="row"><span>頭獎機率</span><span>1 / ${fmt(Math.round(RULES.totalCombos / tickets))}</span></div>
      <div class="row"><span>單注頭獎機率</span><span>1 / ${fmt(RULES.totalCombos)}</span></div>
    </div>
    <h2>選號數與成本</h2>
    <div class="card">
      ${barChart(range.map((k) => C(k, 6) * RULES.price), range.map(String), { highlight: n - 7, unit: (v) => (v >= 10000 ? `${fmt(v / 10000, 1)}萬` : fmt(v)) })}
      <p class="note">成本和頭獎機率同步放大：不管包多少，每花 50 元換到的頭獎機率都一樣是 1 / ${fmt(RULES.totalCombos)}。</p>
    </div>
    <h2>正選號對中機率</h2>
    <div class="card"><table><tr><th>開出的 6 個正選號中</th><th>機率</th></tr>${rows}</table>
      <p class="note">指 6 個正選號有幾個落在你選的 ${n} 個號碼裡。特別號另計。</p></div>
    <div class="warn">包牌只是一次買很多注，機率增加多少，成本就增加多少，期望值仍然是負的。</div>`;
}

function onPackClick(e) {
  const act = e.target.closest('button')?.dataset.act;
  if (act !== 'dec' && act !== 'inc') return;
  state.packN = Math.min(16, Math.max(7, state.packN + (act === 'inc' ? 1 : -1)));
  renderPack();
}

// ---------- 分頁 4：預算 ----------
function renderBudget() {
  const { monthly, perDraw } = store.budget;
  const spent = monthSpent();
  const left = monthly - spent;
  const draws = drawsLeftInMonth();
  const suggest = draws ? Math.max(0, Math.floor(left / RULES.price / draws)) : 0;
  const ev = baseline().ev;
  const yearTickets = perDraw * 104;
  const yearCost = yearTickets * RULES.price;
  const yearBack = yearTickets * ev;
  const recs = store.records.slice().reverse();
  $('#tab-budget').innerHTML = `
    <h2>預算設定</h2>
    <div class="card">
      <div class="form-row"><label for="b-monthly">每月預算（元）</label><input id="b-monthly" inputmode="numeric" value="${monthly}"></div>
      <div class="form-row"><label for="b-per">每期買幾注</label><input id="b-per" inputmode="numeric" value="${perDraw}"></div>
    </div>
    <h2>本月進度</h2>
    <div class="card">
      <div class="row"><span>已花 ${fmt(spent)} / ${fmt(monthly)} 元</span><span class="${left < 0 ? 'neg' : ''}">餘 ${fmt(left)} 元</span></div>
      <div class="meter ${left < 0 ? 'over' : ''}"><div style="width:${Math.min(100, monthly ? (spent / monthly) * 100 : 0)}%"></div></div>
      <p class="note">${left < 0 ? '本月已超出預算，建議這個月先停手。' : `本月還有 ${draws} 期，建議每期最多 ${suggest} 注。`}</p>
    </div>
    <h2>長期試算（依目前頭獎估算）</h2>
    <div class="card">
      <div class="row"><span>一年投入（每期 ${perDraw} 注 × 104 期）</span><span>${fmt(yearCost)} 元</span></div>
      <div class="row"><span>預期拿回</span><span>約 ${fmt(Math.round(yearBack / 100) * 100)} 元</span></div>
      <div class="row"><span>預期損失</span><span class="neg">約 ${fmt(Math.round((yearCost - yearBack) / 100) * 100)} 元</span></div>
      <p class="note">期望值是長期平均，實際結果大多是拿回更少，少數人中大獎。</p>
    </div>
    <h2>購買紀錄（只存在這支手機）</h2>
    <div class="card">
      ${recs.length ? recs.map((r, i) => `<div class="row"><span>${r.date.slice(5).replace('-', '/')}　${r.tickets} 注</span><span>${fmt(r.cost)} 元 <button class="rec-del" data-del="${recs.length - 1 - i}" aria-label="刪除">✕</button></span></div>`).join('') : '<p class="note">還沒有紀錄</p>'}
      <div class="form-row" style="margin-top:6px"><input id="r-date" type="date" value="${new Date().toISOString().slice(0, 10)}" style="width:auto"><input id="r-n" inputmode="numeric" value="${perDraw}" style="width:60px"><span>注</span></div>
      <button class="primary" data-act="add">＋ 新增紀錄</button>
    </div>`;
}

function onBudgetChange(e) {
  if (e.target.id !== 'b-monthly' && e.target.id !== 'b-per') return;
  store.budget = { monthly: Math.max(0, Number($('#b-monthly').value) || 0), perDraw: Math.max(0, Number($('#b-per').value) || 0) };
  renderBudget();
  renderEV();
}

function onBudgetClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const recs = store.records;
  if (btn.dataset.act === 'add') {
    const tickets = Math.max(1, Math.floor(Number($('#r-n').value) || 0));
    recs.push({ date: $('#r-date').value, tickets, cost: tickets * RULES.price });
    recs.sort((a, b) => a.date.localeCompare(b.date));
  } else if (btn.dataset.del !== undefined) {
    recs.splice(Number(btn.dataset.del), 1);
  } else return;
  store.records = recs;
  renderBudget();
  renderEV();
}

// ---------- 分頁切換與啟動 ----------
function showTab() {
  const tab = (location.hash || '#ev').slice(1);
  for (const s of document.querySelectorAll('.tab')) s.classList.toggle('on', s.id === `tab-${tab}`);
  for (const a of document.querySelectorAll('.tabbar a')) a.classList.toggle('on', a.dataset.tab === tab);
  window.scrollTo(0, 0);
}

async function init() {
  data = await fetch('data/latest.json', { cache: 'no-cache' }).then((r) => r.json());
  const upd = new Date(data.updatedAt);
  const el = $('#updated');
  el.textContent = `資料更新 ${upd.getMonth() + 1}/${upd.getDate()}`;
  el.classList.toggle('stale', Date.now() - upd > 4 * 864e5);
  $('#sample-banner').hidden = !data.sample;

  renderEV(); renderNums(); renderPack(); renderBudget();
  $('#tab-nums').addEventListener('click', onNumsClick);
  $('#tab-pack').addEventListener('click', onPackClick);
  $('#tab-budget').addEventListener('change', onBudgetChange);
  $('#tab-budget').addEventListener('click', onBudgetClick);
  addEventListener('hashchange', showTab);
  showTab();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

init();
