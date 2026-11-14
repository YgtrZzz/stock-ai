import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeStockHealthMetrics } from '../utils/stockHealth.js';

describe('B2B Stock Health Telemetry & Design System Compliance (TDD)', () => {
  it('computes healthy, low-stock, out-of-stock, unassigned counts and coverage percentage accurately', () => {
    const spaces = [
      { id: 1, name: 'Galpão A' },
      { id: 2, name: 'Corredor B' },
    ];
    const items = [
      { id: 1, name: 'Parafusadeira', quantity: 10, space_id: 1 }, // healthy + assigned
      { id: 2, name: 'Broca 8mm', quantity: 5, space_id: 2 }, // healthy + assigned
      { id: 3, name: 'Fita Isolante', quantity: 2, space_id: 1 }, // low stock + assigned
      { id: 4, name: 'Luva Nitrílica', quantity: 0, space_id: null }, // out of stock + unassigned
    ];

    const metrics = computeStockHealthMetrics(items, spaces);
    assert.equal(metrics.totalSkus, 4);
    assert.equal(metrics.totalUnits, 17);
    assert.equal(metrics.healthyCount, 2);
    assert.equal(metrics.lowStockCount, 1);
    assert.equal(metrics.outOfStockCount, 1);
    assert.equal(metrics.unassignedCount, 1);
    // 3 de 4 SKUs têm saldo > 0 e local válido -> 75%
    assert.equal(metrics.coverageRate, 75);
    assert.equal(metrics.statusLevel, 'critical');
  });

  it('returns statusLevel "healthy" when all SKUs have > 3 units and "attention" when low stock exists without stockouts', () => {
    const spaces = [{ id: 10, name: 'Almoxarifado' }];
    const allHealthy = computeStockHealthMetrics(
      [{ id: 1, name: 'Item A', quantity: 8, space_id: 10 }],
      spaces
    );
    assert.equal(allHealthy.statusLevel, 'healthy');
    assert.equal(allHealthy.coverageRate, 100);

    const attention = computeStockHealthMetrics(
      [{ id: 1, name: 'Item B', quantity: 2, space_id: 10 }],
      spaces
    );
    assert.equal(attention.statusLevel, 'attention');
    assert.equal(attention.coverageRate, 100);
  });

  it('B2BStockHealthBanner component follows true-black-flat tokens, tabular-nums, Lucide icons, and zero emojis', () => {
    const bannerPath = path.resolve(
      'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/components/B2BStockHealthBanner.js'
    );
    const source = fs.readFileSync(bannerPath, 'utf8');

    assert.match(source, /surface:\s*['"]#111111['"]/);
    assert.match(source, /accent:\s*['"]#c6f24e['"]/);
    assert.match(source, /fontVariant:\s*\[\s*['"]tabular-nums['"]\s*\]/);
    assert.match(source, /lucide-react-native/);
    assert.match(
      source,
      /flexShrink:\s*1/,
      'titleText must have flexShrink: 1 so the coverage badge never overlaps the header title on narrow screens'
    );
    assert.match(
      source,
      /flexWrap:\s*['"]wrap['"]/,
      'headerRow must support flexWrap: wrap to prevent badge overlap'
    );
    assert.equal(
      /[\u{1F300}-\u{1FAFF}]/u.test(source),
      false,
      'Must not contain any emojis'
    );
  });

  it('integrates B2BStockHealthBanner and safe deleteSpace into App.js', () => {
    const appPath = path.resolve(
      'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/App.js'
    );
    const appSource = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      appSource.includes('B2BStockHealthBanner'),
      'App.js must import and render B2BStockHealthBanner'
    );
    assert.ok(
      appSource.includes('deleteSpace'),
      'App.js must import and connect deleteSpace for safe space removal'
    );
    assert.ok(
      appSource.includes('editingItemImageUri'),
      'App.js must support capturing/updating item photo inside InventarioScreen inline editor'
    );
    assert.ok(
      appSource.includes('getItemsBySpace'),
      'App.js must import and use getItemsBySpace to display items saved inside a selected space in EspacosScreen'
    );
    assert.ok(
      appSource.includes('Itens guardados neste local'),
      'EspacosScreen must display "Itens guardados neste local" when a space is selected'
    );
    assert.equal(
      appSource.includes('return lista.length > 0 ? lista[0].id : null;'),
      false,
      'ScannerScreen must NOT pre-select lista[0].id by default for storage location'
    );
    assert.match(
      appSource,
      /keyboardVerticalOffset=/,
      'App.js must configure keyboardVerticalOffset on KeyboardAvoidingView so the keyboard never covers TextInputs'
    );
    assert.equal(
      appSource.includes('onSubmitEditing={handleSalvar}'),
      false,
      'ScannerScreen TextInputs must NOT auto-save via onSubmitEditing={handleSalvar}; only the Salvar Item button should save'
    );
    assert.ok(
      appSource.includes('keyboardDidShow') && appSource.includes('keyboardDidHide'),
      'App.js must track keyboard visibility dynamically so pages do not have an empty bottom void when the keyboard is closed'
    );
    assert.ok(
      appSource.includes('lightboxImage'),
      'App.js must provide a full-frame photo lightbox modal and uncropped studio framing for item and space photos'
    );
    assert.ok(
      appSource.includes('cameraShutterDock') &&
        appSource.includes('capturedDockActionsRow') &&
        !appSource.includes('viewfinderShutterOverlay') &&
        !appSource.includes('cameraStageHeader'),
      'App.js must keep the camera viewfinder clean (no shutter inside the frame and no technical YOLO/Scanner header) and provide the bottom cameraShutterDock button'
    );
  });
});
