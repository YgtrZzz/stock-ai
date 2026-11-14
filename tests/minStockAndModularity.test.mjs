import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeB2BStockHealth } from '../utils/stockHealth.js';

describe('Cycle 9 — Custom Per-SKU Minimum Stock Thresholds (min_quantity) & Component Modularity (TDD)', () => {
  it('evaluates low-stock and healthy SKUs using per-item min_quantity when defined (falling back to 3)', () => {
    const spaces = [{ id: 1, name: 'Almoxarifado' }];
    const items = [
      // Tem 10 unidades, mas min_quantity é 15 -> deve contar como lowStock!
      { id: 1, name: 'Parafuso M6', quantity: 10, min_quantity: 15, space_id: 1 },
      // Tem 2 unidades, mas min_quantity é 1 -> deve contar como healthy!
      { id: 2, name: 'Gerador Industrial', quantity: 2, min_quantity: 1, space_id: 1 },
      // Sem min_quantity explícito (usa padrão 3): tem 3 unidades -> lowStock!
      { id: 3, name: 'Luva EPI', quantity: 3, space_id: 1 },
      // Em ruptura (0 unidades) -> outOfStock!
      { id: 4, name: 'Cabo PP', quantity: 0, min_quantity: 5, space_id: 1 },
    ];

    const metrics = computeB2BStockHealth(items, spaces);
    assert.equal(metrics.totalSkus, 4);
    assert.equal(metrics.healthyCount, 1); // Gerador Industrial (2 > 1)
    assert.equal(metrics.lowStockCount, 2); // Parafuso M6 (10 <= 15) + Luva EPI (3 <= 3)
    assert.equal(metrics.outOfStockCount, 1); // Cabo PP (0)
    assert.equal(metrics.statusLevel, 'critical');
  });

  it('migrates SQLite schema safely to include min_quantity and persists custom thresholds in database.js', () => {
    const dbPath = path.resolve(
      'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/database.js'
    );
    const dbSource = fs.readFileSync(dbPath, 'utf8');

    assert.ok(
      dbSource.includes('min_quantity'),
      'database.js must include non-destructive migration and persistence for min_quantity'
    );
    const codeWithoutComments = dbSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.equal(
      /DROP\s+TABLE/i.test(codeWithoutComments),
      false,
      'database.js must never execute DROP TABLE'
    );
  });

  it('extracts memoized CsvBulkImportCard, AuditHistoryCard, and useKeyboardVisible hook', () => {
    const baseDir = 'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital';
    const hookSource = fs.readFileSync(
      path.resolve(baseDir, 'hooks/useKeyboardVisible.js'),
      'utf8'
    );
    const csvCardSource = fs.readFileSync(
      path.resolve(baseDir, 'components/CsvBulkImportCard.js'),
      'utf8'
    );
    const auditCardSource = fs.readFileSync(
      path.resolve(baseDir, 'components/AuditHistoryCard.js'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.resolve(baseDir, 'App.js'), 'utf8');

    assert.ok(
      hookSource.includes('keyboardDidShow') &&
        hookSource.includes('keyboardDidHide')
    );
    assert.ok(csvCardSource.includes('memo('));
    assert.ok(auditCardSource.includes('memo('));
    assert.ok(appSource.includes('CsvBulkImportCard'));
    assert.ok(appSource.includes('AuditHistoryCard'));
    assert.ok(appSource.includes('editingItemMinQty'));
  });
});
