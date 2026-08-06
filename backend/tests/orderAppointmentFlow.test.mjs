import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORDER_APPOINTMENT_DRAFT_KEY,
  clearOrderAppointmentDraft,
  readOrderAppointmentDraft,
  saveOrderAppointmentDraft,
} from '../../src/utils/orderAppointmentFlow.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('order editor draft survives the appointment sub-flow', () => {
  const storage = memoryStorage();
  saveOrderAppointmentDraft(storage, {
    orderId: 'order-1',
    mode: 'edit',
    activeTab: 'package-1',
    form: { amount: '8800', serviceItems: '盆底肌,腹直肌' },
    orderSnapshot: { id: 'order-1' },
    isManualProgressDirty: true,
  }, 1000);

  assert.deepEqual(readOrderAppointmentDraft(storage, 2000), {
    version: 1,
    savedAt: 1000,
    orderId: 'order-1',
    mode: 'edit',
    activeTab: 'package-1',
    form: { amount: '8800', serviceItems: '盆底肌,腹直肌' },
    orderSnapshot: { id: 'order-1' },
    isManualProgressDirty: true,
  });

  clearOrderAppointmentDraft(storage);
  assert.equal(storage.getItem(ORDER_APPOINTMENT_DRAFT_KEY), null);
});

test('expired or corrupt appointment drafts are discarded', () => {
  const storage = memoryStorage();
  saveOrderAppointmentDraft(storage, {
    orderId: 'order-2',
    mode: 'edit',
    activeTab: 'experience',
    form: {},
    orderSnapshot: {},
    isManualProgressDirty: false,
  }, 1000);
  assert.equal(readOrderAppointmentDraft(storage, 1000 + 2 * 60 * 60 * 1000 + 1), null);

  storage.setItem(ORDER_APPOINTMENT_DRAFT_KEY, '{broken');
  assert.equal(readOrderAppointmentDraft(storage), null);
  assert.equal(storage.getItem(ORDER_APPOINTMENT_DRAFT_KEY), null);
});
