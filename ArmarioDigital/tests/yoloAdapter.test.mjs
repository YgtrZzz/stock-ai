import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDetections,
  projectBoundingBoxToViewport,
  summarizeDetectionsForProfile,
  runYoloInference,
} from '../vision/yoloAdapter.js';

describe('YOLO Edge AI Adapter & Profile Summarizer (TDD - Task 2)', () => {
  it('filters out low-confidence or malformed boxes and clamps coordinates to [0, 1] sorted by confidence descending', () => {
    // Arrange
    const rawDetections = [
      {
        id: 'det-low',
        label: 'Ruído',
        confidence: 0.22,
        bbox: [0.1, 0.1, 0.3, 0.3],
      },
      {
        id: 'det-2',
        label: 'Caixa de Parafusos M6',
        confidence: 0.84,
        bbox: [-0.05, 0.2, 0.5, 0.4],
      },
      {
        id: 'det-1',
        label: 'Furadeira de Impacto',
        confidence: 0.96,
        bbox: [0.6, 0.7, 0.6, 0.5], // Extrapola 1.0 na largura/altura
      },
      {
        id: 'det-invalid',
        label: '',
        confidence: 0.99,
        bbox: [0.1, 0.1, 0, 0.2],
      },
    ];

    // Act
    const normalized = normalizeDetections(rawDetections, {
      minConfidence: 0.5,
    });

    // Assert
    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].id, 'det-1');
    assert.equal(normalized[0].label, 'Furadeira de Impacto');
    assert.equal(normalized[0].confidence, 0.96);
    // Clamped: x=0.6, y=0.7 -> max width=0.4, max height=0.3
    assert.deepEqual(normalized[0].bbox, [0.6, 0.7, 0.4, 0.3]);

    assert.equal(normalized[1].id, 'det-2');
    assert.equal(normalized[1].bbox[0], 0);
  });

  it('projects normalized [x, y, w, h] coordinates accurately onto pixel viewport dimensions', () => {
    // Arrange
    const bbox = [0.25, 0.1, 0.5, 0.4];

    // Act
    const rect = projectBoundingBoxToViewport(bbox, 400, 300);

    // Assert
    assert.deepEqual(rect, {
      left: 100,
      top: 30,
      width: 200,
      height: 120,
    });
  });

  it('generates Home profile summary highlighting the primary detected class for item naming', () => {
    // Arrange
    const detections = [
      {
        id: 'home-1',
        label: 'Liquidificador',
        confidence: 0.78,
        bbox: [0.1, 0.2, 0.3, 0.4],
      },
      {
        id: 'home-2',
        label: 'Cafeteira Expresso',
        confidence: 0.94,
        bbox: [0.4, 0.15, 0.35, 0.5],
      },
    ];

    // Act
    const summary = summarizeDetectionsForProfile(detections, 'home');

    // Assert
    assert.equal(summary.profile, 'home');
    assert.equal(summary.hasDetections, true);
    assert.equal(summary.primaryLabel, 'Cafeteira Expresso');
    assert.equal(summary.primaryConfidence, 0.94);
    assert.equal(summary.suggestedItemName, 'Cafeteira Expresso');
    assert.equal(summary.suggestedQuantity, 1);
    assert.equal(summary.totalDetected, 2);
  });

  it('generates Business profile summary focusing on object counting for automatic batch sum', () => {
    // Arrange
    const detections = [
      {
        id: 'b2b-1',
        label: 'Caixa Padrão SKU-10',
        confidence: 0.91,
        bbox: [0.05, 0.1, 0.25, 0.25],
      },
      {
        id: 'b2b-2',
        label: 'Caixa Padrão SKU-10',
        confidence: 0.88,
        bbox: [0.35, 0.1, 0.25, 0.25],
      },
      {
        id: 'b2b-3',
        label: 'Caixa Padrão SKU-10',
        confidence: 0.85,
        bbox: [0.65, 0.1, 0.25, 0.25],
      },
      {
        id: 'b2b-4',
        label: 'Bobina Plástica',
        confidence: 0.79,
        bbox: [0.1, 0.55, 0.3, 0.3],
      },
    ];

    // Act
    const summary = summarizeDetectionsForProfile(detections, 'business');

    // Assert
    assert.equal(summary.profile, 'business');
    assert.equal(summary.hasDetections, true);
    assert.equal(summary.totalDetected, 4);
    assert.equal(summary.suggestedQuantity, 4);
    assert.equal(summary.dominantLabel, 'Caixa Padrão SKU-10');
    assert.equal(summary.dominantCount, 3);
    assert.deepEqual(summary.countsByLabel, {
      'Caixa Padrão SKU-10': 3,
      'Bobina Plástica': 1,
    });
  });

  it('executes pluggable TFLite runtime adapter in runYoloInference and returns profile-specific summary', async () => {
    // Arrange
    const fakeTfliteRuntime = {
      async detect(frame) {
        assert.equal(frame.uri, 'file:///app/documents/armario_images/test.jpg');
        return [
          {
            id: 'box-1',
            label: 'Palete B2B',
            confidence: 0.92,
            bbox: [0.1, 0.1, 0.4, 0.4],
          },
          {
            id: 'box-2',
            label: 'Palete B2B',
            confidence: 0.87,
            bbox: [0.5, 0.1, 0.4, 0.4],
          },
        ];
      },
    };

    // Act
    const result = await runYoloInference(
      { uri: 'file:///app/documents/armario_images/test.jpg', userProfile: 'business' },
      fakeTfliteRuntime
    );

    // Assert
    assert.equal(result.detections.length, 2);
    assert.equal(result.summary.profile, 'business');
    assert.equal(result.summary.suggestedQuantity, 2);
    assert.equal(result.summary.dominantLabel, 'Palete B2B');
  });
});
