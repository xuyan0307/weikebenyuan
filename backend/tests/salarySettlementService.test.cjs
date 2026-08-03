const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateSalaryFeeDefaults,
  laborFeeByItemCount,
  splitServiceItems,
} = require('../dist/services/salarySettlementService.js');

test('splits service items with the delimiters used by schedules', () => {
  assert.deepEqual(
    splitServiceItems('盆底肌修复、腹直肌修复+骨盆修复'),
    ['盆底肌修复', '腹直肌修复', '骨盆修复']
  );
});

test('uses the experience-card fee from the payroll workbook', () => {
  assert.deepEqual(calculateSalaryFeeDefaults('产康体验卡'), {
    serviceType: '体验卡',
    itemCount: 1,
    experienceFee: 200,
    laborFee: 0,
  });
});

test('calculates common package labor fees by project count', () => {
  assert.equal(calculateSalaryFeeDefaults('盆底、腹直肌').laborFee, 300);
  assert.equal(calculateSalaryFeeDefaults('盆底、腹直肌、骨盆').laborFee, 400);
  assert.equal(calculateSalaryFeeDefaults('盆底、腹直肌、骨盆、腰腹').laborFee, 500);
  assert.equal(calculateSalaryFeeDefaults('一、二、三、四、五').laborFee, 600);
});

test('caps the default labor fee while keeping manual adjustment available', () => {
  assert.equal(calculateSalaryFeeDefaults('一、二、三、四、五、六').laborFee, 600);
  assert.equal(laborFeeByItemCount(2), 300);
  assert.equal(laborFeeByItemCount(5), 600);
});
