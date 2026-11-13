export const CSV_FILENAME = 'Relatorio_Estoque.csv';

export const CSV_HEADERS = [
  'ID',
  'Código de Barras',
  'Nome do Produto',
  'Quantidade',
  'Espaço',
];

let defaultFileSystemModule = null;
let defaultSharingModule = null;

async function getFileSystemAdapter(override) {
  if (override) return override;
  if (!defaultFileSystemModule) {
    defaultFileSystemModule = await import('expo-file-system/legacy');
  }
  return defaultFileSystemModule;
}

async function getSharingAdapter(override) {
  if (override) return override;
  if (!defaultSharingModule) {
    defaultSharingModule = await import('expo-sharing');
  }
  return defaultSharingModule;
}

/**
 * Escapa uma célula CSV segundo a RFC 4180, tratando vírgulas, aspas duplas e quebras de linha
 * para evitar corrupção estrutural do arquivo Relatorio_Estoque.csv.
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const rawString = String(value);
  const hadLineBreak = /[\r\n]/.test(rawString);
  let normalized = rawString.replace(/\r?\n/g, ' ').trim();

  // Proteção OWASP contra CSV Formula Injection (=, +, -, @ no início da célula)
  if (/^[=+\-@]/.test(normalized)) {
    normalized = `'${normalized}`;
  }

  const needsQuotes =
    hadLineBreak || normalized.includes(',') || normalized.includes('"');

  if (!needsQuotes) {
    return normalized;
  }

  const escapedQuotes = normalized.replace(/"/g, '""');
  return `"${escapedQuotes}"`;
}

/**
 * Cruza o space_id do item com a lista de espaços para obter o nome exato do local.
 */
export function resolveItemSpaceName(item, spaceMap) {
  if (item?.space_id !== null && item?.space_id !== undefined) {
    const matched = spaceMap.get(Number(item.space_id));
    if (matched?.name) {
      return matched.name;
    }
  }

  if (typeof item?.space_name === 'string' && item.space_name.trim().length > 0) {
    return item.space_name.trim();
  }

  return 'Sem local definido';
}

/**
 * Gera a string completa do relatório CSV com os cabeçalhos:
 * ID, Código de Barras, Nome do Produto, Quantidade, Espaço
 */
export function buildInventoryCsvContent(items = [], spaces = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeSpaces = Array.isArray(spaces) ? spaces : [];

  const spaceMap = new Map();
  for (const space of safeSpaces) {
    if (space && space.id !== null && space.id !== undefined) {
      spaceMap.set(Number(space.id), space);
    }
  }

  const headerLine = CSV_HEADERS.map(escapeCsvCell).join(',');
  const rows = [headerLine];

  for (const item of safeItems) {
    if (!item || typeof item !== 'object') continue;

    const idCell = escapeCsvCell(item.id ?? '');
    const barcodeCell = escapeCsvCell(item.barcode ?? '');
    const nameCell = escapeCsvCell(item.name ?? '');
    const quantityValue = Number.isFinite(Number(item.quantity))
      ? Number(item.quantity)
      : 0;
    const quantityCell = escapeCsvCell(quantityValue);
    const spaceCell = escapeCsvCell(resolveItemSpaceName(item, spaceMap));

    rows.push(
      [idCell, barcodeCell, nameCell, quantityCell, spaceCell].join(',')
    );
  }

  return `${rows.join('\n')}\n`;
}

/**
 * Gera o arquivo temporário Relatorio_Estoque.csv via expo-file-system/legacy
 * e abre a gaveta nativa de compartilhamento do sistema operacional via expo-sharing.
 */
export async function generateAndShareInventoryCSV(
  items = [],
  spaces = [],
  adapters = {}
) {
  const FileSystem = await getFileSystemAdapter(adapters.fileSystem);
  const Sharing = await getSharingAdapter(adapters.sharing);

  const csvContent = buildInventoryCsvContent(items, spaces);

  const baseDir =
    FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  if (!baseDir) {
    throw new Error(
      'Diretório temporário (cacheDirectory/documentDirectory) indisponível para salvar o CSV.'
    );
  }

  const normalizedDir = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
  const fileUri = `${normalizedDir}${CSV_FILENAME}`;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType?.UTF8 || 'utf8',
  });

  if (typeof Sharing.isAvailableAsync === 'function') {
    const disponivel = await Sharing.isAvailableAsync();
    if (!disponivel) {
      throw new Error(
        'O compartilhamento nativo não está disponível neste dispositivo.'
      );
    }
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: 'Exportar Relatório de Estoque (CSV)',
    UTI: 'public.comma-separated-values-text',
  });

  return {
    fileUri,
    csvContent,
    rowCount: Array.isArray(items) ? items.length : 0,
  };
}
