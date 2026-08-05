export const ORDER_APPOINTMENT_DRAFT_KEY = 'weikebenyuan:order-appointment-draft';

const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface OrderAppointmentDraft<TForm = unknown, TOrder = unknown> {
  version: typeof DRAFT_VERSION;
  savedAt: number;
  orderId: string;
  mode: 'edit';
  activeTab: string;
  form: TForm;
  orderSnapshot: TOrder;
  isManualProgressDirty: boolean;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function saveOrderAppointmentDraft<TForm, TOrder>(
  storage: StorageLike,
  draft: Omit<OrderAppointmentDraft<TForm, TOrder>, 'version' | 'savedAt'>,
  now = Date.now(),
): void {
  storage.setItem(ORDER_APPOINTMENT_DRAFT_KEY, JSON.stringify({
    ...draft,
    version: DRAFT_VERSION,
    savedAt: now,
  }));
}

export function readOrderAppointmentDraft<TForm = unknown, TOrder = unknown>(
  storage: StorageLike,
  now = Date.now(),
): OrderAppointmentDraft<TForm, TOrder> | null {
  const raw = storage.getItem(ORDER_APPOINTMENT_DRAFT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OrderAppointmentDraft<TForm, TOrder>>;
    const valid = parsed.version === DRAFT_VERSION
      && parsed.mode === 'edit'
      && typeof parsed.orderId === 'string'
      && parsed.orderId.length > 0
      && typeof parsed.savedAt === 'number'
      && now - parsed.savedAt <= DRAFT_MAX_AGE_MS
      && parsed.form !== undefined;
    if (!valid) {
      storage.removeItem(ORDER_APPOINTMENT_DRAFT_KEY);
      return null;
    }
    return parsed as OrderAppointmentDraft<TForm, TOrder>;
  } catch {
    storage.removeItem(ORDER_APPOINTMENT_DRAFT_KEY);
    return null;
  }
}

export function clearOrderAppointmentDraft(storage: StorageLike): void {
  storage.removeItem(ORDER_APPOINTMENT_DRAFT_KEY);
}
