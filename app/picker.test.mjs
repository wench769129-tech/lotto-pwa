// 執行：node --test picker.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSets, isPopular, overlap, MAX_OVERLAP } from './picker.js';
import { C, matchProb, breakEvenJackpot, drawsLeftInMonth } from './stats.js';

test('選出指定組數，每組 6 個不重複且已排序', () => {
  const sets = pickSets(10);
  assert.equal(sets.length, 10);
  for (const s of sets) {
    assert.equal(new Set(s).size, 6);
    assert.deepEqual(s, [...s].sort((a, b) => a - b));
    assert.ok(s.every((n) => n >= 1 && n <= 49));
  }
});

test('任兩組最多重複 2 個號碼', () => {
  const sets = pickSets(10);
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) assert.ok(overlap(sets[i], sets[j]) <= MAX_OVERLAP);
});

test('選出的號碼都不是熱門組合', () => {
  const lastDraw = [4, 22, 25, 30, 34, 37];
  for (const s of pickSets(10, { lastDraw })) assert.equal(isPopular(s, { lastDraw }), false);
});

test('熱門組合會被判定出來', () => {
  assert.ok(isPopular([1, 5, 9, 17, 23, 28])); // 全在 31 以內
  assert.ok(isPopular([3, 10, 17, 24, 31, 38])); // 等差
  assert.ok(isPopular([33, 34, 35, 41, 44, 49])); // 3 連號
  assert.ok(isPopular([5, 18, 27, 33, 40, 46], { pastCombos: new Set(['5,18,27,33,40,46']) })); // 過去開過
});

test('組數超出範圍會報錯', () => {
  assert.throws(() => pickSets(0));
  assert.throws(() => pickSets(11));
});

test('複式 8 碼為 28 注，對中機率總和為 1', () => {
  assert.equal(C(8, 6), 28);
  assert.equal(C(49, 6), 13983816);
  const total = [0, 1, 2, 3, 4, 5, 6].reduce((a, k) => a + matchProb(8, k), 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
});

test('稅後損益兩平頭獎約 5.9 億', () => {
  assert.ok(Math.abs(breakEvenJackpot() / 1e8 - 5.89) < 0.02);
});

test('2026 年 11 月 1 日起還有 8 期（3、6、10、13、17、20、24、27 日）', () => {
  assert.equal(drawsLeftInMonth(new Date(2026, 10, 1)), 8);
  assert.equal(drawsLeftInMonth(new Date(2026, 10, 27)), 1);
});
