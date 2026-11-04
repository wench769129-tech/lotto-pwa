// 大樂透分獎期望值模組（方案A：規則式熱門倍數）
// 純 ES module，不依賴任何套件，可直接在瀏覽器或 Node 使用。
//
// 規則數字查證於 2026-10-31（來源見 README.md）。
// 熱門倍數的權重是人工估計，不是官方資料；畫面上必須標示「估計值」。

export const RULES = {
  price: 50,
  totalCombos: 13983816, // C(49,6)
  poolRate: 0.56, // 總獎金占銷售額
  floatShares: { first: 0.82, second: 0.065, third: 0.07, fourth: 0.045 },
  // 固定獎：[獎金, 中獎組合數]
  fixed: {
    fifth: [2000, 12915], // 4 個
    sixth: [1000, 17220], // 3 個 + 特別號
    seventh: [400, 172200], // 2 個 + 特別號
    general: [400, 229600], // 3 個
  },
  taxFreeLimit: 5000, // 單注獎金超過此數才扣稅
  taxKeep: 0.796, // 扣 20% 所得稅 + 0.4% 印花稅後實拿比例
};

// 預設假設（皆為估計，可由呼叫端覆寫）
export const DEFAULTS = {
  quickPickShare: 0.5, // 電腦選號比例：未查到官方數字，先假設一半
  normSamples: 100000, // 計算平均熱門度的抽樣數
};

// 特徵權重（對數尺度，exp 後為人工選號者的相對熱門度）
export const WEIGHTS = {
  allLe31: 1.0, // 6 個都在 31 以內（生日型）
  fiveLe31: 0.4, // 5 個在 31 以內
  allLe12: 0.8, // 6 個都在 12 以內（月份型，再加分）
  runPerExtra: 0.5, // 連號長度 3 以上，每多 1 個加分
  fullRun: 3.0, // 6 個全連號（如 01~06）
  arithmetic: 2.5, // 6 個呈等差
  sameTail3: 0.3, // 同尾數 3 個以上
  lastDraw4: 1.0, // 與上一期正選號重複 4 個以上
  lastDraw6: 2.5, // 與上一期正選號完全相同
  sumExtreme: 0.5, // 總和低於 90 或高於 210
  high3: -0.2, // 3 個以上大於 40（較少人選）
};

const FEATURE_LABELS = {
  allLe31: '6 個號碼都在 31 以內（生日型）',
  fiveLe31: '5 個號碼在 31 以內',
  allLe12: '6 個號碼都在 12 以內（月份型）',
  run: '有 3 個以上連號',
  fullRun: '6 個全是連號',
  arithmetic: '6 個號碼呈等差',
  sameTail3: '同一尾數出現 3 個以上',
  lastDraw4: '與上一期號碼重複 4 個以上',
  lastDraw6: '與上一期號碼完全相同',
  sumExtreme: '總和過低或過高',
  high3: '3 個以上大於 40（較冷門）',
};

export function validateCombo(nums) {
  if (!Array.isArray(nums) || nums.length !== 6) return '請輸入 6 個號碼';
  const set = new Set(nums);
  if (set.size !== 6) return '號碼不能重複';
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 49)) return '號碼必須是 1~49 的整數';
  return null;
}

// 找出組合命中的特徵，回傳 [{key, weight, label}]
export function comboFeatures(nums, lastDraw = null) {
  const s = [...nums].sort((a, b) => a - b);
  const hits = [];
  const add = (key, weight, labelKey = key) => hits.push({ key, weight, label: FEATURE_LABELS[labelKey] });

  const le31 = s.filter((n) => n <= 31).length;
  if (le31 === 6) add('allLe31', WEIGHTS.allLe31);
  else if (le31 === 5) add('fiveLe31', WEIGHTS.fiveLe31);
  if (s[5] <= 12) add('allLe12', WEIGHTS.allLe12);

  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < 6; i++) {
    run = s[i] === s[i - 1] + 1 ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  if (maxRun === 6) add('fullRun', WEIGHTS.fullRun);
  else if (maxRun >= 3) add('run', WEIGHTS.runPerExtra * (maxRun - 2));

  const d = s[1] - s[0];
  if (maxRun !== 6 && s.every((n, i) => i === 0 || n - s[i - 1] === d)) add('arithmetic', WEIGHTS.arithmetic);

  const tails = {};
  for (const n of s) tails[n % 10] = (tails[n % 10] || 0) + 1;
  if (Math.max(...Object.values(tails)) >= 3) add('sameTail3', WEIGHTS.sameTail3);

  if (lastDraw && lastDraw.length >= 6) {
    const last = new Set(lastDraw.slice(0, 6));
    const overlap = s.filter((n) => last.has(n)).length;
    if (overlap === 6) add('lastDraw6', WEIGHTS.lastDraw6);
    else if (overlap >= 4) add('lastDraw4', WEIGHTS.lastDraw4);
  }

  const sum = s.reduce((a, b) => a + b, 0);
  if (sum < 90 || sum > 210) add('sumExtreme', WEIGHTS.sumExtreme);
  if (s.filter((n) => n > 40).length >= 3) add('high3', WEIGHTS.high3);

  return hits;
}

