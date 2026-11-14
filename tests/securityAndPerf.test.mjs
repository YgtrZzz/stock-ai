import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TOKENS } from '../utils/designTokens.js';
import {
  sanitizeBarcodeInput,
  sanitizeTextInput,
  sanitizeQuantityInput,
  validateCsvPayloadSize,
} from '../utils/securityValidators.js';
import { buildYoloInputTensorFromBase64 } from '../vision/imagePreprocessor.js';

describe('Cycle 7 — Cybersecurity Validators, Design Tokens, Image Tensor Preprocessor & 60 FPS Fluidity (TDD)', () => {
  it('exports immutable (Object.freeze) true-black-flat design tokens in utils/designTokens.js', () => {
    assert.ok(Object.isFrozen(TOKENS), 'TOKENS must be frozen to prevent runtime mutation');
    assert.equal(TOKENS.ground, '#000000');
    assert.equal(TOKENS.surface, '#111111');
    assert.equal(TOKENS.raised, '#2a2a2a');
    assert.equal(TOKENS.rule, '#161616');
    assert.equal(TOKENS.accent, '#c6f24e');
  });

  it('sanitizes barcodes, text inputs, quantities, and guards CSV payload size against OWASP Mobile attacks', () => {
    // Barcode sanitization
    assert.equal(sanitizeBarcodeInput('  7891000100103 \n\0 '), '7891000100103');
    assert.equal(sanitizeBarcodeInput('SKU-2026_A.1'), 'SKU-2026_A.1');
    // Rejects injection characters or overly long strings
    assert.equal(sanitizeBarcodeInput('<script>alert(1)</script>'), '');
    assert.equal(sanitizeBarcodeInput("7891000'; DROP TABLE items;--"), '');
    assert.equal(sanitizeBarcodeInput('A'.repeat(120)), '');

    // Text input sanitization (control chars, null bytes, length cap)
    assert.equal(
      sanitizeTextInput('  Caixa\u0000\u0007   Organizadora 20L  ', 60),
      'Caixa Organizadora 20L'
    );
    assert.equal(sanitizeTextInput('X'.repeat(100), 60).length, 60);

    // Quantity clamping [0..99999]
    assert.equal(sanitizeQuantityInput('25'), 25);
    assert.equal(sanitizeQuantityInput('-15'), 0);
    assert.equal(sanitizeQuantityInput('9999999'), 99999);
    assert.equal(sanitizeQuantityInput('abc', 1), 1);

    // CSV DoS protection
    const validCsv = '7891000100103;Produto A;10;Galpão 1';
    assert.equal(validateCsvPayloadSize(validCsv).valid, true);

    const hugeCsv = 'A'.repeat(600 * 1024);
    const hugeCheck = validateCsvPayloadSize(hugeCsv);
    assert.equal(hugeCheck.valid, false);
    assert.equal(hugeCheck.reason, 'payload_too_large');
  });

  it('preprocesses base64 camera image into normalized TFLite input tensor matching model input shape and bounds', () => {
    // Small valid JPEG-like base64 payload
    const sampleBytes = Buffer.alloc(1024);
    for (let i = 0; i < sampleBytes.length; i += 1) {
      sampleBytes[i] = (i * 37) & 0xff;
    }
    const base64Sample = sampleBytes.toString('base64');

    const tensorBuffer = buildYoloInputTensorFromBase64(base64Sample, {
      shape: [1, 32, 32, 3],
      dataType: 'float32',
    });

    assert.ok(tensorBuffer instanceof ArrayBuffer);
    const floatView = new Float32Array(tensorBuffer);
    assert.equal(floatView.length, 32 * 32 * 3);
    // Values must be normalized into [0, 1]
    assert.ok(floatView[0] >= 0 && floatView[0] <= 1);
    assert.ok(floatView[100] >= 0 && floatView[100] <= 1);

    // Rejects oversized base64 payloads (> 12 MB) to prevent Out-Of-Memory DoS
    const oversizedCheck = buildYoloInputTensorFromBase64('A'.repeat(16 * 1024 * 1024), {
      shape: [1, 32, 32, 3],
      dataType: 'float32',
    });
    assert.equal(oversizedCheck, null);
  });

  it('integrates PhotoLightboxModal, securityValidators, imagePreprocessor, and 60 FPS FlatList tuning into App.js', () => {
    const appPath = path.resolve(
      'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/App.js'
    );
    const appSource = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      appSource.includes('PhotoLightboxModal'),
      'App.js must use the modular PhotoLightboxModal component'
    );
    assert.ok(
      appSource.includes('sanitizeBarcodeInput') &&
        appSource.includes('sanitizeTextInput') &&
        appSource.includes('validateCsvPayloadSize'),
      'App.js must enforce OWASP input sanitization via utils/securityValidators.js'
    );
    assert.ok(
      appSource.includes('buildYoloInputTensorFromBase64'),
      'App.js must feed real preprocessed image tensors into runYoloInference when capturing photos'
    );
    assert.ok(
      appSource.includes('initialNumToRender') &&
        appSource.includes('maxToRenderPerBatch') &&
        appSource.includes('windowSize'),
      'App.js FlatLists must configure virtualization props for 60 FPS scrolling fluidity'
    );
  });
});
