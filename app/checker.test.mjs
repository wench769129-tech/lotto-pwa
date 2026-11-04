import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, checkTicket, validatePick, afterTax, summarize, mergeTickets, ticketStatus, daysUntil, nCr } from './checker.js';

// 第 115102 期實際開獎與獎金（台彩 API）
const draw = {
  period: '115102', numbers: [2, 23, 24, 25, 29, 39], special: 31,
  prize: [0, 937717, 74803, 19093, 2000, 1000, 400, 400],
};

test('各獎項判斷', () => {
  assert.equal(tierOf([2, 23, 24, 25, 29, 39], draw), 0);
  assert.equal(tierOf([2, 23, 24, 25, 29, 31], draw), 1);
  assert.equal(tierOf([2, 23, 24, 25, 29, 1], draw), 2);
  assert.equal(tierOf([2, 23, 24, 25, 31, 1], draw), 3);
  assert.equal(tierOf([2, 23, 24, 25, 3, 1], draw), 4);
  assert.equal(tierOf([2, 23, 24, 31, 3, 1], draw), 5);
  assert.equal(tierOf([2, 23, 31, 4, 3, 1], draw), 6);
  assert.equal(tierOf([2, 23, 24, 4, 3, 1], draw), 7);
  assert.equal(tierOf([2, 23, 4, 5, 3, 1], draw), -1);
  assert.equal(tierOf([2, 31, 4, 5, 3, 1], draw), -1); // 1 個＋特別號沒有獎
});

test('單式兌獎與稅後', () => {
  const r = checkTicket([1, 2, 23, 24, 25, 31], draw); // 4 個＋特別號 = 肆獎
  assert.deepEqual(r.counts, [0, 0, 0, 1, 0, 0, 0, 0]);
  assert.equal(r.gross, 19093);
  assert.equal(r.net, Math.round(19093 * 0.796));
  assert.deepEqual(r.hits, [2, 23, 24, 25]);
  assert.equal(r.specialHit, true);
});

test('5,000 元以下免稅、以上扣 20.4%', () => {
  assert.equal(afterTax(5000), 5000);
  assert.equal(afterTax(2000), 2000);
  assert.equal(afterTax(10000), 7960);
});

test('複式 7 個號碼展開 7 注', () => {
  // 選 2 23 24 25 29 39 31：一注頭獎、六注貳獎（5 個＋特別號）
  const r = checkTicket([2, 23, 24, 25, 29, 39, 31], draw);
  assert.equal(r.lines, 7);
  assert.equal(r.counts[0], 1);
  assert.equal(r.counts[1], 6);
  assert.equal(r.unknown, true); // 這期頭獎無人中，API 單注獎金為 0，金額未知
  assert.equal(r.gross, 937717 * 6);
});

test('號碼檢查', () => {
  assert.equal(validatePick([1, 2, 3, 4, 5, 6]), null);
  assert.match(validatePick([1, 2, 3, 4, 5]), /6 個/);
  assert.match(validatePick([1, 2, 3, 4, 5, 5]), /重複/);
  assert.match(validatePick([1, 2, 3, 4, 5, 50]), /01~49/);
  assert.equal(nCr(16, 6), 8008);
});

test('我的彩券統計與狀態', () => {
  const byP = new Map([['115102', draw]]);
  const tickets = [
    { id: 'a', period: '115102', nums: [1, 2, 23, 24, 3, 4] }, // 普獎 400
    { id: 'b', period: '115102', nums: [1, 3, 4, 5, 6, 7] },   // 未中
    { id: 'c', period: '115103', nums: [1, 3, 4, 5, 6, 7] },   // 待開獎
    { id: 'd', period: '93001', nums: [1, 3, 4, 5, 6, 7] },    // 沒資料
  ];
  const s = summarize(tickets, byP, '115102');
  assert.deepEqual([s.won, s.lost, s.pending, s.nodata, s.cost, s.net], [1, 1, 1, 1, 200, 400]);
  assert.equal(ticketStatus(tickets[2], byP, '115102').status, 'pending');
});

test('匯入備份合併', () => {
  const { tickets, added } = mergeTickets([{ id: 'a', period: '115102', nums: [1, 2, 3, 4, 5, 6] }],
    [{ id: 'a', period: '115102', nums: [1, 2, 3, 4, 5, 6] }, { id: 'b', period: '115103', nums: [9, 8, 7, 6, 5, 4] }, { id: 'x', period: 'abc', nums: [] }]);
  assert.equal(added, 1);
  assert.equal(tickets.length, 2);
  assert.deepEqual(tickets[1].nums, [4, 5, 6, 7, 8, 9]);
});

test('剩幾天', () => {
  assert.equal(daysUntil('2027-02-03', '2027-02-01'), 2);
});
