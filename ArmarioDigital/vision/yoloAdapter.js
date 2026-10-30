/**
 * Camada de Domínio & Adaptador Edge AI para Modelo YOLO (.tflite)
 *
 * Responsabilidades:
 * 1. Normalizar e higienizar bounding boxes brutas ([x, y, width, height] em 0..1).
 * 2. Projetar coordenadas normalizadas para dimensões de viewport em pixels (react-native-svg).
 * 3. Gerar resumos adaptativos por perfil ('home' vs 'business'):
 *    - 'home': destaca a classe principal de maior confiança para nomeação rápida do item.
 *    - 'business': agrega e conta objetos detectados para soma automática de lote B2B.
 * 4. Expor contrato assíncrono plug-and-play para o futuro runtime nativo .tflite.
 */

export const DEFAULT_MIN_CONFIDENCE = 0.45;

function clampUnit(val) {
  if (!Number.isFinite(val)) return 0;
  return Math.min(1, Math.max(0, val));
}

function roundCoord(val) {
  return Math.round(val * 10000) / 10000;
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

    const label = String(raw.label ?? '').trim();
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
      classId: Number.isFinite(raw.classId) ? Number(raw.classId) : null,
      confidence: roundCoord(clampUnit(confidence)),
      bbox: [x, y, w, h],
    });
  }

  valid.sort((a, b) => b.confidence - a.confidence);
  return valid;
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
 * Executa a inferência YOLO através de um adaptador de runtime (.tflite) injetável
 * e devolve as bounding boxes normalizadas junto ao resumo adaptado ao perfil.
 *
 * @param {{ uri: string, width?: number, height?: number, userProfile?: 'home'|'business', minConfidence?: number }} input
 * @param {{ detect: (input: object) => Promise<Array> } | null} [runtimeAdapter]
 */
export async function runYoloInference(input = {}, runtimeAdapter = null) {
  const userProfile = input?.userProfile === 'business' ? 'business' : 'home';
  const options = {
    minConfidence: Number.isFinite(input?.minConfidence)
      ? input.minConfidence
      : DEFAULT_MIN_CONFIDENCE,
  };

  let rawDetections = [];
  if (runtimeAdapter && typeof runtimeAdapter.detect === 'function') {
    rawDetections = (await runtimeAdapter.detect(input)) || [];
  }

  const detections = normalizeDetections(rawDetections, options);
  const summary = summarizeDetectionsForProfile(
    detections,
    userProfile,
    options
  );

  return {
    detections,
    summary,
  };
}

export default {
  DEFAULT_MIN_CONFIDENCE,
  normalizeDetections,
  projectBoundingBoxToViewport,
  summarizeDetectionsForProfile,
  runYoloInference,
};
