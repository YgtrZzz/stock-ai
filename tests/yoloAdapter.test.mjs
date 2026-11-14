import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COCO_CLASSES,
  decodeYoloOutputTensors,
  normalizeDetections,
  projectBoundingBoxToViewport,
  resolveYoloEngineStatus,
  validateTfliteModelAsset,
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

  it('executes a real react-native-fast-tflite TfliteModel via model.run(ArrayBuffer[]) and maps COCO 80 classes', async () => {
    // Arrange: Simula o tensor binário Float32Array de saída do yolov8n.tflite (formato NMS [1, N, 6]: x1, y1, x2, y2, score, classId)
    // Classe 63 no COCO = 'Notebook', Classe 39 no COCO = 'Garrafa'
    assert.ok(Array.isArray(COCO_CLASSES));
    assert.equal(COCO_CLASSES.length, 80);
    assert.equal(typeof decodeYoloOutputTensors, 'function');

    const rawOutputFloats = new Float32Array([
      // Detecção 1: Notebook (classId 63), confiança 0.91, box [x1=0.1, y1=0.2, x2=0.6, y2=0.7]
      0.1, 0.2, 0.6, 0.7, 0.91, 63,
      // Detecção 2: Garrafa (classId 39), confiança 0.82, box [x1=0.65, y1=0.25, x2=0.85, y2=0.75]
      0.65, 0.25, 0.85, 0.75, 0.82, 39,
      // Detecção 3: Ruído abaixo do threshold (confiança 0.12)
      0.0, 0.0, 0.1, 0.1, 0.12, 0,
    ]);

    let receivedInputBuffers = null;
    const fakeFastTfliteModel = {
      inputs: [{ name: 'images', dataType: 'float32', shape: [1, 640, 640, 3] }],
      outputs: [{ name: 'output0', dataType: 'float32', shape: [1, 3, 6] }],
      async run(inputBuffers) {
        receivedInputBuffers = inputBuffers;
        return [rawOutputFloats.buffer];
      },
    };

    const dummyInputTensor = new Float32Array(12);

    // Act
    const result = await runYoloInference(
      {
        uri: 'file:///app/documents/armario_images/desk.jpg',
        userProfile: 'home',
        tensorBuffer: dummyInputTensor.buffer,
      },
      fakeFastTfliteModel
    );

    // Assert
    assert.ok(Array.isArray(receivedInputBuffers));
    assert.equal(receivedInputBuffers.length, 1);
    assert.ok(receivedInputBuffers[0] instanceof ArrayBuffer);

    assert.equal(result.detections.length, 2);
    assert.equal(result.detections[0].label, COCO_CLASSES[63]);
    assert.equal(result.detections[0].confidence, 0.91);
    // [x1=0.1, y1=0.2, x2=0.6, y2=0.7] -> [x=0.1, y=0.2, w=0.5, h=0.5]
    assert.deepEqual(result.detections[0].bbox, [0.1, 0.2, 0.5, 0.5]);

    assert.equal(result.summary.profile, 'home');
    assert.equal(result.summary.primaryLabel, COCO_CLASSES[63]);
    assert.equal(result.summary.suggestedItemName, COCO_CLASSES[63]);
  });

  it('resolves Edge AI engine status for UI diagnostics and degrades gracefully if TFLite runtime throws', async () => {
    assert.equal(typeof resolveYoloEngineStatus, 'function');

    const readyState = resolveYoloEngineStatus({
      state: 'loaded',
      model: { run: async () => [] },
    });
    assert.equal(readyState.status, 'ready');
    assert.equal(readyState.isReady, true);
    assert.equal(readyState.badgeLabel, 'YOLO Edge AI · Ativo');

    const fallbackState = resolveYoloEngineStatus({ state: 'error' });
    assert.equal(fallbackState.status, 'fallback');
    assert.equal(fallbackState.isReady, false);
    assert.equal(fallbackState.badgeLabel, 'Scanner Óptico · Offline');

    const brokenTfliteModel = {
      async run() {
        throw new Error('GPU Delegate initialization failed');
      },
    };

    const result = await runYoloInference(
      { uri: 'file:///app/cache/photo.jpg', userProfile: 'business' },
      brokenTfliteModel
    );

    assert.deepEqual(result.detections, []);
    assert.equal(result.summary.hasDetections, false);
    assert.equal(result.engineStatus, 'fallback');
  });

  it('validates TFLite v3 FlatBuffer magic header (TFL3 at offset 4) and detects placeholder binary assets', async () => {
    assert.equal(typeof validateTfliteModelAsset, 'function');

    const placeholderBuf = Buffer.from(
      'TFL3_PLACEHOLDER_MODEL_FOR_DEV_TESTING_ONLY',
      'ascii'
    );
    const placeholderCheck = validateTfliteModelAsset(placeholderBuf);
    assert.equal(placeholderCheck.isValidFlatBuffer, false);
    assert.equal(placeholderCheck.isPlaceholder, true);

    const validFlatBuffer = Buffer.alloc(128);
    validFlatBuffer.writeUInt32LE(24, 0); // FlatBuffer root table offset
    validFlatBuffer.write('TFL3', 4, 'ascii'); // TFLite v3 magic identifier at bytes 4..7
    const validCheck = validateTfliteModelAsset(validFlatBuffer);
    assert.equal(validCheck.isValidFlatBuffer, true);
    assert.equal(validCheck.isPlaceholder, false);
    assert.equal(validCheck.reason, 'valid_tflite_v3');

    // Verifica que o binário instalado em assets/models/yolov8n.tflite é um modelo TFL3 real
    const fs = await import('node:fs');
    const path = await import('node:path');
    const realAssetBuf = fs.readFileSync(
      path.resolve(
        'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/assets/models/yolov8n.tflite'
      )
    );
    const assetValidation = validateTfliteModelAsset(realAssetBuf);
    assert.equal(
      assetValidation.isValidFlatBuffer,
      true,
      'assets/models/yolov8n.tflite must be a real TFL3 FlatBuffer binary'
    );
    assert.equal(assetValidation.isPlaceholder, false);
  });
});
