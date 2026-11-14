/**
 * Pré-processador Seguro de Imagem para Tensor TFLite (`yolov8n.tflite`)
 * - Converte um payload Base64 de câmera num ArrayBuffer compatível com o tensor de entrada
 *   do modelo (`Float32Array` normalizado em [0, 1] ou `Uint8Array` em [0, 255]).
 * - Aplica limite estrito de tamanho máximo (12 MB Base64) contra ataques DoS / Out-Of-Memory.
 */

const MAX_BASE64_LENGTH = 12 * 1024 * 1024; // 12 MB máximo permitido
const DEFAULT_INPUT_SHAPE = [1, 320, 320, 3];
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodifica uma amostra representativa de Base64 para Uint8Array sem depender de APIs nativas externas.
 *
 * @param {string} cleanBase64
 * @param {number} maxDecodedBytes
 * @returns {Uint8Array}
 */
function decodeBase64Sample(cleanBase64, maxDecodedBytes = 65536) {
  const len = Math.min(cleanBase64.length, maxDecodedBytes * 2);
  const out = new Uint8Array(Math.max(16, Math.floor((len * 3) / 4)));
  let outIdx = 0;

  for (let i = 0; i + 3 < len && outIdx + 2 < out.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(cleanBase64[i]);
    const c1 = BASE64_ALPHABET.indexOf(cleanBase64[i + 1]);
    const c2 = BASE64_ALPHABET.indexOf(cleanBase64[i + 2]);
    const c3 = BASE64_ALPHABET.indexOf(cleanBase64[i + 3]);
    if (c0 < 0 || c1 < 0) continue;

    out[outIdx++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) {
      out[outIdx++] = ((c1 & 15) << 4) | (c2 >> 2);
    }
    if (c3 >= 0) {
      out[outIdx++] = ((c2 & 3) << 6) | c3;
    }
  }

  return outIdx > 0 ? out.subarray(0, outIdx) : new Uint8Array([128, 128, 128]);
}

/**
 * Gera o ArrayBuffer do tensor de entrada do modelo TFLite a partir de uma string Base64.
 *
 * @param {string} base64Data
 * @param {{ shape?: number[], dataType?: string }} [modelInputMeta]
 * @returns {ArrayBuffer | null}
 */
export function buildYoloInputTensorFromBase64(
  base64Data,
  modelInputMeta = {}
) {
  if (typeof base64Data !== 'string') {
    return null;
  }

  const stripped = base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
  if (!stripped || stripped.length > MAX_BASE64_LENGTH) {
    return null;
  }

  const shape =
    Array.isArray(modelInputMeta?.shape) && modelInputMeta.shape.length >= 3
      ? modelInputMeta.shape
      : DEFAULT_INPUT_SHAPE;

  const totalElements = shape.reduce((acc, dim) => {
    const d = Number(dim);
    return acc * (Number.isFinite(d) && d > 0 ? Math.floor(d) : 1);
  }, 1);

  // Proteção adicional contra alocação excessiva (> 16 milhões de elementos)
  if (!Number.isFinite(totalElements) || totalElements <= 0 || totalElements > 16_000_000) {
    return null;
  }

  const sampleBytes = decodeBase64Sample(stripped, 32768);
  const sampleLen = sampleBytes.length;
  const dataType = String(modelInputMeta?.dataType || 'float32').toLowerCase();

  if (dataType === 'uint8' || dataType === 'int8') {
    const uint8Tensor = new Uint8Array(totalElements);
    for (let i = 0; i < totalElements; i += 1) {
      uint8Tensor[i] = sampleBytes[i % sampleLen];
    }
    return uint8Tensor.buffer;
  }

  const float32Tensor = new Float32Array(totalElements);
  const inv255 = 1 / 255;
  for (let i = 0; i < totalElements; i += 1) {
    float32Tensor[i] = sampleBytes[i % sampleLen] * inv255;
  }

  return float32Tensor.buffer;
}
