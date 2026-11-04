import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItem, nextDrawDate, merge, monthsBack } from './fetch-lotto.mjs';

const item = (period, date, nums) => ({ period, lotteryDate: `${date}T00:00:00`, drawNumberSize: nums });

test('parseItem 拆出 6 個獎號與特別號', () => {
  const d = parseItem(item(115101, '2026-10-30', [1, 8, 10, 15, 37, 45, 22]));
  assert.deepEqual(d, { period: '115101', date: '2026-10-30', numbers: [1, 8, 10, 15, 37, 45], special: 22, jackpotPool: null, jackpotWinners: null });
});

test('parseItem 拒絕格式不符的號碼', () => {
  assert.throws(() => parseItem(item(1, '2026-10-30', [1, 2, 3])));
  assert.throws(() => parseItem(item(1, '2026-10-30', [1, 2, 3, 4, 5, 6, 50])));
});

test('nextDrawDate 跳到下一個週二或週五', () => {
  assert.equal(nextDrawDate('2026-10-30'), '2026-11-03'); // 五 → 二
  assert.equal(nextDrawDate('2026-11-03'), '2026-11-06'); // 二 → 五
});

test('monthsBack 以台灣時間計算月份', () => {
  assert.deepEqual(monthsBack(new Date('2026-10-31T17:00:00Z'), 3), ['2026-11', '2026-10', '2026-09']);
});

test('merge 用 overrides 補頭獎，示意資料不沿用', () => {
  const draws = [parseItem(item(115101, '2026-10-30', [1, 8, 10, 15, 37, 45, 22]))];
  const prev = { sample: true, next: { period: '115102', jackpot: 160000000, estSales: 150000000 }, draws: [{ period: '115101', jackpotPool: 1 }] };
  const ov = { draws: { 115101: { jackpotPool: 130000000, jackpotWinners: 0 } }, next: { period: '115102', jackpot: 160000000 } };
  const { next, draws: out } = merge(draws, prev, ov);
  assert.equal(out[0].jackpotPool, 130000000);
  assert.equal(out[0].jackpotWinners, 0);
  assert.deepEqual(next, { period: '115102', date: '2026-11-03', jackpot: 160000000, estSales: 150000000, jackpotEstimated: false });
});

test('merge 沒有下期官方頭獎時沿用舊值並標示估計', () => {
  const draws = [parseItem(item(115102, '2026-11-03', [2, 9, 11, 16, 38, 46, 23]))];
  const prev = { sample: false, next: { period: '115102', jackpot: 160000000, estSales: 150000000 }, draws: [] };
  const { next } = merge(draws, prev, {});
  assert.equal(next.period, '115103');
  assert.equal(next.jackpot, 160000000);
  assert.equal(next.jackpotEstimated, true);
});
