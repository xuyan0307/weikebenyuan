export interface AmountStageValue {
  key: string;
  amount: number;
}

/**
 * Sum every filtered order row independently.
 *
 * Order numbers are business identifiers and may be repeated after imports, so
 * they must never be used as the aggregation key. Amounts are accumulated in
 * cents to keep the table footer identical to a row-by-row currency sum.
 */
export function sumOrderAmountStages(
  rows: Iterable<Iterable<AmountStageValue>>,
): Map<string, number> {
  const centsByStage = new Map<string, number>();

  for (const stages of rows) {
    // The table renders one cell per stage key; when imported history contains
    // the same stage more than once, the last value is the one users see.
    const displayedStages = new Map<string, AmountStageValue>();
    for (const stage of stages) {
      if (stage.key) displayedStages.set(stage.key, stage);
    }
    for (const stage of displayedStages.values()) {
      const amount = Number(stage.amount);
      if (!stage.key || !Number.isFinite(amount)) continue;
      const cents = Math.round(amount * 100);
      centsByStage.set(stage.key, (centsByStage.get(stage.key) || 0) + cents);
    }
  }

  return new Map(
    Array.from(centsByStage.entries()).map(([key, cents]) => [key, cents / 100]),
  );
}
