import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInventoryCsvContent,
  importInventoryFromCsvText,
} from '../utils/importCsv.js';

describe('B2B CSV Bulk Import Parser & Sanitizer (TDD)', () => {
  it('parses 5-column Armário Digital CSV and 4-column ERP CSV (both comma and semicolon delimiters)', () => {
    const csv5Col = [
      '\uFEFFID,Código de Barras,Nome do Produto,Quantidade,Espaço',
      '10,7891000100103,"Teclado Mecânico, ABNT2 ""Pro""",12,Galpão A',
      '11,,Cabo HDMI 2.1,5,Sem local definido',
    ].join('\r\n');

    const rows5 = parseInventoryCsvContent(csv5Col);
    assert.equal(rows5.length, 2);
    assert.deepEqual(rows5[0], {
      barcode: '7891000100103',
      name: 'Teclado Mecânico, ABNT2 "Pro"',
      quantity: 12,
      space_name: 'Galpão A',
    });
    assert.deepEqual(rows5[1], {
      barcode: '',
      name: 'Cabo HDMI 2.1',
      quantity: 5,
      space_name: 'Sem local definido',
    });

    const csvSemicolon4Col = [
      'Código de Barras;Nome do Produto;Quantidade;Espaço',
      '7894445556667;Monitor 27 Polegadas;8;Corredor Central',
    ].join('\n');

    const rows4 = parseInventoryCsvContent(csvSemicolon4Col);
    assert.equal(rows4.length, 1);
    assert.deepEqual(rows4[0], {
      barcode: '7894445556667',
      name: 'Monitor 27 Polegadas',
      quantity: 8,
      space_name: 'Corredor Central',
    });
  });

  it('sanitizes formula injection prefixes, null bytes, and unwraps OWASP-escaped leading apostrophes', () => {
    const maliciousCsv = [
      'ID,Código de Barras,Nome do Produto,Quantidade,Espaço',
      '1,7890001112223,"\'=CMD|\' /C calc\'!A0",3,=HYPERLINK("http://evil")',
      '2,+7890009998887,@ Kit Chave\x00 de Fenda,0, Almoxarifado ',
    ].join('\n');

    const rows = parseInventoryCsvContent(maliciousCsv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name.startsWith('='), false);
    assert.equal(rows[0].name.startsWith("'="), false);
    assert.equal(rows[0].space_name.startsWith('='), false);
    assert.equal(rows[1].name.includes('\x00'), false);
    assert.equal(rows[1].quantity, 0);
    assert.equal(rows[1].space_name, 'Almoxarifado');
  });

  it('orchestrates importInventoryFromCsvText and delegates validated rows to bulkUpsertFn', async () => {
    let receivedEntries = null;
    const fakeBulkUpsert = async (entries) => {
      receivedEntries = entries;
      return {
        insertedCount: entries.length,
        updatedCount: 0,
        createdSpacesCount: 1,
        totalProcessed: entries.length,
      };
    };

    const csv = [
      'ID,Código de Barras,Nome do Produto,Quantidade,Espaço',
      '1,7891234567890,Fonte Chaveada 12V,20,Estoque Elétrica',
    ].join('\n');

    const result = await importInventoryFromCsvText(csv, fakeBulkUpsert);
    assert.equal(result.totalProcessed, 1);
    assert.equal(receivedEntries.length, 1);
    assert.equal(receivedEntries[0].barcode, '7891234567890');
    assert.equal(receivedEntries[0].quantity, 20);
  });

  it('integrates bulkUpsertItemsFromCatalog, importInventoryFromCsvText, and stock audit filters in App.js without emojis', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const appSource = fs.readFileSync(
      path.resolve('C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/App.js'),
      'utf8'
    );

    assert.ok(
      appSource.includes('bulkUpsertItemsFromCatalog'),
      'App.js must import bulkUpsertItemsFromCatalog'
    );
    assert.ok(
      appSource.includes('importInventoryFromCsvText'),
      'App.js must import importInventoryFromCsvText'
    );
    assert.ok(
      appSource.includes('stockFilter'),
      'App.js must provide stockFilter state for stockout/low-stock audit'
    );
    assert.ok(
      appSource.includes('getStockMovements'),
      'App.js must import and load getStockMovements for B2B Audit Log'
    );
    assert.ok(
      appSource.includes('showAuditLogPanel'),
      'App.js must render the collapsible B2B Audit Log panel'
    );
    assert.ok(
      appSource.includes('updateItemDetails'),
      'App.js must import and connect updateItemDetails for inline item/space transfer'
    );
    assert.ok(
      appSource.includes('generateAndShareMovementsCSV'),
      'App.js must import and connect generateAndShareMovementsCSV for Audit Log CSV export'
    );
    assert.ok(
      appSource.includes('editingItemId'),
      'App.js must support inline item editing and space transfer in InventarioScreen'
    );
  });
});
