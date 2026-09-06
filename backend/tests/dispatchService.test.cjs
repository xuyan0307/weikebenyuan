const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeFromUpgradeRate, haversineKm, sortDispatchCandidates } = require('../dist/services/dispatchService.js');
const { rankTherapists, parseLocation } = require('../dist/services/dispatchService.js');

test('coordinates enforce geographic bounds', () => {
  assert.equal(parseLocation('181,24'), null);
  assert.equal(parseLocation('118,91'), null);
});

test('dispatch uses archive eligibility and closest valid origin without writing bookings', async t => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async url => {
    calls++;
    const from = new URL(url).searchParams.get('origins');
    return { ok: true, json: async () => ({ status: '1', results: [{ distance: from === '118.1,24.5' ? '10000' : '20000', duration: '1800' }] }) };
  };
  t.after(() => { global.fetch = original; });
  const archive = { id: 'live', name: '档案人员', status: '在职', therapist_type: '产康师', upgrade_rate: 60, dispatch_selected: 1,
    dispatch_locations: [{ address: '远出发点', location: '118.2,24.5' }, { address: '近出发点', location: '118.1,24.5' }] };
  const result = await rankTherapists([
    archive, { ...archive, id: 'off', status: '离职' }, { ...archive, id: 'disabled', dispatch_selected: 0 },
    { ...archive, id: 'other-role', therapist_type: '运动康复师' }, { ...archive, id: 'observer', upgrade_rate: 0 },
    { ...archive, id: 'missing', dispatch_locations: [] },
  ], { city: '厦门', address: '客户小区', location: '118.15,24.51', roles: ['产康师'] }, 'test-only');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].id, 'live');
  assert.equal(result.results[0].originAddress, '近出发点');
  assert.equal(result.results[0].driveKm, 10);
  assert.equal(result.results[0].estimated, false);
  assert.equal(calls, 2);
  assert.match(result.warning, /1位人员未填写出发地址/);
});

test('bad driving response is clearly marked as an estimate, never zero distance', async t => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ status: '1', results: [{ info: 'NO ROUTE' }] }) });
  t.after(() => { global.fetch = original; });
  const result = await rankTherapists([{ id: 'estimate', name: '估算人员', status: '在职', upgrade_rate: 60, dispatch_selected: 1,
    dispatch_locations: [{ address: '出发点', location: '118.18,24.55' }] }],
    { city: '厦门', address: '客户地址', location: '118.20,24.56', roles: ['产康师'] }, 'test-only');
  assert.equal(result.results[0].estimated, true);
  assert.ok(result.results[0].driveKm > 0);
});

test('radius excludes distant staff and optional observation staff remain available', async t => {
  const original = global.fetch;
  global.fetch = async url => ({ ok: true, json: async () => ({ status: '1', results: [{
    distance: new URL(url).searchParams.get('origins') === '118.3,24.5' ? '51000' : '5000', duration: '1200',
  }] }) });
  t.after(() => { global.fetch = original; });
  const base = { name: '人员', status: '在职', upgrade_rate: 0, dispatch_selected: 1 };
  const result = await rankTherapists([
    { ...base, id: 'far', dispatch_locations: [{ address: '远', location: '118.3,24.5' }] },
    { ...base, id: 'near', dispatch_locations: [{ address: '近', location: '118.31,24.5' }] },
  ], { city: '厦门', address: '客户', location: '118.35,24.55', includeObservation: true }, 'test-only');
  assert.deepEqual(result.results.map(r => r.id), ['near']);
  assert.equal(result.results[0].isObservation, true);
});

function candidate(overrides = {}) {
  return {
    id: '1', name: '测试技师', phone: '', city: '厦门', role: '产康师', level: 'A档产康师',
    levelScore: 2, isObservation: false, transport: '', scope: '', originAddress: '',
    driveKm: 10, driveMinutes: 20, scopeReason: '', projectReason: '', note: '', estimated: false, score: 100,
    ...overrides,
  };
}

test('dispatch grade follows therapist archive upgrade rate', () => {
  assert.deepEqual(gradeFromUpgradeRate(75), { level: '王牌产康师', score: 5, observation: false });
  assert.deepEqual(gradeFromUpgradeRate(60), { level: 'S档产康师', score: 4, observation: false });
  assert.deepEqual(gradeFromUpgradeRate(39), { level: '观察池', score: 1, observation: true });
});

test('nearby candidates rank by grade before distance', () => {
  const result = sortDispatchCandidates([
    candidate({ id: 'A', levelScore: 2, driveKm: 5 }),
    candidate({ id: 'S', levelScore: 4, driveKm: 20 }),
  ]);
  assert.deepEqual(result.map(item => item.id), ['S', 'A']);
});

test('30-50km candidates rank by distance and observation stays last', () => {
  const result = sortDispatchCandidates([
    candidate({ id: 'far-high', levelScore: 5, driveKm: 45 }),
    candidate({ id: 'far-low', levelScore: 2, driveKm: 32 }),
    candidate({ id: 'observer', levelScore: 1, driveKm: 2, isObservation: true }),
  ]);
  assert.deepEqual(result.map(item => item.id), ['far-low', 'far-high', 'observer']);
});

test('haversine distance rejects malformed coordinates', () => {
  assert.equal(haversineKm('bad', '118.1,24.5'), null);
  const km = haversineKm('118.1,24.5', '118.2,24.5');
  assert.ok(km > 9 && km < 11);
});
