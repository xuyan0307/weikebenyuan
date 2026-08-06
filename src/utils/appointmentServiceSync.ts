export interface AppointmentServiceOrder {
  type?: string;
  isUpgrade?: boolean;
  serviceItems?: string;
}

export interface AppointmentServiceCustomer {
  intendedProduct?: string;
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 预约服务项目只读取客户业务档案：订单服务项目优先，客户主档意向产品兜底。
 * 体验卡历史数据没有配置项目时使用稳定的业务名称，套餐则必须先补齐档案。
 */
export function getAppointmentServiceFromRecord(
  order: AppointmentServiceOrder | null | undefined,
  customer: AppointmentServiceCustomer | null | undefined
): string {
  const recordedService = normalizedText(order?.serviceItems)
    || normalizedText(customer?.intendedProduct);

  if (recordedService) return recordedService;
  return order?.type === '体验卡' && !order?.isUpgrade ? '产康体验' : '';
}

export function requiresRecordedAppointmentService(
  order: AppointmentServiceOrder | null | undefined
): boolean {
  return Boolean(order && (order.type === '套餐' || order.isUpgrade));
}

/**
 * 排期管理与预约列表共用服务端 appointments 快照。这里必须整体替换，不能按 ID
 * 只追加缺失项，否则取消、改期、换技师和备注等“记录数不变”的修改会停留在旧值。
 */
export function replaceWithScheduleSnapshot<T extends object>(
  serverAppointments: readonly T[]
): T[] {
  return serverAppointments.map(appointment => ({ ...appointment }));
}
