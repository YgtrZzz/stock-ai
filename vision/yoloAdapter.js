/**
 * Camada de Domínio & Motor de Inferência Edge AI para Modelo YOLO (.tflite)
 * Compatível com react-native-fast-tflite (useTensorflowModel / loadTensorflowModel).
 *
 * Responsabilidades:
 * 1. Mapear as 80 categorias genéricas do dataset COCO (Zero-Shot / Open-Vocabulary).
 * 2. Preparar o tensor de entrada (ArrayBuffer) e executar model.run([inputBuffer]) / model.runSync([inputBuffer]).
 * 3. Decodificar os tensores binários de saída (Float32Array) gerados pelo yolov8n.tflite.
 * 4. Normalizar bounding boxes ([x, y, width, height] em 0..1) e gerar resumos por perfil ('home' vs 'business').
 */

export const DEFAULT_MIN_CONFIDENCE = 0.45;
export const YOLO_INPUT_SIZE = 640;

/**
 * As 80 classes oficiais do dataset COCO (Ultralytics YOLOv8n) traduzidas para português
 * para preenchimento assistido Zero-Shot / Open-Vocabulary.
 */
export const COCO_CLASSES = [
  'Pessoa',
  'Bicicleta',
  'Carro',
  'Motocicleta',
  'Avião',
  'Ônibus',
  'Trem',
  'Caminhão',
  'Barco',
  'Semáforo',
  'Hidrante',
  'Placa de Pare',
  'Parquímetro',
  'Banco',
  'Pássaro',
  'Gato',
  'Cachorro',
  'Cavalo',
  'Ovelha',
  'Vaca',
  'Elefante',
  'Urso',
  'Zebra',
  'Girafa',
  'Mochila',
  'Guarda-chuva',
  'Bolsa',
  'Gravata',
  'Mala',
  'Frisbee',
  'Esquis',
  'Snowboard',
  'Bola Esportiva',
  'Pipa',
  'Taco de Beisebol',
  'Luva de Beisebol',
  'Skate',
  'Prancha de Surfe',
  'Raquete de Tênis',
  'Garrafa',
  'Taça de Vinho',
  'Copo',
  'Garfo',
  'Faca',
  'Colher',
  'Tigela',
  'Banana',
  'Maçã',
  'Sanduíche',
  'Laranja',
  'Brócolis',
  'Cenoura',
  'Cachorro-quente',
  'Pizza',
  'Rosquinha',
  'Bolo',
  'Cadeira',
  'Sofá',
  'Planta em Vaso',
  'Cama',
  'Mesa de Jantar',
  'Vaso Sanitário',
  'Televisão',
  'Notebook',
  'Mouse',
  'Controle Remoto',
  'Teclado',
  'Celular',
  'Micro-ondas',
  'Forno',
  'Torradeira',
  'Pia',
  'Geladeira',
  'Livro',
  'Relógio',
  'Vaso',
  'Tesoura',
  'Ursinho de Pelúcia',
  'Secador de Cabelo',
  'Escova de Dentes',
];

function clampUnit(val) {
  if (!Number.isFinite(val)) return 0;
  return Math.min(1, Math.max(0, val));
}

function roundCoord(val) {
  return Math.round(val * 10000) / 10000;
}

/**
 * Retorna o nome amigável da classe COCO a partir do seu índice numérico (0..79).
 *
 * @param {number} classId
 * @returns {string}
 */
export function resolveCocoLabel(classId) {
  const idx = Math.trunc(Number(classId));
  if (Number.isFinite(idx) && idx >= 0 && idx < COCO_CLASSES.length) {
    return COCO_CLASSES[idx];
  }
  return `Objeto #${Number.isFinite(idx) ? idx : 0}`;
}

/**
 * Normaliza, filtra por limiar de confiança e ordena as detecções da maior para a menor confiança.
 *
 * @param {Array<{ id?: string, label?: string, classId?: number, confidence?: number, bbox?: number[] }>} rawDetections
 * @param {{ minConfidence?: number }} [options]
 * @returns {Array<{ id: string, label: string, classId: number|null, confidence: number, bbox: [number, number, number, number] }>}
 */
