import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppointmentServiceFromRecord } from '../../src/utils/appointmentServiceSync.ts';
import { experienceStageForAppointment } from '../../src/utils/appointmentOrderStage.ts';
import { orderTherapistServiceProgress } from '../../src/utils/appointmentTherapistOrders.ts';

test('experience payment comes from its preserved stage, not later package payment', () => {
  const order = { id: 'one', type: '套餐', payStatus: '未付款', servicePeople: { experienceSnapshot: { payStatus: '已支付', usedTimes: 1 } } };
  assert.equal(experienceStageForAppointment(order).payStatus, '已支付');
  assert.equal(experienceStageForAppointment({ ...order, servicePeople: JSON.stringify(order.servicePeople) }).payStatus, '已支付');
  assert.equal(experienceStageForAppointment({ ...order, payStatus: '已付款', servicePeople: { experienceSnapshot: { payStatus: '待支付' } } }).payStatus, '待支付');
  assert.equal(experienceStageForAppointment({ servicePeople: null }), null);
});

test('three role projects and counters stay separate including zero completed services', () => {
  const order = { type: '套餐', serviceItems: '骨盆', usedTimes: 6, totalTimes: 8, servicePeople: {
    sp1: { assign: '甲', serviceItems: '骨盆', usedTimes: 6, totalTimes: 8 },
    sp2: { assign: '黄清', serviceItems: '运动康复', usedTimes: 0, totalTimes: 3 },
    sp3: { assign: '丙', serviceItems: '体质调理', usedTimes: 1, totalTimes: 5 },
  } };
  assert.equal(getAppointmentServiceFromRecord(order, null, '黄清'), '运动康复');
  assert.equal(getAppointmentServiceFromRecord(order, null, '丙'), '体质调理');
  assert.deepEqual(orderTherapistServiceProgress(order, '黄清'), { matched: true, usedTimes: 0, totalTimes: 3 });
  delete order.servicePeople.sp2.serviceItems;
  assert.equal(getAppointmentServiceFromRecord(order, { intendedProduct: '骨盆' }, '黄清'), '');
  delete order.servicePeople.sp1.serviceItems;
  assert.equal(getAppointmentServiceFromRecord(order, null, '甲'), '骨盆');
});
