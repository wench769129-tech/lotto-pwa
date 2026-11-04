// 執行：node --test split-risk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './split-risk.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('固定獎期望值 14.57 元', () => close(m.fixedPrizeEV(), 203770000 / 13983816));

test('固定獎中獎組合數與機率表一致', () => {
  const C = (n, k) => (k === 0 ? 1 : (n * C(n - 1, k - 1)) / k);
  assert.equal(C(49, 6), m.RULES.totalCombos);
  assert.equal(m.RULES.fixed.fifth[1], C(6, 4) * C(42, 2));
  assert.equal(m.RULES.fixed.sixth[1], C(6, 3) * C(42, 2));
  assert.equal(m.RULES.fixed.seventh[1], C(6, 2) * C(42, 3));
  assert.equal(m.RULES.fixed.general[1], C(6, 3) * C(42, 3));
});

test('貳～肆獎稅後期望值約 1.92 元', () => close(m.midPrizeEV(), 1.924, 0.001));

test('分獎係數：λ=0 為 1，λ 越大越小', () => {
  assert.equal(m.splitFactor(0), 1);
  close(m.splitFactor(1), 1 - Math.exp(-1));
  assert.ok(m.splitFactor(2) < m.splitFactor(1));
});

test('平均組合的熱門倍數約為 1', () => {
  const rand = Math.random;
  let total = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) total += m.popularityMultiplier(m.randomCombo(rand));
  close(total / n, 1, 0.05);
});

test('生日型、規律、上期號碼比冷門組合熱門', () => {
  const last = [4, 22, 25, 30, 34, 37];
  const cold = m.popularityMultiplier([3, 15, 22, 34, 41, 47], { lastDraw: last });
  assert.ok(m.popularityMultiplier([1, 4, 7, 11, 13, 29]) > cold);
  assert.ok(m.popularityMultiplier([1, 2, 3, 4, 5, 6]) > m.popularityMultiplier([1, 4, 7, 11, 13, 29]));
  assert.ok(m.popularityMultiplier([7, 14, 21, 28, 35, 42]) > cold);
  assert.ok(m.popularityMultiplier(last, { lastDraw: last }) > cold);
});

test('熱門組合的每注期望值低於平均組合', () => {
  const r = m.analyzeCombo([1, 2, 3, 4, 5, 6], { jackpot: 1.6e8, sales: 1.5e8 });
  assert.ok(r.evVsAverage < 0);
  assert.equal(r.riskLevel, 'high');
  assert.ok(r.takeHomeIfWin < 1.6e8 * 0.796);
});

test('電腦選號比例 100% 時每組都一樣', () => {
  close(m.popularityMultiplier([1, 2, 3, 4, 5, 6], { quickPickShare: 1 }), 1);
});

test('輸入檢查', () => {
  assert.throws(() => m.analyzeCombo([1, 2, 3], { jackpot: 1, sales: 1 }));
  assert.throws(() => m.analyzeCombo([1, 1, 2, 3, 4, 5], { jackpot: 1, sales: 1 }));
  assert.throws(() => m.analyzeCombo([0, 2, 3, 4, 5, 6], { jackpot: 1, sales: 1 }));
  assert.throws(() => m.analyzeCombo([1, 2, 3, 4, 5, 6], {}));
});
