import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeVisualSignature,
  computeVisualSimilarity,
  findBestVisualMatch,
  mergeVisualSignatures,
  parseVisualSignature,
} from '../vision/visualMatcher.js';

describe('Cycle 11 — Multi-Angle Visual Prototype Memory & Memoized Scanner Banners (TDD)', () => {
  it('merges up to 3 visual prototypes per item and matches against any stored angle', () => {
    // Ângulo 1 (frontal)
    const bytesAngle1 = Buffer.alloc(6000);
    for (let i = 0; i < bytesAngle1.length; i += 1) {
      bytesAngle1[i] = (i * 11 + 15) % 256;
    }

    // Ângulo 2 (lateral - bastante diferente do frontal)
    const bytesAngle2 = Buffer.alloc(6000);
    for (let i = 0; i < bytesAngle2.length; i += 1) {
      bytesAngle2[i] = i < 3000 ? 220 - (i % 50) : (i * 5) % 90;
    }

    // Ângulo 3 (superior)
    const bytesAngle3 = Buffer.alloc(6000);
    for (let i = 0; i < bytesAngle3.length; i += 1) {
      bytesAngle3[i] = ((i * 23) ^ 0x5a) % 256;
    }

    // Ângulo 4 (extra — deve manter no máximo 3 protótipos sem crescer indefinidamente)
    const bytesAngle4 = Buffer.alloc(6000);
    for (let i = 0; i < bytesAngle4.length; i += 1) {
      bytesAngle4[i] = (i * 31) % 256;
    }

    const sig1 = computeVisualSignature({ base64: bytesAngle1.toString('base64') });
    const sig2 = computeVisualSignature({ base64: bytesAngle2.toString('base64') });
    const sig3 = computeVisualSignature({ base64: bytesAngle3.toString('base64') });
    const sig4 = computeVisualSignature({ base64: bytesAngle4.toString('base64') });

    const merged12 = mergeVisualSignatures(sig1, sig2);
    const parsed12 = parseVisualSignature(merged12);
    assert.ok(parsed12);
    assert.equal(Array.isArray(parsed12.prototypes), true);
    assert.equal(parsed12.prototypes.length, 1);

    // Deve reconhecer tanto pelo Ângulo 1 quanto pelo Ângulo 2 com alta similaridade!
    assert.ok(computeVisualSimilarity(sig1, merged12) >= 0.95);
    assert.ok(computeVisualSimilarity(sig2, merged12) >= 0.95);

    // Adicionando Ângulo 3 e Ângulo 4 respeita o limite máximo de 3 visões totais (1 principal + 2 protótipos extras)
    const merged123 = mergeVisualSignatures(merged12, sig3);
    const merged1234 = mergeVisualSignatures(merged123, sig4);
    const parsed1234 = parseVisualSignature(merged1234);
    assert.ok(parsed1234.prototypes.length <= 2);

    const items = [
      {
        id: 50,
        name: 'Relógio Smartwatch',
        space_id: 2,
        space_name: 'Gaveta',
        quantity: 3,
        visual_signature: merged12,
      },
    ];

    const matchAngle2 = findBestVisualMatch(sig2, items);
    assert.ok(matchAngle2);
    assert.equal(matchAngle2.item.id, 50);
  });

  it('modularizes VisualRecognitionBanner and ScannedBarcodeBanner with React.memo and wires mergeVisualSignatures in App.js', () => {
    const baseDir = 'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital';
    const visualBannerSource = fs.readFileSync(
      path.resolve(baseDir, 'components/VisualRecognitionBanner.js'),
      'utf8'
    );
    const barcodeBannerSource = fs.readFileSync(
      path.resolve(baseDir, 'components/ScannedBarcodeBanner.js'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.resolve(baseDir, 'App.js'), 'utf8');

    assert.ok(
      visualBannerSource.includes('memo('),
      'VisualRecognitionBanner.js must be wrapped in React.memo'
    );
    assert.ok(
      barcodeBannerSource.includes('memo('),
      'ScannedBarcodeBanner.js must be wrapped in React.memo'
    );
    assert.ok(
      appSource.includes('VisualRecognitionBanner') &&
        appSource.includes('ScannedBarcodeBanner') &&
        appSource.includes('mergeVisualSignatures'),
      'App.js must integrate VisualRecognitionBanner, ScannedBarcodeBanner, and mergeVisualSignatures'
    );
  });
});