export function normalizeDetections(rawDetections = [], options = {}) {
  if (!Array.isArray(rawDetections)) return [];

  const minConfidence = Number.isFinite(options?.minConfidence)
    ? options.minConfidence
    : DEFAULT_MIN_CONFIDENCE;

  const valid = [];

  for (let i = 0; i < rawDetections.length; i += 1) {
    const raw = rawDetections[i];
    if (!raw || typeof raw !== 'object') continue;

    const classId = Number.isFinite(raw.classId) ? Number(raw.classId) : null;
    const label =
      String(raw.label ?? '').trim() ||
      (classId !== null ? resolveCocoLabel(classId) : '');
    if (!label) continue;

    const confidence = Number(raw.confidence);
    if (!Number.isFinite(confidence) || confidence < minConfidence) continue;

    if (!Array.isArray(raw.bbox) || raw.bbox.length < 4) continue;
    const [rawX, rawY, rawW, rawH] = raw.bbox.map(Number);
    if (
      !Number.isFinite(rawX) ||
      !Number.isFinite(rawY) ||
      !Number.isFinite(rawW) ||
      !Number.isFinite(rawH) ||
      rawW <= 0 ||
      rawH <= 0
    ) {
      continue;
    }

    const x = roundCoord(clampUnit(rawX));
    const y = roundCoord(clampUnit(rawY));
    const maxW = Math.max(0, 1 - x);
    const maxH = Math.max(0, 1 - y);
    const w = roundCoord(Math.min(maxW, clampUnit(rawW)));
    const h = roundCoord(Math.min(maxH, clampUnit(rawH)));

    if (w <= 0 || h <= 0) continue;

    valid.push({
      id: String(raw.id || `yolo_${i + 1}`),
      label,
      classId,
      confidence: roundCoord(clampUnit(confidence)),
      bbox: [x, y, w, h],
    });
  }

  valid.sort((a, b) => b.confidence - a.confidence);
  return valid;
}

/**
 * Prepara o ArrayBuffer de entrada para o modelo TFLite (react-native-fast-tflite).
 * Se o chamador já fornecer um tensorBuffer (ArrayBuffer ou TypedArray), utiliza-o diretamente;
 * caso contrário, aloca um tensor compatível com o descritor de entrada do modelo (padrão [1, 640, 640, 3]).
 *
 * @param {{ tensorBuffer?: ArrayBuffer | ArrayBufferView, width?: number, height?: number }} input
 * @param {{ shape?: number[], dataType?: string } | undefined} modelInputDescriptor
 * @returns {ArrayBuffer}
 */
export function prepareInputTensor(input = {}, modelInputDescriptor = undefined) {
  if (input?.tensorBuffer instanceof ArrayBuffer) {
    return input.tensorBuffer;
  }
  if (ArrayBuffer.isView(input?.tensorBuffer)) {
    return input.tensorBuffer.buffer.slice(
      input.tensorBuffer.byteOffset,
      input.tensorBuffer.byteOffset + input.tensorBuffer.byteLength
    );
  }

  const shape =
    Array.isArray(modelInputDescriptor?.shape) &&
    modelInputDescriptor.shape.length > 0
      ? modelInputDescriptor.shape
      : [1, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE, 3];

  const totalElements = shape.reduce(
    (acc, dim) => acc * (Number.isFinite(dim) && dim > 0 ? dim : 1),
    1
  );
  const dataType = String(modelInputDescriptor?.dataType ?? 'float32');

  if (dataType === 'uint8' || dataType === 'int8') {
    return new Uint8Array(totalElements).buffer;
  }
  return new Float32Array(totalElements).buffer;
}

/**
 * Decodifica os tensores binários (ArrayBuffer[]) retornados por model.run() / model.runSync()
 * do react-native-fast-tflite.
 *
 * Suporta:
 * 1. Formato YOLOv8 NMS Export ([1, N, 6] em um único tensor: [x1, y1, x2, y2, score, classId]).
 * 2. Formato TFLite Detection PostProcess (4 tensores: [boxes, classes, scores, count]).
 *
 * @param {ArrayBuffer[]} outputBuffers
 * @param {{ minConfidence?: number, inputSize?: number, labels?: string[] }} [options]
 * @returns {Array<{ id: string, label: string, classId: number|null, confidence: number, bbox: [number, number, number, number] }>}
 */
