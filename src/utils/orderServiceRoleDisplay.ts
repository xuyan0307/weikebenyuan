export type OrderServiceRole = '产康师' | '运动康复师' | '调理师';

type ServicePerson = {
  type?: unknown;
  assign?: unknown;
  usedTimes?: unknown;
  totalTimes?: unknown;
};

type OrderServiceRoleSource = {
  type?: unknown;
  isUpgrade?: unknown;
  usedTimes?: unknown;
  totalTimes?: unknown;
  servicePeople?: unknown;
};

export type OrderServiceRoleDisplay = {
  name: string;
  count: string;
  progress: string;
  isPackage: boolean;
  usedTimes: number;
  totalTimes: number;
};

function parseServicePeople(value: unknown): Record<string, ServicePerson | undefined> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? parsed as Record<string, ServicePerson | undefined>
        : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object'
    ? value as Record<string, ServicePerson | undefined>
    : {};
}

function normalizeRole(value: unknown): OrderServiceRole | '' {
  const role = String(value ?? '').trim();
  if (role === '体质调理师') return '调理师';
  return role === '产康师' || role === '运动康复师' || role === '调理师' ? role : '';
}

function isAssigned(person?: ServicePerson): boolean {
  const name = String(person?.assign ?? '').trim();
  return Boolean(name && name !== '待分配' && name !== '无');
}

/** Builds the two order-list cells for one service discipline. */
export function orderServiceRoleDisplay(
  order: OrderServiceRoleSource,
  role: OrderServiceRole
): OrderServiceRoleDisplay {
  const people = parseServicePeople(order.servicePeople);
  const conventionalKey: Record<OrderServiceRole, string> = {
    产康师: 'sp1',
    运动康复师: 'sp2',
    调理师: 'sp3',
  };
  const candidates = ['sp1', 'sp2', 'sp3'].map(key => people[key]).filter(Boolean) as ServicePerson[];
  const typedPerson = candidates.find(person => normalizeRole(person.type) === role);
  const fallbackPerson = people[conventionalKey[role]];
  const person = typedPerson || (!normalizeRole(fallbackPerson?.type) ? fallbackPerson : undefined);

  const isPackage = order.type === '套餐' || Boolean(order.isUpgrade);
  if (!isAssigned(person)) {
    return { name: '—', count: '—', progress: '—', isPackage, usedTimes: 0, totalTimes: 0 };
  }

  const name = String(person?.assign ?? '').trim();
  const used = Math.max(0, Number(person?.usedTimes ?? order.usedTimes) || 0);
  const total = Math.max(1, Number(person?.totalTimes ?? order.totalTimes) || 1);
  return {
    name,
    count: `${Math.min(used, total)}/${total}`,
    progress: isPackage ? `${used}/${total}` : used > 0 ? '已服务' : '未服务',
    isPackage,
    usedTimes: used,
    totalTimes: total,
  };
}
