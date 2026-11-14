/**
 * Utilitário de Geração de Etiquetas Inteligentes e Código de Barras Vetorial para PMEs.
 * Produz identificadores com checksum, padrões vetoriais SVG e templates HTML prontos
 * para impressoras térmicas (50x30mm) e folhas A4 adesivas padrão (Pimaco/Apli).
 */

/**
 * Escapa caracteres especiais HTML para prevenir injeção XSS em relatórios e impressões.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function sanitizeHtmlPayload(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Gera um código interno padronizado com checksum ponderado (módulo 10) para itens sem código de fábrica.
 * Exemplo: `ARM-000101-4`.
 *
 * @param {number|string} sequenceId
 * @param {string} [prefix='ARM']
 * @returns {string}
 */
export function generateInternalBarcode(sequenceId, prefix = 'ARM') {
  const parsedId = parseInt(sequenceId, 10);
  const safeId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : 1;
  const safePrefix = String(prefix || 'ARM')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  const padded = String(safeId % 1000000).padStart(6, '0');

  // Cálculo de checksum ponderado mod 10 (ponderação 3 e 1)
  let sum = 0;
  for (let i = 0; i < padded.length; i++) {
    const digit = Number(padded[i]);
    sum += i % 2 === 0 ? digit * 3 : digit * 1;
  }
  const checksum = (10 - (sum % 10)) % 10;

  return `${safePrefix}-${padded}-${checksum}`;
}

/**
 * Produz um padrão vetorial determinístico de barras e espaços simulando padrão Code 128 / EAN
 * para renderização em SVG nativo ou exportação HTML sem dependências nativas.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {number} [options.barWidth=2]
 * @param {number} [options.height=44]
 * @returns {{ bars: Array<{ x: number, w: number }>, totalWidth: number, barHeight: number, svgString: string }}
 */
export function generateCode128SvgPattern(text = '', options = {}) {
  const safeStr = String(text || 'ARM-000000');
  const barHeight =
    typeof options?.height === 'number' && options.height > 10
      ? options.height
      : 44;
  const barUnit =
    typeof options?.barWidth === 'number' && options.barWidth > 0
      ? options.barWidth
      : 2;

  const bars = [];
  let currentX = 0;

  // Barra de guarda inicial (Start)
  bars.push({ x: currentX, w: barUnit });
  currentX += barUnit * 2;
  bars.push({ x: currentX, w: barUnit });
  currentX += barUnit * 2;

  // Codificação dos caracteres
  for (let i = 0; i < safeStr.length; i++) {
    const code = safeStr.charCodeAt(i);
    const pattern = [
      ((code % 3) + 1) * barUnit,
      (((code >> 1) % 2) + 1) * barUnit,
      (((code >> 2) % 3) + 1) * barUnit,
    ];
    for (const w of pattern) {
      bars.push({ x: currentX, w });
      currentX += w + ((code + i) % 2 ? barUnit : barUnit * 1.5);
    }
  }

  // Barra de guarda final (Stop)
  bars.push({ x: currentX, w: barUnit });
  currentX += barUnit * 2;
  bars.push({ x: currentX, w: barUnit * 1.5 });
  currentX += barUnit * 1.5;

  const totalWidth = Math.ceil(currentX);

  const rects = bars
    .map(
      (b) =>
        `<rect x="${b.x}" y="0" width="${b.w}" height="${barHeight}" fill="#000000" />`
    )
    .join('');

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${barHeight}" viewBox="0 0 ${totalWidth} ${barHeight}">${rects}</svg>`;

  return { bars, totalWidth, barHeight, svgString };
}

/**
 * Gera documento HTML de alta fidelidade para impressão em impressora térmica 50x30mm.
 *
 * @param {Object} params
 * @param {Object} params.item
 * @param {string} [params.spaceName]
 * @param {string} [params.labelSize='50x30mm']
 * @returns {string}
 */
