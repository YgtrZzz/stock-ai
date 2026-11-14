/**
 * Camada de Cibersegurança e Sanitização de Entrada (OWASP Mobile M4 / M7 / M8)
 * - Protege contra injeção de caracteres de controle, XSS/SQL payloads em códigos de barras,
 *   overflow de inteiros em quantidades e exaustão de memória (DoS) em importações CSV.
 */

const BARCODE_SAFE_REGEX = /^[A-Za-z0-9._:/-]+$/;
const MAX_BARCODE_LENGTH = 64;
const MAX_QUANTITY_LIMIT = 99999;
const DEFAULT_MAX_CSV_BYTES = 512 * 1024; // 512 KB
const DEFAULT_MAX_CSV_LINES = 2500;
const MAX_IMAGE_URI_LENGTH = 512;
const ALLOWED_LOCAL_URI_PREFIXES = [
  'file://',
  'content://',
  'ph://',
  'assets-library://',
  '/',
];

/**
 * Valida e sanitiza URIs de imagem locais (câmera/sistema de arquivos),
 * bloqueando esquemas remotos (http/https SSRF/tracking), javascript:, data: e Path Traversal (..).
 *
 * @param {unknown} rawUri
 * @returns {string|null}
 */
export function sanitizeImageUriInput(rawUri) {
  if (typeof rawUri !== 'string') return null;

  const trimmed = rawUri.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_URI_LENGTH) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('ftp://') ||
    trimmed.includes('..') ||
    trimmed.includes('\\')
  ) {
    return null;
  }

  const hasAllowedPrefix = ALLOWED_LOCAL_URI_PREFIXES.some((prefix) =>
    lower.startsWith(prefix)
  );
  if (!hasAllowedPrefix) return null;

  return trimmed;
}

/**
 * Sanitiza e valida um código de barras (EAN-13, EAN-8, UPC, Code-128, QR Code de SKU).
 * Retorna string vazia ('') caso o payload contenha caracteres suspeitos ou exceda o limite.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeBarcodeInput(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return '';
  }

  const cleaned = String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();

  if (
    !cleaned ||
    cleaned.length > MAX_BARCODE_LENGTH ||
    !BARCODE_SAFE_REGEX.test(cleaned)
  ) {
    return '';
  }

  return cleaned;
}

/**
 * Remove bytes nulos, caracteres de controle invisíveis e colapsa espaços excessivos,
 * aplicando limite máximo de comprimento.
 *
 * @param {unknown} raw
 * @param {number} [maxLength=60]
 * @returns {string}
 */
export function sanitizeTextInput(raw, maxLength = 60) {
  if (typeof raw !== 'string') {
    return '';
  }

  const limit =
    Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 60;

  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/**
 * Converte e limita quantidades de estoque ao intervalo seguro [0, maxQty].
 *
 * @param {unknown} raw
 * @param {number} [defaultQty=1]
 * @param {number} [maxQty=99999]
 * @returns {number}
 */
export function sanitizeQuantityInput(
  raw,
  defaultQty = 1,
  maxQty = MAX_QUANTITY_LIMIT
) {
  if (raw === '' || raw === null || raw === undefined) {
    return defaultQty;
  }

  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed)) {
    return defaultQty;
  }

  if (parsed < 0) return 0;
  if (parsed > maxQty) return maxQty;
  return parsed;
}

/**
 * Valida o tamanho e o número de linhas de um texto CSV antes do parse em memória,
 * prevenindo ataques de negação de serviço (DoS / Out-Of-Memory).
 *
 * @param {unknown} csvText
 * @param {number} [maxBytes=524288]
 * @param {number} [maxLines=2500]
 * @returns {{ valid: boolean, reason: string, byteLength: number, lineCount: number }}
 */
export function validateCsvPayloadSize(
  csvText,
  maxBytes = DEFAULT_MAX_CSV_BYTES,
  maxLines = DEFAULT_MAX_CSV_LINES
) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    return {
      valid: false,
      reason: 'empty_payload',
      byteLength: 0,
      lineCount: 0,
    };
  }

  const byteLength = csvText.length;
  if (byteLength > maxBytes) {
    return {
      valid: false,
      reason: 'payload_too_large',
      byteLength,
      lineCount: 0,
    };
  }

  const lineCount = csvText.split(/\r?\n/).length;
  if (lineCount > maxLines) {
    return {
      valid: false,
      reason: 'too_many_lines',
      byteLength,
      lineCount,
    };
  }

  return {
    valid: true,
    reason: 'ok',
    byteLength,
    lineCount,
  };
}
