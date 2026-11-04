import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItem, nextDrawDate, nextPeriod, displayPeriod, estimateNext, merge, monthsBack } from './fetch-lotto.mjs';

// 依 2026-11-04 台彩 API 實際回傳格式（app/data/raw-sample.json）
const item = (period, date, nums, jp = {}, sellAmount = 100000000) => ({
  period, lotteryDate: `${date}T00:00:00`, drawNumberSize: nums, sellAmount,
  jackpotAssign: { prize: 22000000, lastPrize: 0, winnerCount: 0, perPrize: 0, ...jp },
});

test('parseItem 拆出獎號、特別號與頭獎總額', () => {
  const d = parseItem(item(115000102, '2026-11-03', [2, 23, 24, 25, 29, 39, 31],
    { prize: 23659341, lastPrize: 136574100, winnerCount: 0 }, 106975100));
  assert.equal(d.period, '115102');
  assert.deepEqual(d.numbers, [2, 23, 24, 25, 29, 39]);
  assert.equal(d.special, 31);
  assert.equal(d.jackpotPool, 160233441);
  assert.equal(d.jackpotWinners, 0);
  assert.equal(d.sales, 106975100);
});

test('parseItem 拒絕格式不符的號碼', () => {
  assert.throws(() => parseItem(item(1, '2026-10-30', [1, 2, 3])));
  assert.throws(() => parseItem(item(1, '2026-10-30', [1, 2, 3, 4, 5, 6, 50])));
});

test('期別轉換與下一期', () => {
  assert.equal(displayPeriod(115000102), '115102');
  assert.equal(nextPeriod('115102', '2026-11-06'), '115103');
  assert.equal(nextPeriod('115104', '2027-01-01'), '116001');
});

test('nextDrawDate 跳到下一個週二或週五', () => {
  assert.equal(nextDrawDate('2026-10-30'), '2026-11-03');
  assert.equal(nextDrawDate('2026-11-03'), '2026-11-06');
});

test('monthsBack 以台灣時間計算月份', () => {
  assert.deepEqual(monthsBack(new Date('2026-10-31T17:00:00Z'), 3), ['2026-11', '2026-10', '2026-09']);
});

test('estimateNext 無人中頭獎時累積，有人中則重新起算', () => {
  const miss = [parseItem(item(115000102, '2026-11-03', [1, 2, 3, 4, 5, 6, 7], { prize: 22000000, lastPrize: 100000000 }))];
  assert.deepEqual(estimateNext(miss), { jackpot: 144000000, estSales: 100000000 });
  const hit = [parseItem(item(115000102, '2026-11-03', [1, 2, 3, 4, 5, 6, 7], { prize: 22000000, lastPrize: 100000000, winnerCount: 1 }))];
  assert.deepEqual(estimateNext(hit), { jackpot: 22000000, estSales: 100000000 });
});

test('merge 輸出前端格式並標示下期頭獎為估計', () => {
  const draws = [parseItem(item(115000102, '2026-11-03', [1, 2, 3, 4, 5, 6, 7], { lastPrize: 100000000 }))];
  const { next, draws: out } = merge(draws, null, {});
  assert.deepEqual(Object.keys(out[0]), ['period', 'date', 'numbers', 'special', 'jackpotPool', 'jackpotWinners']);
  assert.deepEqual(next, { period: '115103', date: '2026-11-06', jackpot: 144000000, estSales: 100000000, jackpotEstimated: true });
});

test('merge 套用 overrides 的官方下期頭獎', () => {
  const draws = [parseItem(item(115000102, '2026-11-03', [1, 2, 3, 4, 5, 6, 7]))];
  const { next } = merge(draws, null, { next: { period: '115103', jackpot: 150000000 } });
  assert.equal(next.jackpot, 150000000);
  assert.equal(next.jackpotEstimated, false);
});