export function generateThermalLabelHtml({
  item = {},
  spaceName = '',
  labelSize = '50x30mm',
}) {
  const name = sanitizeHtmlPayload(item.name || 'Produto sem nome');
  const barcode = sanitizeHtmlPayload(
    item.barcode || generateInternalBarcode(item.id || 1)
  );
  const location = sanitizeHtmlPayload(spaceName || item.space_name || '');
  const qty = typeof item.quantity === 'number' ? item.quantity : 0;
  const pattern = generateCode128SvgPattern(barcode, { barWidth: 2, height: 42 });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Etiqueta Térmica - ${name}</title>
  <style>
    @page { size: 50mm 30mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { width: 50mm; height: 30mm; padding: 2.5mm; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; color: #000000; overflow: hidden; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; }
    .name { font-size: 8.5pt; font-weight: 800; line-height: 1.1; max-height: 5.5mm; overflow: hidden; flex: 1; }
    .badge { font-size: 6pt; font-weight: 700; background: #f0f0f0; border: 0.2mm solid #cccccc; padding: 0.5mm 1.5mm; border-radius: 1mm; white-space: nowrap; }
    .barcode-slot { text-align: center; margin: 1mm 0; }
    .barcode-slot svg { width: 94%; height: 10mm; display: block; margin: 0 auto; }
    .barcode-num { font-size: 7.5pt; font-weight: 700; letter-spacing: 1.2px; margin-top: 0.5mm; }
    .footer { display: flex; justify-content: space-between; align-items: center; border-top: 0.2mm solid #dddddd; padding-top: 0.6mm; font-size: 6.5pt; font-weight: 600; }
    .brand { color: #888888; font-size: 5.5pt; font-weight: 800; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="name">${name}</div>
    ${location ? `<div class="badge">${location}</div>` : ''}
  </div>
  <div class="barcode-slot">
    ${pattern.svgString}
    <div class="barcode-num">${barcode}</div>
  </div>
  <div class="footer">
    <div>SALDO: ${qty} un.</div>
    <div class="brand">ARMÁRIO DIGITAL</div>
  </div>
</body>
</html>`;
}

/**
 * Gera folha A4 com grade de etiquetas para impressão padrão em papel adesivo (Pimaco/Apli).
 *
 * @param {Object} params
 * @param {Array<Object>} params.items
 * @param {number} [params.copies=1]
 * @returns {string}
 */
export function generateA4LabelSheetHtml({ items = [], copies = 1 }) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeCopies = Math.max(1, Math.min(100, parseInt(copies, 10) || 1));

  const labelList = [];
  for (const item of safeItems) {
    for (let c = 0; c < safeCopies; c++) {
      labelList.push(item);
    }
  }

  const labelHtmls = labelList
    .map((item) => {
      const name = sanitizeHtmlPayload(item.name || 'Produto');
      const barcode = sanitizeHtmlPayload(
        item.barcode || generateInternalBarcode(item.id || 1)
      );
      const location = sanitizeHtmlPayload(item.space_name || '');
      const pattern = generateCode128SvgPattern(barcode, { barWidth: 1.5, height: 32 });

      return `<div class="label-card">
        <div class="label-title-row">
          <div class="item-name">${name}</div>
          ${location ? `<div class="loc-badge">${location}</div>` : ''}
        </div>
        <div class="barcode-wrapper">
          ${pattern.svgString}
          <div class="barcode-label">${barcode}</div>
        </div>
        <div class="card-footer">
          <span>QTD: ${item.quantity ?? 0}</span>
          <span class="sub-brand">ARMÁRIO DIGITAL</span>
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Folha de Etiquetas A4 - Armário Digital</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { width: 190mm; background: #ffffff; color: #000000; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
    .label-card { border: 0.3mm dashed #bbbbbb; border-radius: 2mm; padding: 3mm; display: flex; flex-direction: column; justify-content: space-between; height: 36mm; background: #ffffff; page-break-inside: avoid; }
    .label-title-row { display: flex; justify-content: space-between; gap: 2mm; }
    .item-name { font-size: 8.5pt; font-weight: 700; line-height: 1.1; max-height: 5.5mm; overflow: hidden; }
    .loc-badge { font-size: 6pt; background: #eeeeee; padding: 0.5mm 1.5mm; border-radius: 1mm; }
    .barcode-wrapper { text-align: center; margin: 1mm 0; }
    .barcode-wrapper svg { width: 90%; height: 8mm; display: block; margin: 0 auto; }
    .barcode-label { font-size: 7pt; font-weight: 700; letter-spacing: 1px; margin-top: 0.5mm; }
    .card-footer { display: flex; justify-content: space-between; border-top: 0.2mm solid #eeeeee; padding-top: 0.8mm; font-size: 6.5pt; font-weight: 600; }
    .sub-brand { color: #999999; font-size: 5.5pt; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="grid">
    ${labelHtmls}
  </div>
</body>
</html>`;
}
