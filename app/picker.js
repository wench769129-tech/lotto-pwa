// 選號模組：先完全隨機選，再刪掉熱門組合（規則見 frontend/wireframe.md）。
// 歷史分布只用來顯示，不影響選號。
import { randomCombo, comboFeatures } from '../split-risk/split-risk.js';

// 命中這些特徵就重選（鍵名對應 split-risk.js 的 comboFeatures）
export const REJECT_KEYS = ['allLe31', 'run', 'fullRun', 'arithmetic', 'sameTail3', 'lastDraw4', 'lastDraw6'];

export const MAX_OVERLAP = 2; // 任兩組最多重複幾個號碼

const key = (nums) => [...nums].sort((a, b) => a - b).join(',');

export function isPopular(nums, { lastDraw = null, pastCombos = new Set() } = {}) {
  if (pastCombos.has(key(nums))) return true;
  return comboFeatures(nums, lastDraw).some((f) => REJECT_KEYS.includes(f.key));
}

export function overlap(a, b) {
  const s = new Set(a);
  return b.filter((n) => s.has(n)).length;
}

/**
 * 選出 count 組號碼。
 * @param {number} count 1~10
 * @param {object} opts lastDraw 上一期正選號；pastDraws 過去各期正選號陣列；rand 亂數函式
 */
export function pickSets(count, { lastDraw = null, pastDraws = [], rand = Math.random, maxTries = 100000 } = {}) {
  if (!(Number.isInteger(count) && count >= 1 && count <= 10)) throw new Error('組數必須是 1~10');
  const pastCombos = new Set(pastDraws.map(key));
  const sets = [];
  for (let tries = 0; sets.length < count; tries++) {
    if (tries >= maxTries) throw new Error('選號失敗，請再試一次');
    const c = randomCombo(rand).sort((a, b) => a - b);
    if (isPopular(c, { lastDraw, pastCombos })) continue;
    if (sets.some((s) => overlap(s, c) > MAX_OVERLAP)) continue;
    sets.push(c);
  }
  return sets;
}
