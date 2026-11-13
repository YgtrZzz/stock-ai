const MAX_CSV_CHARS = 512 * 1024; // Limite de segurança de 512 KB por lote (prevenção de DoS em memória)
const MAX_CSV_ROWS = 2000;

/**
 * Sanitiza um campo importado de planilha CSV:
 * - Remove bytes nulos e caracteres de controle invisíveis.
 * - Remove prefixos de injeção de fórmulas OWASP ('=', '+', '-', '@', ou "'=" adicionado na exportação).
 *
 * @param {string} rawValue
 * @returns {string}
 */
export function sanitizeImportedCell(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return '';
  }

  let cleaned = String(rawValue)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();

  // Remove apóstrofo de blindagem OWASP seguido ou não de operador de fórmula
  if (/^'[=+\-@]/.test(cleaned)) {
    cleaned = cleaned.slice(1).trim();
  }

  // Neutraliza operadores de fórmula no início de células textuais
  while (/^[=+\-@]/.test(cleaned)) {
    cleaned = cleaned.slice(1).trim();
  }

  return cleaned;
}

/**
 * Divide uma linha CSV respeitando aspas duplas RFC 4180 ("a, b", "c ""d""").
 *
 * @param {string} line
 * @param {string} delimiter ',' ou ';'
 * @returns {string[]}
 */
export function splitCsvLine(line, delimiter = ',') {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells;
}

/**
 * Detecta o delimitador predominante (',' ou ';') na primeira linha útil.
 *
 * @param {string} headerLine
 * @returns {',' | ';'}
 */
function detectDelimiter(headerLine) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

/**
 * Converte o conteúdo textual de um CSV B2B (5 colunas com ID ou 4 colunas de ERP)
 * em uma lista validada de objetos `{ barcode, name, quantity, space_name }`.
 *
 * @param {string} csvContent
 * @returns {Array<{ barcode: string, name: string, quantity: number, space_name: string }>}
 */
export function parseInventoryCsvContent(csvContent) {
  const rawText = String(csvContent ?? '')
    .replace(/^\uFEFF/, '')
    .slice(0, MAX_CSV_CHARS)
    .trim();

  if (!rawText) {
    return [];
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_CSV_ROWS + 1);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = detectDelimiter(lines[0]);
  const firstRowCells = splitCsvLine(lines[0], delimiter).map((c) =>
    c.trim().toLowerCase()
  );

  // Verifica se a primeira linha é cabeçalho
  const isHeader =
    firstRowCells.some(
      (c) =>
        c === 'id' ||
        c.includes('código') ||
        c.includes('codigo') ||
        c.includes('barcode') ||
        c.includes('produto') ||
        c.includes('nome')
    );

  // Se o cabeçalho começa com 'id', usa layout de 5 colunas: [ID, Barcode, Nome, Quantidade, Espaço]
  // Caso contrário, se tiver 4 colunas: [Barcode, Nome, Quantidade, Espaço]
  const hasLeadingIdColumn =
    isHeader && firstRowCells[0] === 'id' && firstRowCells.length >= 5;

  const dataLines = isHeader ? lines.slice(1) : lines;
  const parsedEntries = [];

  for (const line of dataLines) {
    const rawCells = splitCsvLine(line, delimiter);
    if (rawCells.length < 2) continue;

    let rawBarcode = '';
    let rawName = '';
    let rawQty = '1';
    let rawSpace = '';

    if (hasLeadingIdColumn || rawCells.length >= 5) {
      [, rawBarcode = '', rawName = '', rawQty = '1', rawSpace = ''] = rawCells;
    } else if (rawCells.length === 4) {
      [rawBarcode = '', rawName = '', rawQty = '1', rawSpace = ''] = rawCells;
    } else if (rawCells.length === 3) {
      [rawBarcode = '', rawName = '', rawQty = '1'] = rawCells;
    } else {
      [rawName = '', rawQty = '1'] = rawCells;
    }

    const name = sanitizeImportedCell(rawName);
    if (!name) continue;

    const barcode = sanitizeImportedCell(rawBarcode);
    const space_name = sanitizeImportedCell(rawSpace) || 'Sem local definido';
    const parsedInt = parseInt(String(rawQty).replace(/[^0-9-]/g, ''), 10);
    const quantity = Number.isFinite(parsedInt) ? Math.max(0, parsedInt) : 1;

    parsedEntries.push({
      barcode,
      name,
      quantity,
      space_name,
    });
  }

  return parsedEntries;
}

/**
 * Orquestra a importação em lote a partir de um texto CSV utilizando a função transacional do banco.
 *
 * @param {string} csvContent
 * @param {(entries: Array) => Promise<{ insertedCount: number, updatedCount: number, createdSpacesCount: number, totalProcessed: number }>} bulkUpsertFn
 */
export async function importInventoryFromCsvText(csvContent, bulkUpsertFn) {
  if (typeof bulkUpsertFn !== 'function') {
    throw new Error('Função bulkUpsertFn é obrigatória para importar o lote CSV.');
  }

  const entries = parseInventoryCsvContent(csvContent);
  if (entries.length === 0) {
    return {
      insertedCount: 0,
      updatedCount: 0,
      createdSpacesCount: 0,
      totalProcessed: 0,
    };
  }

  return bulkUpsertFn(entries);
}

export default {
  sanitizeImportedCell,
  splitCsvLine,
  parseInventoryCsvContent,
  importInventoryFromCsvText,
};
