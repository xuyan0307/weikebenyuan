const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeForTherapist, rankTherapists, sortDispatchCandidates } = require('../dist/services/dispatchService');
const { validateProfile } = require('../dist/routes/therapists');

test('specialty grades are independent of postpartum upgrade rates', () => {
  for (const therapist_type of ['运动康复师', '调理师', '体质调理师']) {
    assert.equal(gradeForTherapist({ therapist_type, upgrade_rate: 90, specialty_grade: 'observer' }).observation, true);
    assert.equal(gradeForTherapist({ therapist_type, upgrade_rate: 0, specialty_grade: 'B' }).observation, false);
    assert.equal(gradeForTherapist({ therapist_type, commission_rate: 5 }).score, 3);
    assert.equal(gradeForTherapist({ therapist_type, commission_rate: 8 }).observation, true);
  }
  assert.equal(gradeForTherapist({ therapist_type: '产康师', upgrade_rate: 75, specialty_grade: 'observer' }).score, 5);
});

test('specialty commission is fixed to 0 or 5, unauthorized grade edits are ignored', () => {
  for (const therapistType of ['运动康复师', '调理师']) {
    assert.equal(validateProfile({ therapistType, specialtyGrade: 'B', commissionRate: 80 }, 'admin').commissionRate, 5);
    assert.equal(validateProfile({ therapistType, specialtyGrade: 'observer', commissionRate: 80 }, 'superadmin').commissionRate, 0);
    assert.throws(() => validateProfile({ therapistType, specialtyGrade: 'S' }, 'admin'));
    const original = { therapist_type: therapistType, specialty_grade: 'observer', commission_rate: 0, upgrade_rate: 0 };
    const changed = validateProfile({ therapistType, specialtyGrade: 'B', commissionRate: 5 }, 'service', original);
    assert.equal(changed.specialtyGrade, 'observer'); assert.equal(changed.commissionRate, 0);
  }
});

test('archive validates two addresses and cannot bypass dispatch settings', () => {
  const addresses = [{ label: '家', address: '厦门地址1' }, { label: '门店', address: '厦门地址2' }];
  assert.equal(validateProfile({ dispatchLocations: addresses }, 'admin').dispatchLocations.length, 2);
  assert.throws(() => validateProfile({ dispatchLocations: [...addresses, addresses[0]] }, 'admin'));
  assert.throws(() => validateProfile({ dispatchSelected: true }, 'admin'));
});

test('legacy specialty 8 percent is preserved until an admin explicitly selects a new grade', () => {
  const current = { therapist_type: '调理师', commission_rate: 8, specialty_grade: null };
  for (const role of ['service', 'admin']) {
    const result = validateProfile({ therapistType: '调理师' }, role, current);
    assert.equal(result.commissionRate, 8); assert.equal(result.specialtyGrade, null);
  }
  assert.equal(validateProfile({ therapistType: '调理师', specialtyGrade: 'B' }, 'admin', current).commissionRate, 5);
});

test('unselected archives never appear even with the old default enable flag', async () => {
  const result = await rankTherapists([{ name: '未配置', status: '在职', upgrade_rate: 90, dispatch_enabled: 1, detail_address: '地址' }], { city: '厦门', location: '118.1,24.5', roles: ['产康师'] }, 'test');
  assert.deepEqual(result.results, []);
});

test('same grade compares distance and 30km remains in the priority group', () => {
  const base = { isObservation: false, score: 1 };
  const result = sortDispatchCandidates([{ ...base, id: 'edge', driveKm: 30, levelScore: 4 }, { ...base, id: 'near', driveKm: 5, levelScore: 4 }, { ...base, id: 'outside', driveKm: 30.1, levelScore: 5 }]);
  assert.deepEqual(result.map(x => x.id), ['near', 'edge', 'outside']);
});
