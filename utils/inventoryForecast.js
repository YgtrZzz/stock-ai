/**
 * Motor de Inteligência de Estoque PME (Runout Forecaster & Curva ABC)
 * - Cálculo determinístico de taxa diária de consumo (Burn Rate).
 * - Previsão de dias até ruptura (Runout Forecast) e sugestão de reposição (Coverage Target).
 * - Classificação ABC de giro baseada no princípio de Pareto (70/20/10).
 * - Sanitização estrita contra Prototype Pollution e payloads maliciosos (OWASP Mobile).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Sanitiza a entrada contra Prototype Pollution e estruturas malformadas.
 */
export function sanitizeForecastInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'object') {
    return [];
  }

  const items = Array.isArray(rawInput)
    ? rawInput
    : Array.isArray(rawInput.items)
      ? rawInput.items
      : [];

  return items
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const id = Number(item.id);
      return Number.isFinite(id) && id > 0;
    })
    .map((item) => ({
      id: Number(item.id),
      name: String(item.name || '').trim(),
      quantity: Math.max(0, Number.parseInt(String(item.quantity ?? 0), 10) || 0),
      min_quantity: Math.max(
        1,
        Number.parseInt(String(item.min_quantity ?? 3), 10) || 3
      ),
      space_id: item.space_id ? Number(item.space_id) : null,
      barcode: item.barcode ? String(item.barcode).trim() : null,
    }));
}

/**
 * Calcula a taxa de consumo diário (Burn Rate) por item dentro de uma janela temporal.
 * Considera apenas saídas registradas (delta < 0).
 */
export function computeDailyBurnRate(
  movements = [],
  windowDays = 30,
  now = new Date()
) {
  const safeDays = Math.max(1, Number(windowDays) || 30);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const cutoffMs = nowMs - safeDays * MS_PER_DAY;

  const burnTotals = {};

  if (!Array.isArray(movements)) return burnTotals;

  for (const mov of movements) {
    if (!mov || typeof mov !== 'object') continue;
    const delta = Number(mov.delta);
    if (!Number.isFinite(delta) || delta >= 0) continue; // Apenas saídas

    const movDate = mov.created_at ? new Date(mov.created_at).getTime() : 0;
    if (movDate < cutoffMs || movDate > nowMs) continue;

    const itemId = Number(mov.item_id);
    if (!Number.isFinite(itemId)) continue;

    const consumed = Math.abs(delta);
    burnTotals[itemId] = (burnTotals[itemId] || 0) + consumed;
  }

  const rates = {};
  for (const [id, total] of Object.entries(burnTotals)) {
    rates[id] = Number((total / safeDays).toFixed(4));
  }

  return rates;
}

/**
 * Projeta os dias restantes de estoque e sugere o lote de compra ideal para PMEs.
 */
export function computeItemRunoutForecast(
  items = [],
  movements = [],
  { windowDays = 30, targetCoverageDays = 15, now = new Date() } = {}
) {
  const burnRates = computeDailyBurnRate(movements, windowDays, now);
  const safeCoverageDays = Math.max(1, Number(targetCoverageDays) || 15);

  const forecast = [];

  for (const item of items) {
    if (!item) continue;
    const id = Number(item.id);
    const quantity = Math.max(0, Number(item.quantity ?? 0));
    const minQty = Math.max(1, Number(item.min_quantity ?? 3));
    const burnRate = burnRates[id] || 0;

    let daysRemaining = Infinity;
    let urgencyStatus = 'healthy';
    let suggestedRestockQty = 0;

    if (quantity === 0) {
      urgencyStatus = 'out_of_stock';
      daysRemaining = 0;
      suggestedRestockQty =
        burnRate > 0 ? Math.ceil(safeCoverageDays * burnRate) : minQty;
    } else if (burnRate === 0) {
      urgencyStatus = 'dormant';
      daysRemaining = Infinity;
      suggestedRestockQty = 0;
    } else {
      daysRemaining = Math.floor(quantity / burnRate);
      if (daysRemaining <= 3) {
        urgencyStatus = 'critical';
      } else if (daysRemaining <= 7) {
        urgencyStatus = 'attention';
      } else {
        urgencyStatus = 'healthy';
      }

      const neededForCoverage = safeCoverageDays * burnRate;
      suggestedRestockQty = Math.max(0, Math.ceil(neededForCoverage - quantity));
    }

    forecast.push({
      id,
      name: item.name || '',
      quantity,
      min_quantity: minQty,
      dailyBurnRate: burnRate,
      daysRemaining,
      urgencyStatus,
      suggestedRestockQty,
      barcode: item.barcode || null,
      space_id: item.space_id ?? null,
      space_name: item.space_name || null,
    });
  }

  return forecast;
}

/**
 * Classifica os itens pela Curva ABC de Giro:
 * - Classe A: Primeiros itens responsáveis por até 70% do consumo total (Giro Alto)
 * - Classe B: Próximos 20% do consumo (70% - 90%) (Giro Médio)
 * - Classe C: 10% finais ou sem movimentação (Giro Baixo / Cauda Longa)
 */
export function computeAbcCurve(
  items = [],
  movements = [],
  windowDays = 30,
  now = new Date()
) {
  const safeDays = Math.max(1, Number(windowDays) || 30);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const cutoffMs = nowMs - safeDays * MS_PER_DAY;

  const consumedByItem = {};
  let totalVolume = 0;

  if (Array.isArray(movements)) {
    for (const mov of movements) {
      if (!mov) continue;
      const delta = Number(mov.delta);
      if (!Number.isFinite(delta) || delta >= 0) continue;

      const movDate = mov.created_at ? new Date(mov.created_at).getTime() : 0;
      if (movDate < cutoffMs || movDate > nowMs) continue;

      const itemId = Number(mov.item_id);
      if (!Number.isFinite(itemId)) continue;

      const vol = Math.abs(delta);
      consumedByItem[itemId] = (consumedByItem[itemId] || 0) + vol;
      totalVolume += vol;
    }
  }

  const scoredItems = items.map((it) => ({
    id: it.id,
    volume: consumedByItem[it.id] || 0,
  }));

  scoredItems.sort((a, b) => b.volume - a.volume);

  const classes = {};
  let accumVolume = 0;
  let classACount = 0;
  let classBCount = 0;
  let classCCount = 0;

  for (let i = 0; i < scoredItems.length; i += 1) {
    const item = scoredItems[i];
    if (totalVolume === 0 || item.volume === 0) {
      classes[item.id] = 'C';
      classCCount += 1;
      continue;
    }

    accumVolume += item.volume;
    const share = accumVolume / totalVolume;

    // Garante que o item líder pertença à Classe A se houver volume
    if (share <= 0.7001 || (i === 0 && share <= 0.85)) {
      classes[item.id] = 'A';
      classACount += 1;
    } else if (share <= 0.9001) {
      classes[item.id] = 'B';
      classBCount += 1;
    } else {
      classes[item.id] = 'C';
      classCCount += 1;
    }
  }

  return {
    classes,
    summary: {
      classACount,
      classBCount,
      classCCount,
      totalVolume,
    },
  };
}