export function decodeYoloOutputTensors(outputBuffers = [], options = {}) {
  if (!Array.isArray(outputBuffers) || outputBuffers.length === 0) {
    return [];
  }

  const minConfidence = Number.isFinite(options?.minConfidence)
    ? options.minConfidence
    : DEFAULT_MIN_CONFIDENCE;
  const inputSize =
    Number.isFinite(options?.inputSize) && options.inputSize > 0
      ? options.inputSize
      : YOLO_INPUT_SIZE;
  const labels = Array.isArray(options?.labels) ? options.labels : COCO_CLASSES;

  const rawDetections = [];

  // Formato 2: 4 tensores separados [boxes, classes, scores, count]
  if (
    outputBuffers.length >= 3 &&
    outputBuffers[0] instanceof ArrayBuffer &&
    outputBuffers[1] instanceof ArrayBuffer &&
    outputBuffers[2] instanceof ArrayBuffer
  ) {
    const boxes = new Float32Array(outputBuffers[0]);
    const classes = new Float32Array(outputBuffers[1]);
    const scores = new Float32Array(outputBuffers[2]);
    const count =
      outputBuffers[3] instanceof ArrayBuffer
        ? Math.min(scores.length, Math.trunc(new Float32Array(outputBuffers[3])[0]))
        : scores.length;

    for (let i = 0; i < count; i += 1) {
      const confidence = scores[i];
      if (!Number.isFinite(confidence) || confidence < minConfidence) continue;

      const base = i * 4;
      let ymin = boxes[base];
      let xmin = boxes[base + 1];
      let ymax = boxes[base + 2];
      let xmax = boxes[base + 3];

      if (xmax > 1.05 || ymax > 1.05) {
        xmin /= inputSize;
        ymin /= inputSize;
        xmax /= inputSize;
        ymax /= inputSize;
      }

      const classId = Math.trunc(classes[i] ?? 0);
      const label = labels[classId] || resolveCocoLabel(classId);

      rawDetections.push({
        id: `tflite_${i + 1}`,
        classId,
        label,
        confidence,
        bbox: [xmin, ymin, Math.max(0, xmax - xmin), Math.max(0, ymax - ymin)],
      });
    }

    return normalizeDetections(rawDetections, { minConfidence });
  }

  // Formato 1: YOLOv8 NMS tensor único [1, N, 6] -> (x1, y1, x2, y2, confidence, classId)
  const firstBuffer = outputBuffers[0];
  if (!(firstBuffer instanceof ArrayBuffer)) {
    return [];
  }

  const data = new Float32Array(firstBuffer);
  const stride = 6;
  const numRows = Math.floor(data.length / stride);

  for (let i = 0; i < numRows; i += 1) {
    const offset = i * stride;
    const confidence = data[offset + 4];
    if (!Number.isFinite(confidence) || confidence < minConfidence) continue;

    let x1 = data[offset];
    let y1 = data[offset + 1];
    let x2 = data[offset + 2];
    let y2 = data[offset + 3];
    const classId = Math.trunc(data[offset + 5]);

    // Caso o modelo exporte coordenadas em pixels (0..640), converte para escala normalizada (0..1)
    if (x2 > 1.05 || y2 > 1.05) {
      x1 /= inputSize;
      y1 /= inputSize;
      x2 /= inputSize;
      y2 /= inputSize;
    }

    const width = x2 > x1 ? x2 - x1 : x2;
    const height = y2 > y1 ? y2 - y1 : y2;
    const label = labels[classId] || resolveCocoLabel(classId);

    rawDetections.push({
      id: `yolo_${i + 1}`,
      classId,
      label,
      confidence,
      bbox: [x1, y1, width, height],
    });
  }

  return normalizeDetections(rawDetections, { minConfidence });
}

/**
 * Projeta uma bounding box normalizada [x, y, width, height] (0..1)
 * para coordenadas em pixels dentro do viewport do componente Svg.
 *
 * @param {[number, number, number, number]} bbox
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
export function projectBoundingBoxToViewport(
  bbox,
  viewportWidth,
  viewportHeight
) {
  const vw =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const vh =
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0;

  if (!Array.isArray(bbox) || bbox.length < 4 || vw === 0 || vh === 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const [x, y, w, h] = bbox;
  return {
    left: Math.round(clampUnit(x) * vw),
    top: Math.round(clampUnit(y) * vh),
    width: Math.round(clampUnit(w) * vw),
    height: Math.round(clampUnit(h) * vh),
  };
}

/**
 * Gera um resumo semântico adaptado ao perfil ativo do utilizador:
 * - 'home' (Residencial): destaca a classe principal de maior confiança para nomear o item.
 * - 'business' (B2B): concentra-se na contagem total e por classe para soma automática de lote.
 *
 * @param {Array} detections Lista de detecções (brutas ou já normalizadas).
 * @param {'home'|'business'} userProfile Perfil ativo.
 * @param {{ minConfidence?: number }} [options]
 */
