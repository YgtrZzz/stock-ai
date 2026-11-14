/**
 * Calcula telemetria executiva de saúde operacional do estoque B2B.
 *
 * @param {Array<{ id?: number, name?: string, quantity?: number, space_id?: number|null }>} [items=[]]
 * @param {Array<{ id?: number, name?: string }>} [spaces=[]]
 */
export function computeStockHealthMetrics(items = [], spaces = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeSpaces = Array.isArray(spaces) ? spaces : [];

  const validSpaceIds = new Set(
    safeSpaces
      .filter((s) => s && s.id !== null && s.id !== undefined)
      .map((s) => Number(s.id))
  );

  let totalUnits = 0;
  let healthyCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let unassignedCount = 0;
  let coveredSkus = 0;

  for (const item of safeItems) {
    if (!item || typeof item !== 'object') continue;

    const rawQty = Number(item.quantity ?? 1);
    const qty = Number.isFinite(rawQty) ? Math.max(0, rawQty) : 0;
    const rawMin = Number(item.min_quantity ?? 3);
    const minQty = Number.isFinite(rawMin) && rawMin >= 0 ? rawMin : 3;
    totalUnits += qty;

    if (qty === 0) {
      outOfStockCount += 1;
    } else if (qty <= minQty) {
      lowStockCount += 1;
    } else {
      healthyCount += 1;
    }

    const hasValidSpace =
      item.space_id !== null &&
      item.space_id !== undefined &&
      validSpaceIds.has(Number(item.space_id));

    if (!hasValidSpace) {
      unassignedCount += 1;
    }

    if (qty > 0 && hasValidSpace) {
      coveredSkus += 1;
    }
  }

  const totalSkus = safeItems.length;
  const coverageRate =
    totalSkus > 0 ? Math.round((coveredSkus / totalSkus) * 100) : 100;

  let statusLevel = 'healthy';
  if (outOfStockCount > 0) {
    statusLevel = 'critical';
  } else if (lowStockCount > 0 || unassignedCount > 0) {
    statusLevel = 'attention';
  }

  return {
    totalSkus,
    totalUnits,
    healthyCount,
    lowStockCount,
    outOfStockCount,
    unassignedCount,
    coverageRate,
    statusLevel,
  };
}

export const computeB2BStockHealth = computeStockHealthMetrics;

export default {
  computeStockHealthMetrics,
  computeB2BStockHealth,
};
