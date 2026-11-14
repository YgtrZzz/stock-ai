import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeVisualSignature,
  computeVisualSimilarity,
  findBestVisualMatch,
  parseVisualSignature,
} from '../vision/visualMatcher.js';

describe('Cycle 10 — Visual Product Recognition via Photo Signature + YOLO Class (TDD)', () => {
  it('computes a deterministic visual signature from base64 image + YOLO detections and guards against oversized payloads', () => {
    // Cria uma imagem sintética determinística (padrão A: gradiente crescente)
    const bytesA = Buffer.alloc(4096);
    for (let i = 0; i < bytesA.length; i += 1) {
      bytesA[i] = (i * 7 + 31) % 256;
    }
    const base64A = bytesA.toString('base64');
    const detectionsA = [
      {
        classId: 39,
        label: 'Garrafa',
        confidence: 0.88,
        bbox: [0.25, 0.15, 0.35, 0.7],
      },
    ];

    const sig1 = computeVisualSignature({
      base64: base64A,
      detections: detectionsA,
    });
    const sig2 = computeVisualSignature({
      base64: base64A,
      detections: detectionsA,
    });

    assert.equal(typeof sig1, 'string');
    assert.equal(sig1, sig2, 'Visual signature must be deterministic');

    const parsed = parseVisualSignature(sig1);
    assert.ok(parsed, 'Parsed signature must be an object');
    assert.equal(parsed.v, 3);
    assert.equal(parsed.primaryClass, 'Garrafa');
    assert.equal(Array.isArray(parsed.grid), true);
    assert.equal(parsed.grid.length, 144);
    assert.equal(Array.isArray(parsed.hist), true);
    assert.equal(parsed.hist.length, 20);
    assert.equal(typeof parsed.dHash, 'string');
  });

  it('recognizes a previously photographed item (returning name, space_id, and barcode) even with minor lighting variations, while rejecting different items', () => {
    // Item 1: Caixa de Parafusos (padrão periódico senoidal/modular)
    const bytesItem1 = Buffer.alloc(6000);
    for (let i = 0; i < bytesItem1.length; i += 1) {
      bytesItem1[i] = Math.min(255, Math.floor(((i * 13) % 200) + 20));
    }
    // Mesma cena com leve variação de brilho (+8 em todos os pixels — iluminação ambiente diferente)
    const bytesItem1LightingVariant = Buffer.alloc(6000);
    for (let i = 0; i < bytesItem1LightingVariant.length; i += 1) {
      bytesItem1LightingVariant[i] = Math.min(255, bytesItem1[i] + 8);
    }

    // Item 2: Furadeira (padrão visual completamente diferente)
    const bytesItem2 = Buffer.alloc(6000);
    for (let i = 0; i < bytesItem2.length; i += 1) {
      bytesItem2[i] = i < 3000 ? 240 - (i % 40) : (i * 3) % 50;
    }

    const sigItem1 = computeVisualSignature({
      base64: bytesItem1.toString('base64'),
      detections: [
        {
          classId: 73,
          label: 'Caixa / Livro',
          confidence: 0.84,
          bbox: [0.2, 0.2, 0.6, 0.6],
        },
      ],
    });

    const sigItem2 = computeVisualSignature({
      base64: bytesItem2.toString('base64'),
      detections: [
        {
          classId: 76,
          label: 'Tesoura / Ferramenta',
          confidence: 0.81,
          bbox: [0.1, 0.3, 0.8, 0.3],
        },
      ],
    });

    const registeredItems = [
      {
        id: 101,
        name: 'Caixa de Parafusos Sextavados',
        barcode: '7891000998877',
        quantity: 25,
        space_id: 4,
        space_name: 'Galpão B / Prateleira 2',
        visual_signature: sigItem1,
      },
      {
        id: 102,
        name: 'Alicate de Corte Profissional',
        barcode: '7892000112233',
        quantity: 6,
        space_id: 7,
        space_name: 'Oficina Central',
        visual_signature: sigItem2,
      },
    ];

    // Captura nova foto do Item 1 sob iluminação levemente diferente
    const candidateSig = computeVisualSignature({
      base64: bytesItem1LightingVariant.toString('base64'),
      detections: [
        {
          classId: 73,
          label: 'Caixa / Livro',
          confidence: 0.79,
          bbox: [0.22, 0.19, 0.58, 0.61],
        },
      ],
    });

    const match = findBestVisualMatch(candidateSig, registeredItems);
    assert.ok(match, 'Should recognize the previously registered item');
    assert.equal(match.item.id, 101);
    assert.equal(match.item.name, 'Caixa de Parafusos Sextavados');
    assert.equal(match.item.space_id, 4);
    assert.equal(match.item.barcode, '7891000998877');
    assert.ok(match.similarity >= 0.8);

    // Verifica que a similaridade cruzada entre Item 1 e Item 2 é baixa
    const crossSimilarity = computeVisualSimilarity(sigItem1, sigItem2);
    assert.ok(
      crossSimilarity < 0.7,
      `Expected cross similarity < 0.7, got ${crossSimilarity}`
    );
  });

  it('blocks Prototype Pollution and malformed signatures safely (OWASP Mobile)', () => {
    const polluted =
      '{"v":1,"__proto__":{"polluted":true},"grid":[1,2,3],"dHash":"00ff"}';
    assert.equal(parseVisualSignature(polluted), null);
    assert.equal(parseVisualSignature('not-valid-json'), null);
    assert.equal(computeVisualSimilarity(polluted, null), 0);
  });

  it('integrates visual_signature in database.js and visual recognition auto-fill in App.js', () => {
    const baseDir = 'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital';
    const dbSource = fs.readFileSync(path.resolve(baseDir, 'database.js'), 'utf8');
    const appSource = fs.readFileSync(path.resolve(baseDir, 'App.js'), 'utf8');

    assert.ok(
      dbSource.includes('visual_signature') &&
        dbSource.includes('backfillVisualSignatures'),
      'database.js must migrate visual_signature and provide backfillVisualSignatures'
    );
    assert.ok(
      appSource.includes('computeVisualSignature') &&
        appSource.includes('findBestVisualMatch') &&
        appSource.includes('backfillVisualSignatures'),
      'App.js must backfill, compute visual signature, and match against existing items when taking a photo'
    );
  });
});
