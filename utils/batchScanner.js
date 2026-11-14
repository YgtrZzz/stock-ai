import { sanitizeBarcodeInput } from './securityValidators.js';

const DEFAULT_COOLDOWN_MS = 1200;
const DANGEROUS_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

/**
 * Cria uma nova sessão para o Modo Scanner Contínuo (Batch Scanning).
 * Mantém contadores, histórico e mapa de cooldown isolados.
 *
 * @param {Object} [options]
 * @param {'inflow'|'outflow'|'audit'} [options.mode='inflow']
 * @param {number} [options.cooldownMs=1200]
 * @returns {Object}
 */
export function createBatchScanSession(options = {}) {
  const mode = ['inflow', 'outflow', 'audit'].includes(options?.mode)
    ? options.mode
    : 'inflow';
  const cooldownMs =
    typeof options?.cooldownMs === 'number' && options.cooldownMs >= 100
      ? options.cooldownMs
      : DEFAULT_COOLDOWN_MS;

  return {
    mode,
    cooldownMs,
    scannedCount: 0,
    uniqueItemsCount: 0,
    itemsMap: Object.create(null),
    sessionHistory: [],
    cooldownMap: Object.create(null),
    createdAt: Date.now(),
  };
}

/**
 * Processa a leitura de um código de barras em lote com controle inteligente de cooldown por SKU,
 * atualização otimista de estoque e proteção contra saldo negativo.
 *
 * @param {Object} params
 * @param {string} params.barcode
 * @param {Record<string, any>} [params.itemsByBarcode={}]
 * @param {Object} params.session
 * @param {number} [params.now=Date.now()]
 * @returns {Object}
 */
export function processBatchBarcodeScan({
  barcode,
  itemsByBarcode = {},
  session,
  now = Date.now(),
}) {
  if (!session || typeof session !== 'object') {
    return { status: 'INVALID_SESSION' };
  }

  // Sanitização e defesa contra Prototype Pollution
  if (typeof barcode === 'string' && DANGEROUS_KEYS.includes(barcode.trim())) {
    return { status: 'INVALID_BARCODE' };
  }

  const cleanBarcode = sanitizeBarcodeInput(barcode);
  if (!cleanBarcode) {
    return { status: 'INVALID_BARCODE' };
  }

  // Verifica cooldown específico deste SKU (evita bips múltiplos indesejados ao apontar a câmera)
  const lastScan = session.cooldownMap[cleanBarcode];
  if (typeof lastScan === 'number' && now - lastScan < session.cooldownMs) {
    return {
      status: 'COOLDOWN_IGNORED',
      barcode: cleanBarcode,
      remainingMs: session.cooldownMs - (now - lastScan),
    };
  }

  // Registra timestamp do último scan aceito para este barcode
  session.cooldownMap[cleanBarcode] = now;

  // Busca item correspondente
  const item =
    itemsByBarcode && typeof itemsByBarcode === 'object'
      ? itemsByBarcode[cleanBarcode] || null
      : null;

  if (!item) {
    return {
      status: 'UNKNOWN_BARCODE',
      barcode: cleanBarcode,
      feedbackType: 'WARNING_HAPTIC',
    };
  }

  const currentQty = typeof item.quantity === 'number' ? item.quantity : 0;
  let delta = 0;
  let newQuantity = currentQty;

  if (session.mode === 'inflow') {
    delta = 1;
    newQuantity = currentQty + 1;
  } else if (session.mode === 'outflow') {
    if (currentQty <= 0) {
      return {
        status: 'OUT_OF_STOCK_BLOCKED',
        item,
        barcode: cleanBarcode,
        feedbackType: 'ERROR_HAPTIC',
      };
    }
    delta = -1;
    newQuantity = Math.max(0, currentQty - 1);
  } else if (session.mode === 'audit') {
    delta = 0;
    newQuantity = currentQty;
  }

  // Atualiza métricas da sessão
  session.scannedCount += 1;

  if (!session.itemsMap[cleanBarcode]) {
    session.uniqueItemsCount += 1;
    session.itemsMap[cleanBarcode] = {
      barcode: cleanBarcode,
      name: item.name || '',
      item,
      count: 0,
      firstScannedAt: now,
    };
  }

  session.itemsMap[cleanBarcode].count += 1;
  session.itemsMap[cleanBarcode].lastScannedAt = now;

  const eventRecord = {
    timestamp: now,
    barcode: cleanBarcode,
    item_id: item.id,
    name: item.name || '',
    delta,
    previousQuantity: currentQty,
    newQuantity,
    status: 'SUCCESS',
  };
  session.sessionHistory.push(eventRecord);

  return {
    status: 'SUCCESS',
    item,
    barcode: cleanBarcode,
    delta,
    newQuantity,
    sessionCount: session.itemsMap[cleanBarcode].count,
    totalSessionScanned: session.scannedCount,
    timestamp: now,
    feedbackType: 'LIGHT_HAPTIC',
  };
}