export function summarizeDetectionsForProfile(
  detections = [],
  userProfile = 'home',
  options = {}
) {
  const normalized = normalizeDetections(detections, options);
  const profile = userProfile === 'business' ? 'business' : 'home';
  const totalDetected = normalized.length;

  if (totalDetected === 0) {
    return {
      profile,
      hasDetections: false,
      totalDetected: 0,
      primaryLabel: null,
      primaryConfidence: 0,
      dominantLabel: null,
      dominantCount: 0,
      countsByLabel: {},
      suggestedItemName: '',
      suggestedQuantity: 1,
    };
  }

  const primary = normalized[0];
  const countsByLabel = {};
  let dominantLabel = primary.label;
  let dominantCount = 0;

  for (const det of normalized) {
    const nextCount = (countsByLabel[det.label] ?? 0) + 1;
    countsByLabel[det.label] = nextCount;
    if (nextCount > dominantCount) {
      dominantCount = nextCount;
      dominantLabel = det.label;
    }
  }

  if (profile === 'business') {
    return {
      profile: 'business',
      hasDetections: true,
      totalDetected,
      primaryLabel: primary.label,
      primaryConfidence: primary.confidence,
      dominantLabel,
      dominantCount,
      countsByLabel,
      suggestedItemName: dominantLabel,
      suggestedQuantity: totalDetected,
    };
  }

  return {
    profile: 'home',
    hasDetections: true,
    totalDetected,
    primaryLabel: primary.label,
    primaryConfidence: primary.confidence,
    dominantLabel,
    dominantCount,
    countsByLabel,
    suggestedItemName: primary.label,
    suggestedQuantity: 1,
  };
}

/**
 * Executa a inferência YOLO real utilizando o modelo carregado pelo react-native-fast-tflite
 * (via model.run([inputBuffer]) ou model.runSync([inputBuffer])) e retorna os arrays normalizados
 * de predição junto ao resumo por perfil ('home' vs 'business').
 *
 * @param {{ uri?: string, width?: number, height?: number, tensorBuffer?: ArrayBuffer | ArrayBufferView, userProfile?: 'home'|'business', minConfidence?: number }} input
 * @param {{ run?: (inputs: ArrayBuffer[]) => Promise<ArrayBuffer[]>, runSync?: (inputs: ArrayBuffer[]) => ArrayBuffer[], inputs?: Array<{ shape?: number[], dataType?: string }>, detect?: (input: object) => Promise<Array> } | null} [tfliteModelOrAdapter]
 */
export async function runYoloInference(input = {}, tfliteModelOrAdapter = null) {
  const userProfile = input?.userProfile === 'business' ? 'business' : 'home';
  const options = {
    minConfidence: Number.isFinite(input?.minConfidence)
      ? input.minConfidence
      : DEFAULT_MIN_CONFIDENCE,
  };

  let detections = [];

  if (tfliteModelOrAdapter) {
    if (
      typeof tfliteModelOrAdapter.run === 'function' ||
      typeof tfliteModelOrAdapter.runSync === 'function'
    ) {
      const inputDescriptor = Array.isArray(tfliteModelOrAdapter.inputs)
        ? tfliteModelOrAdapter.inputs[0]
        : undefined;
      const inputBuffer = prepareInputTensor(input, inputDescriptor);

      const outputBuffers =
        typeof tfliteModelOrAdapter.run === 'function'
          ? await tfliteModelOrAdapter.run([inputBuffer])
          : tfliteModelOrAdapter.runSync([inputBuffer]);

      detections = decodeYoloOutputTensors(outputBuffers, options);
    } else if (typeof tfliteModelOrAdapter.detect === 'function') {
      const rawDetections = (await tfliteModelOrAdapter.detect(input)) || [];
      detections = normalizeDetections(rawDetections, options);
    }
  }

  const summary = summarizeDetectionsForProfile(
    detections,
    userProfile,
    options
  );

  return {
    detections,
    summary,
    modelLoaded: Boolean(tfliteModelOrAdapter),
  };
}

export default {
  DEFAULT_MIN_CONFIDENCE,
  YOLO_INPUT_SIZE,
  COCO_CLASSES,
  resolveCocoLabel,
  normalizeDetections,
  prepareInputTensor,
  decodeYoloOutputTensors,
  projectBoundingBoxToViewport,
  summarizeDetectionsForProfile,
  runYoloInference,
};