function rawPopularity(nums, lastDraw) {
  return Math.exp(comboFeatures(nums, lastDraw).reduce((a, h) => a + h.weight, 0));
}

// 固定種子的亂數，讓平均熱門度每次算出來都一樣
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomCombo(rand = Math.random) {
  const pool = Array.from({ length: 49 }, (_, i) => i + 1);
  for (let i = 0; i < 6; i++) {
    const j = i + Math.floor(rand() * (49 - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 6);
}

// 所有組合的平均原始熱門度（抽樣估計），用來把倍數正規化成「平均組合 = 1」
const normCache = new Map();
export function averageRawPopularity(lastDraw = null, samples = DEFAULTS.normSamples) {
  const key = `${lastDraw ? lastDraw.slice(0, 6).join(',') : ''}|${samples}`;
  if (normCache.has(key)) return normCache.get(key);
  const rand = mulberry32(20261031);
  let total = 0;
  for (let i = 0; i < samples; i++) total += rawPopularity(randomCombo(rand), lastDraw);
  const avg = total / samples;
  normCache.set(key, avg);
  return avg;
}

// 熱門倍數：這組號碼被買的注數 ÷ 平均每組被買的注數
export function popularityMultiplier(nums, { lastDraw = null, quickPickShare = DEFAULTS.quickPickShare } = {}) {
  const manual = rawPopularity(nums, lastDraw) / averageRawPopularity(lastDraw);
  return quickPickShare + (1 - quickPickShare) * manual;
}

// 已中頭獎時，平均能分到的比例：E[1/(1+K)]，K ~ Poisson(λ)
export function splitFactor(lambda) {
  if (lambda < 1e-9) return 1;
  return (1 - Math.exp(-lambda)) / lambda;
}

export function fixedPrizeEV() {
  const { fixed, totalCombos } = RULES;
  return Object.values(fixed).reduce((a, [prize, count]) => a + prize * count, 0) / totalCombos;
}

// 貳～肆獎的稅後期望值（近似：忽略累積與熱門度對分獎的影響）
export function midPrizeEV() {
  const { price, poolRate, floatShares: f } = RULES;
  const floating = price * poolRate - fixedPrizeEV();
  return floating * (f.second + f.third + f.fourth) * RULES.taxKeep;
}

function afterTax(amount) {
  return amount > RULES.taxFreeLimit ? amount * RULES.taxKeep : amount;
}

/**
 * 主函式：分析一組號碼的分獎風險與每注期望值。
 * @param {number[]} nums 6 個正選號
 * @param {object} opts
 *   jackpot        下期頭獎金額（元）
 *   sales          下期預估銷售額（元），用來推算總注數
 *   lastDraw       上一期正選號（可省略）
 *   quickPickShare 電腦選號比例（預設 0.5，估計）
 */
export function analyzeCombo(nums, { jackpot, sales, lastDraw = null, quickPickShare } = {}) {
  const err = validateCombo(nums);
  if (err) throw new Error(err);
  if (!(jackpot > 0) || !(sales > 0)) throw new Error('需要頭獎金額與預估銷售額');

  const { price, totalCombos } = RULES;
  const tickets = sales / price;
  const multiplier = popularityMultiplier(nums, { lastDraw, quickPickShare });
  const lambda = (tickets * multiplier) / totalCombos; // 其他人買到同一組的期望注數
  const factor = splitFactor(lambda);

  const baseLambda = tickets / totalCombos;
  const baseFactor = splitFactor(baseLambda);

  const fixedEV = fixedPrizeEV();
  const midEV = midPrizeEV();
  const jackpotEV = (afterTax(jackpot) * factor) / totalCombos;
  const baseJackpotEV = (afterTax(jackpot) * baseFactor) / totalCombos;
  const ev = fixedEV + midEV + jackpotEV;
  const baseEV = fixedEV + midEV + baseJackpotEV;

  return {
    numbers: [...nums].sort((a, b) => a - b),
    features: comboFeatures(nums, lastDraw),
    multiplier, // 熱門倍數（估計）
    expectedSharers: lambda, // 預估其他同組注數
    soloChance: Math.exp(-lambda), // 獨得頭獎的機率（已中頭獎前提下）
    takeHomeIfWin: afterTax(jackpot) * factor, // 中頭獎時預估實拿
    ev, // 每注稅後期望值
    evBreakdown: { fixed: fixedEV, mid: midEV, jackpot: jackpotEV },
    baseline: { multiplier: 1, expectedSharers: baseLambda, takeHomeIfWin: afterTax(jackpot) * baseFactor, ev: baseEV },
    evVsAverage: ev - baseEV, // 比平均組合多（正）或少（負）幾元
    riskLevel: multiplier >= 3 ? 'high' : multiplier >= 1.3 ? 'medium' : 'low',
  };
}
