const assert = require('node:assert/strict');
const test = require('node:test');

const {
  metricNumber,
  nextJuguangRuns,
  normalizeRealtimeReportRows,
  juguangFetchWindows,
  juguangDataStatusForRange,
  summarizeJuguangMetrics,
  shouldRefreshJuguangToken,
  validateDateRange,
  yesterdayShanghai,
} = require('../dist/services/juguangService.js');

function reportRow(data) {
  return {
    reportDate: '2026-09-05',
    entityId: '7890257',
    entityName: '聚光账户',
    dataStatus: 'settled',
    syncedAt: '2026-09-06T10:15:00+08:00',
    data,
  };
}

test('normalizes numeric report values without exposing source records', () => {
  assert.equal(metricNumber('￥1,234.50'), 1234.5);
  assert.equal(metricNumber('12.5%'), 12.5);
  assert.equal(metricNumber('-'), 0);
  assert.equal(metricNumber(undefined), 0);
});

test('aggregates additive metrics and recomputes costs and weighted response rates', () => {
  const metrics = summarizeJuguangMetrics([
    reportRow({
      fee: 100, impression: 1000, click: 100, interaction: 25,
      initiative_message: 20, initiative_message_cpl: 999,
      message_consult: 10, message_consult_cpl: 999,
      msg_leads_num: 4, msg_leads_cost: 999,
      message_reply_in_1min_rate: 80, message_fst_reply_time_avg: 2,
    }),
    reportRow({
      fee: 50, impression: 500, click: 50, interaction: 5,
      initiative_message: 5, initiative_message_cpl: 999,
      message_consult: 5, message_consult_cpl: 999,
      msg_leads_num: 1, msg_leads_cost: 999,
      message_reply_in_1min_rate: 40, message_fst_reply_time_avg: 4,
    }),
  ]);

  assert.equal(metrics.fee, 150);
  assert.equal(metrics.ctr, 0.1);
  assert.equal(metrics.acp, 1);
  assert.equal(metrics.cpm, 100);
  assert.equal(metrics.cpi, 5);
  assert.equal(metrics.initiative_message_cpl, 6);
  assert.equal(metrics.message_consult_cpl, 10);
  assert.equal(metrics.msg_leads_cost, 30);
  assert.ok(Math.abs(metrics.message_reply_in_1min_rate - 66.6667) < 0.001);
  assert.ok(Math.abs(metrics.message_fst_reply_time_avg - 2.6667) < 0.001);
});

test('validates calendar dates and maximum report range', () => {
  assert.doesNotThrow(() => validateDateRange('2026-08-01', '2026-09-05'));
  assert.throws(() => validateDateRange('2026-02-31', '2026-03-01'), /日期范围无效/);
  assert.throws(() => validateDateRange('2026-09-05', '2026-09-01'), /日期范围无效/);
  assert.throws(() => validateDateRange('2025-01-01', '2026-09-05'), /371天/);
});

test('computes Shanghai yesterday and the two next daily synchronization times', () => {
  const now = new Date('2026-09-06T00:00:00.000Z');
  assert.equal(yesterdayShanghai(now), '2026-09-05');
  assert.deepEqual(nextJuguangRuns(now), {
    provisionalAt: '2026-09-06T16:10:00.000Z',
    settlementAt: '2026-09-06T02:15:00.000Z',
  });
});

test('marks only mature offline ranges as settled', () => {
  assert.equal(juguangDataStatusForRange('2026-09-04', new Date('2026-09-06T00:00:00.000Z')), 'settled');
  assert.equal(juguangDataStatusForRange('2026-09-05', new Date('2026-09-06T01:59:00.000Z')), 'provisional');
  assert.equal(juguangDataStatusForRange('2026-09-05', new Date('2026-09-06T02:15:00.000Z')), 'settled');
  assert.equal(juguangDataStatusForRange('2026-09-06', new Date('2026-09-06T04:00:00.000Z')), 'provisional');
});

test('splits mixed ranges so only today uses realtime report endpoints', () => {
  const now = new Date('2026-09-06T04:00:00.000Z');
  assert.deepEqual(juguangFetchWindows('2026-08-31', '2026-09-06', true, now), [
    { startDate: '2026-08-31', endDate: '2026-09-05', realtime: false },
    { startDate: '2026-09-06', endDate: '2026-09-06', realtime: true },
  ]);
  assert.deepEqual(juguangFetchWindows('2026-09-06', '2026-09-06', true, now), [
    { startDate: '2026-09-06', endDate: '2026-09-06', realtime: true },
  ]);
  assert.deepEqual(juguangFetchWindows('2026-09-06', '2026-09-06', false, now), [
    { startDate: '2026-09-06', endDate: '2026-09-06', realtime: false },
  ]);
});

test('flattens realtime dto responses into the same row shape as offline reports', () => {
  assert.deepEqual(normalizeRealtimeReportRows(
    { type: 'campaign', apiPath: '/unused', realtimePath: '/unused' },
    {
      campaign_dtos: [{
        base_campaign_dto: { campaign_id: 123, campaign_name: '计划A' },
        data: { fee: 99, initiative_message: 7, msg_leads_num: 3 },
      }],
    },
    '2026-09-05',
  ), [{
    campaign_id: 123,
    campaign_name: '计划A',
    fee: 99,
    initiative_message: 7,
    msg_leads_num: 3,
    time: '2026-09-05',
  }]);

  assert.deepEqual(normalizeRealtimeReportRows(
    { type: 'creative', apiPath: '/unused', realtimePath: '/unused' },
    {
      creativity_dtos: [{
        base_campaign_dto: { campaign_id: 123 },
        base_unit_dto: { unit_id: 456 },
        base_creativity_dto: { creativity_id: 789, creativity_name: '素材A' },
        data: { fee: 10, impression: 100 },
      }],
    },
    '2026-09-05',
  ), [{
    campaign_id: 123,
    unit_id: 456,
    creativity_id: 789,
    creativity_name: '素材A',
    fee: 10,
    impression: 100,
    time: '2026-09-05',
  }]);
});

test('refreshes shortly before access token expiry but not when expiry metadata is absent', () => {
  const issuedAt = '2026-09-06T00:00:00.000Z';
  assert.equal(shouldRefreshJuguangToken(issuedAt, 3600, new Date('2026-09-06T00:54:59.000Z')), false);
  assert.equal(shouldRefreshJuguangToken(issuedAt, 3600, new Date('2026-09-06T00:55:00.000Z')), true);
  assert.equal(shouldRefreshJuguangToken(undefined, undefined, new Date('2026-09-06T00:55:00.000Z')), false);
});
