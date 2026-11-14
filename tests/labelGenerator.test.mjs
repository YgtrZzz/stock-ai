import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateInternalBarcode,
  generateCode128SvgPattern,
  generateThermalLabelHtml,
  generateA4LabelSheetHtml,
  sanitizeHtmlPayload,
} from '../utils/labelGenerator.js';

describe('Cycle 15 — Smart Label & Barcode Tag Generator for SMEs (TDD)', () => {
  test('generateInternalBarcode produces standardized identifier with deterministic checksum', () => {
    const code1 = generateInternalBarcode(101, 'ARM');
    assert.match(code1, /^ARM-\d{6}-\d$/);
    assert.equal(code1.startsWith('ARM-000101-'), true);

    const code2 = generateInternalBarcode(101, 'ARM');
    assert.equal(code1, code2, 'Mesmo sequenceId deve produzir mesmo checksum determinístico');

    const code3 = generateInternalBarcode(102, 'ARM');
    assert.notEqual(code1, code3);
  });

  test('generateCode128SvgPattern creates clean vector bars and calculates total width', () => {
    const pattern = generateCode128SvgPattern('ARM-000101-5', { barWidth: 2, height: 44 });
    assert.ok(Array.isArray(pattern.bars));
    assert.ok(pattern.bars.length > 10);
    assert.ok(pattern.totalWidth > 50);
    assert.equal(pattern.barHeight, 44);
    assert.equal(typeof pattern.svgString, 'string');
    assert.ok(pattern.svgString.includes('<rect'));
  });

  test('generateThermalLabelHtml formats 50x30mm thermal label with CSS @page and product details', () => {
    const html = generateThermalLabelHtml({
      item: { id: 1, name: 'Parafuso Philips 4x25', barcode: 'ARM-000001-2', quantity: 150 },
      spaceName: 'Prateleira A1',
      labelSize: '50x30mm',
    });

    assert.ok(html.includes('@page { size: 50mm 30mm; margin: 0; }'));
    assert.ok(html.includes('Parafuso Philips 4x25'));
    assert.ok(html.includes('Prateleira A1'));
    assert.ok(html.includes('ARM-000001-2'));
    assert.ok(html.includes('150 un.'));
    assert.ok(html.includes('ARMÁRIO DIGITAL'));
  });

  test('generateA4LabelSheetHtml renders grid of 21 labels formatted for standard A4 sticker paper', () => {
    const items = [
      { id: 1, name: 'Item 1', barcode: 'ARM-000001-2', quantity: 10 },
      { id: 2, name: 'Item 2', barcode: 'ARM-000002-4', quantity: 20 },
    ];
    const html = generateA4LabelSheetHtml({ items, copies: 2 });
    assert.ok(html.includes('@page { size: A4; margin: 10mm; }'));
    assert.ok(html.includes('grid-template-columns: repeat(3, 1fr)'));
    assert.ok(html.includes('Item 1'));
    assert.ok(html.includes('Item 2'));
  });

  test('sanitizeHtmlPayload neutralizes XSS and HTML injection attempts in labels', () => {
    const malicious = '<script>alert("hack")</script>&"\'test';
    const clean = sanitizeHtmlPayload(malicious);
    assert.equal(clean.includes('<script>'), false);
    assert.ok(clean.includes('&lt;script&gt;'));
    assert.ok(clean.includes('&quot;'));
  });
});
