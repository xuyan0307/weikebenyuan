export type OrderReportSaleStage = {
  kind: 'experience' | 'package';
  amount: number;
  purchaseDate: string;
};

function parseRecord(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function dateOnly(value: unknown): string {
  return String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function isRefunded(payStatus: unknown): boolean {
  return String(payStatus ?? '').includes('退款');
}

function packageNumber(stage: Record<string, any>, fallback: number): number {
  const matched = String(stage.id || stage.label || '').match(/\d+/);
  return Math.max(1, Number(matched?.[0]) || fallback);
}

/** Returns the experience and package sale stages retained in one evolving order. */
export function orderReportSaleStages(order: Record<string, any>): OrderReportSaleStage[] {
  if (order.tag === 'T2') return [];
  const people = parseRecord(order.servicePeople);
  const stages: OrderReportSaleStage[] = [];
  const experience = parseRecord(people.experienceSnapshot);

  if (Object.keys(experience).length > 0) {
    if (!isRefunded(experience.payStatus)) {
      stages.push({
        kind: 'experience',
        amount: Number(experience.amount) || 0,
        purchaseDate: dateOnly(experience.purchaseDate) || dateOnly(order.createdAt),
      });
    }
  } else if (String(order.type || '').includes('体验') && !isRefunded(order.payStatus)) {
    stages.push({
      kind: 'experience',
      amount: Number(order.amount) || 0,
      purchaseDate: dateOnly(order.purchaseDate || order.paidAt || order.createdAt),
    });
  }

  const history = Array.isArray(people.packageHistory) ? people.packageHistory : [];
  const packages = new Map<number, OrderReportSaleStage>();
  history.forEach((rawStage: unknown, index: number) => {
    const stage = parseRecord(rawStage);
    if (Object.keys(stage).length === 0 || isRefunded(stage.payStatus)) return;
    packages.set(packageNumber(stage, index + 1), {
      kind: 'package',
      amount: Number(stage.amount) || 0,
      purchaseDate: dateOnly(stage.purchaseDate) || dateOnly(order.createdAt),
    });
  });

  if ((String(order.type || '').includes('套餐') || order.isUpgrade) && !isRefunded(order.payStatus)) {
    const activeNumber = Math.max(1, Number(people.activePackageNumber) || history.length + 1);
    packages.set(activeNumber, {
      kind: 'package',
      amount: Number(order.amount) || 0,
      purchaseDate: dateOnly(order.purchaseDate || order.paidAt || order.createdAt),
    });
  }

  stages.push(...packages.values());
  return stages;
}

export function reportStageInRange(stage: OrderReportSaleStage, start: Date, end: Date): boolean {
  if (!stage.purchaseDate) return false;
  const value = new Date(`${stage.purchaseDate}T00:00:00`);
  return !Number.isNaN(value.getTime()) && value >= start && value <= end;
}

export function orderReportContribution(order: Record<string, any>, start: Date, end: Date) {
  const visibleStages = orderReportSaleStages(order).filter(stage => reportStageInRange(stage, start, end));
  const hasUpgrade = visibleStages.some(stage => stage.kind === 'package');
  return {
    // Count the card in its own purchase period, independently of upgrades.
    hasExperienceCard: visibleStages.some(stage => stage.kind === 'experience'),
    hasUpgrade,
    upgradeSalesAmount: visibleStages
      .filter(stage => stage.kind === 'package')
      .reduce((sum, stage) => sum + stage.amount, 0),
  };
}
