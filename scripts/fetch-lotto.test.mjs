import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItem, nextDrawDate, nextPeriod, displayPeriod, estimateNext, merge, monthsBack, parseHistoryItem, allMonths, monthsToFetch, mergeHistory, formatHistory } from './fetch-lotto.mjs';
import { readFileSync } from 'node:fs';

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

test('parseHistoryItem 存下兌獎截止日與各獎項單注獎金', () => {
  const raw = JSON.parse(readFileSync(new URL('../app/data/raw-sample.json', import.meta.url), 'utf8'));
  const d = parseHistoryItem(raw[0]);
  assert.equal(d.period, '115102');
  assert.equal(d.redeemBy, '2027-02-03');
  assert.deepEqual(d.prize, [0, 937717, 74803, 19093, 2000, 1000, 400, 400]);
  assert.deepEqual(d.winners, [0, 2, 27, 68, 1929, 2414, 25913, 36040]);
});

test('allMonths 從 2004-01 到本月', () => {
  const m = allMonths(new Date('2026-11-04T12:00:00Z'));
  assert.equal(m[0], '2004-01');
  assert.equal(m.at(-1), '2026-11');
  assert.equal(m.length, 23 * 12 - 1);
});

test('monthsToFetch：最近兩個月必抓，已有或確定沒資料的舊月份跳過', () => {
  const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
  const history = { draws: [{ date: '2026-09-01' }, { date: '2026-10-02' }, { date: '2026-11-03' }], emptyMonths: ['2026-08'] };
  assert.deepEqual(monthsToFetch(history, months), ['2026-10', '2026-11']);
  assert.deepEqual(monthsToFetch({ draws: [] }, months), months);
});

test('mergeHistory 新資料覆蓋舊資料並由新到舊排序', () => {
  const out = mergeHistory([{ period: '99104', v: 1 }, { period: '100001', v: 1 }], [{ period: '100001', v: 2 }, { period: '100002', v: 2 }]);
  assert.deepEqual(out.map((d) => d.period), ['100002', '100001', '99104']);
  assert.equal(out[1].v, 2);
});

test('formatHistory 輸出合法 JSON', () => {
  const h = { updatedAt: 'x', emptyMonths: [], draws: [{ period: '1' }, { period: '2' }] };
  assert.deepEqual(JSON.parse(formatHistory(h)), h);
});