/**
 * Compara a contagem física com o estoque registrado no sistema para auditoria e inventário cego.
 *
 * @param {Record<string, number>|Object} auditCounts - Mapa de barcode -> contagem, ou session.itemsMap
 * @param {Array<Object>} [allItems=[]]
 * @returns {{ discrepancies: Array<Object>, summary: Object }}
 */
export function consolidateAuditDiscrepancies(auditCounts = {}, allItems = []) {
  const discrepancies = [];
  const itemsArray = Array.isArray(allItems) ? allItems : [];

  // Converte auditCounts para mapa numérico seguro
  const countMap = Object.create(null);
  if (auditCounts && typeof auditCounts === 'object') {
    for (const key of Object.keys(auditCounts)) {
      if (DANGEROUS_KEYS.includes(key)) continue;
      const val = auditCounts[key];
      const num = typeof val === 'object' && val !== null ? val.count : val;
      countMap[key] = typeof num === 'number' && Number.isFinite(num) ? num : 0;
    }
  }

  const auditedBarcodes = new Set(Object.keys(countMap));
  let totalSkusAudited = auditedBarcodes.size;
  let accurateSkus = 0;
  let divergentSkus = 0;
  let netDifference = 0;

  for (const item of itemsArray) {
    if (!item?.barcode || !auditedBarcodes.has(item.barcode)) continue;

    const countedQty = countMap[item.barcode] ?? 0;
    const systemQty = typeof item.quantity === 'number' ? item.quantity : 0;
    const difference = countedQty - systemQty;
    netDifference += difference;

    let status = 'MATCH';
    if (difference < 0) {
      status = 'DEFICIT';
      divergentSkus += 1;
    } else if (difference > 0) {
      status = 'SURPLUS';
      divergentSkus += 1;
    } else {
      accurateSkus += 1;
    }

    discrepancies.push({
      itemId: item.id,
      name: item.name || '',
      barcode: item.barcode,
      systemQty,
      countedQty,
      difference,
      status,
    });
  }

  return {
    discrepancies,
    summary: {
      totalSkusAudited,
      accurateSkus,
      divergentSkus,
      netDifference,
    },
  };
}

/**
 * Prepara o payload para registro formal das movimentações de estoque em lote (stock_movements).
 *
 * @param {Object} session
 * @returns {Array<Object>}
 */
export function generateBatchMovementLogs(session) {
  if (!session?.sessionHistory || !Array.isArray(session.sessionHistory)) {
    return [];
  }

  const tipo = session.mode === 'outflow' ? 'saida' : 'entrada';
  const motivo =
    session.mode === 'outflow'
      ? 'saida_lote_continuo'
      : session.mode === 'audit'
      ? 'auditoria_inventario'
      : 'entrada_lote_continuo';

  return session.sessionHistory
    .filter((event) => event.status === 'SUCCESS' && event.delta !== 0)
    .map((event) => ({
      item_id: event.item_id,
      item_name: event.name,
      delta: event.delta,
      previous_quantity: event.previousQuantity,
      new_quantity: event.newQuantity,
      tipo_movimento: tipo,
      motivo,
      data_hora: new Date(event.timestamp).toISOString(),
    }));
}
