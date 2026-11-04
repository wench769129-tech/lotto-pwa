// 純計算工具：組合數、超幾何分布、開獎日、號碼特徵摘要。
import { RULES, fixedPrizeEV, midPrizeEV } from '../split-risk/split-risk.js';

export function C(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

// 複式選 n 個號碼時，6 個正選號中有 k 個落在你選的號碼裡的機率
export function matchProb(n, k) {
  return (C(n, k) * C(49 - n, 6 - k)) / RULES.totalCombos;
}

// 稅後損益兩平的頭獎金額（假設一人獨得、忽略分獎）
export function breakEvenJackpot() {
  return ((RULES.price - fixedPrizeEV() - midPrizeEV()) / RULES.taxKeep) * RULES.totalCombos;
}

// 從 from 當天到月底還有幾期（每週二、五開獎）
export function drawsLeftInMonth(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const month = d.getMonth();
  let n = 0;
  for (; d.getMonth() === month; d.setDate(d.getDate() + 1)) if (d.getDay() === 2 || d.getDay() === 5) n++;
  return n;
}

export function comboSummary(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const odd = s.filter((n) => n % 2).length;
  const big = s.filter((n) => n >= 25).length;
  let pairs = 0;
  for (let i = 1; i < 6; i++) if (s[i] === s[i - 1] + 1) pairs++;
  const tails = {};
  for (const n of s) tails[n % 10] = (tails[n % 10] || 0) + 1;
  const sameTail = Object.values(tails).filter((v) => v >= 2).length;
  return { sum: s.reduce((a, b) => a + b, 0), odd, even: 6 - odd, big, small: 6 - big, pairs, sameTail };
}

// 各號碼在 draws 中出現的次數（只算正選號）
export function frequency(draws) {
  const f = Array(50).fill(0);
  for (const d of draws) for (const n of d.numbers) f[n]++;
  return f;
}
