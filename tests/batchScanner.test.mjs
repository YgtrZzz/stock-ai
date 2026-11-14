import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBatchScanSession,
  processBatchBarcodeScan,
  consolidateAuditDiscrepancies,
  generateBatchMovementLogs,
} from '../utils/batchScanner.js';

describe('Cycle 14 — Continuous Batch Scanner & Rapid Inventory Audit Engine (TDD)', () => {
  test('createBatchScanSession initializes fresh session state with mode and cooldown constraints', () => {
    const session = createBatchScanSession({ mode: 'inflow', cooldownMs: 1000 });
    assert.equal(session.mode, 'inflow');
    assert.equal(session.cooldownMs, 1000);
    assert.equal(session.scannedCount, 0);
    assert.equal(session.uniqueItemsCount, 0);
    assert.deepEqual(session.sessionHistory, []);
    assert.ok(session.createdAt > 0);
  });

  test('processBatchBarcodeScan enforces smart per-SKU cooldown while allowing instant alternation', () => {
    const session = createBatchScanSession({ mode: 'inflow', cooldownMs: 1200 });
    const itemsByBarcode = {
      '7891234567890': { id: 101, name: 'Parafuso Philips M4', quantity: 20, barcode: '7891234567890' },
      '7899876543210': { id: 102, name: 'Bucha 6mm', quantity: 50, barcode: '7899876543210' },
    };

    const t0 = 1000000;
    // Primeiro scan do SKU 1
    const res1 = processBatchBarcodeScan({
      barcode: '7891234567890',
      itemsByBarcode,
      session,
      now: t0,
    });
    assert.equal(res1.status, 'SUCCESS');
    assert.equal(res1.delta, 1);
    assert.equal(res1.newQuantity, 21);
    assert.equal(session.scannedCount, 1);

    // Segundo scan imediato do MESMO SKU (dentro de 500ms < 1200ms) -> Bloqueado por cooldown
    const res2 = processBatchBarcodeScan({
      barcode: '7891234567890',
      itemsByBarcode,
      session,
      now: t0 + 500,
    });
    assert.equal(res2.status, 'COOLDOWN_IGNORED');
    assert.equal(session.scannedCount, 1, 'Não deve incrementar contador em cooldown');

    // Scan imediato de um OUTRO SKU (SKU 2) -> Instantâneo sem bloqueio
    const res3 = processBatchBarcodeScan({
      barcode: '7899876543210',
      itemsByBarcode,
      session,
      now: t0 + 600,
    });
    assert.equal(res3.status, 'SUCCESS');
    assert.equal(res3.delta, 1);
    assert.equal(res3.newQuantity, 51);
    assert.equal(session.scannedCount, 2);
    assert.equal(session.uniqueItemsCount, 2);

    // Scan do SKU 1 após o tempo de cooldown (> 1200ms) -> Sucesso
    const res4 = processBatchBarcodeScan({
      barcode: '7891234567890',
      itemsByBarcode,
      session,
      now: t0 + 1300,
    });
    assert.equal(res4.status, 'SUCCESS');
    assert.equal(session.scannedCount, 3);
  });

  test('processBatchBarcodeScan handles outflow mode with zero-quantity safety guard', () => {
    const session = createBatchScanSession({ mode: 'outflow', cooldownMs: 500 });
    const itemsByBarcode = {
      '7890001': { id: 1, name: 'Chave Allen 5mm', quantity: 1, barcode: '7890001' },
      '7890002': { id: 2, name: 'Fita Isolante', quantity: 0, barcode: '7890002' },
    };

    const t0 = 1000;
    // Saída com estoque disponível (1 -> 0)
    const res1 = processBatchBarcodeScan({
      barcode: '7890001',
      itemsByBarcode,
      session,
      now: t0,
    });
    assert.equal(res1.status, 'SUCCESS');
    assert.equal(res1.delta, -1);
    assert.equal(res1.newQuantity, 0);

    // Tentativa de saída de item zerado -> Bloqueado
    const res2 = processBatchBarcodeScan({
      barcode: '7890002',
      itemsByBarcode,
      session,
      now: t0 + 600,
    });
    assert.equal(res2.status, 'OUT_OF_STOCK_BLOCKED');
    assert.equal(res2.feedbackType, 'ERROR_HAPTIC');
  });

  test('processBatchBarcodeScan identifies unregistered barcode and triggers warning feedback', () => {
    const session = createBatchScanSession({ mode: 'inflow' });
    const itemsByBarcode = {};

    const res = processBatchBarcodeScan({
      barcode: '7899999999999',
      itemsByBarcode,
      session,
      now: 1000,
    });
    assert.equal(res.status, 'UNKNOWN_BARCODE');
    assert.equal(res.barcode, '7899999999999');
    assert.equal(res.feedbackType, 'WARNING_HAPTIC');
  });

  test('consolidateAuditDiscrepancies accurately cross-references physical counts against database', () => {
    const allItems = [
      { id: 1, name: 'Caneta Azul', barcode: '789001', quantity: 10 },
      { id: 2, name: 'Caderno 100fls', barcode: '789002', quantity: 5 },
      { id: 3, name: 'Borracha Branca', barcode: '789003', quantity: 8 },
    ];

    const auditCounts = {
      '789001': 10, // Match
      '789002': 3,  // Deficit (faltam 2)
      '789003': 12, // Surplus (sobraram 4)
    };

    const report = consolidateAuditDiscrepancies(auditCounts, allItems);
    assert.equal(report.summary.totalSkusAudited, 3);
    assert.equal(report.summary.accurateSkus, 1);
    assert.equal(report.summary.divergentSkus, 2);
    assert.equal(report.summary.netDifference, 2); // (-2 + 4) = +2

    const item1 = report.discrepancies.find((d) => d.barcode === '789001');
    assert.equal(item1.status, 'MATCH');
    assert.equal(item1.difference, 0);

    const item2 = report.discrepancies.find((d) => d.barcode === '789002');
    assert.equal(item2.status, 'DEFICIT');
    assert.equal(item2.difference, -2);

    const item3 = report.discrepancies.find((d) => d.barcode === '789003');
    assert.equal(item3.status, 'SURPLUS');
    assert.equal(item3.difference, 4);
  });

  test('generateBatchMovementLogs formats stock_movements entries with audit motivation and deltas', () => {
    const session = createBatchScanSession({ mode: 'inflow' });
    const itemsByBarcode = {
      '7891': { id: 10, name: 'Teclado USB', quantity: 5, barcode: '7891' },
    };

    processBatchBarcodeScan({ barcode: '7891', itemsByBarcode, session, now: 1000 });
    processBatchBarcodeScan({ barcode: '7891', itemsByBarcode, session, now: 3000 });

    const logs = generateBatchMovementLogs(session);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].item_id, 10);
    assert.equal(logs[0].tipo_movimento, 'entrada');
    assert.equal(logs[0].motivo, 'entrada_lote_continuo');
    assert.equal(logs[0].delta, 1);
  });

  test('OWASP & Prototype Pollution guards: blocks malformed inputs and proto pollution safely', () => {
    const session = createBatchScanSession();
    const res = processBatchBarcodeScan({
      barcode: '__proto__',
      itemsByBarcode: {},
      session,
      now: 1000,
    });
    assert.equal(res.status, 'INVALID_BARCODE');
    assert.equal(Object.prototype.polluted, undefined);

    const resEmpty = processBatchBarcodeScan({
      barcode: '   \n\t  ',
      itemsByBarcode: {},
      session,
      now: 1000,
    });
    assert.equal(resEmpty.status, 'INVALID_BARCODE');
  });
});
