export const CSV_FILENAME = 'Relatorio_Estoque.csv';
export const MOVEMENTS_CSV_FILENAME = 'Relatorio_Movimentacoes.csv';

export const CSV_HEADERS = [
  'ID',
  'Código de Barras',
  'Nome do Produto',
  'Quantidade',
  'Espaço',
];

export const MOVEMENTS_CSV_HEADERS = [
  'ID',
  'Produto',
  'Código de Barras',
  'Variação',
  'Saldo Anterior',
  'Novo Saldo',
  'Motivo',
  'Data/Hora',
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

async function getFallbackShareAdapter(override) {
  if (override) return override;
  try {
    const rn = await import('react-native');
    return rn?.Share || null;
  } catch {
    return null;
  }
}

async function shareFileWithResilientFallback(
  fileUri,
  csvContent,
  dialogTitle,
  adapters = {}
) {
  const Sharing = await getSharingAdapter(adapters.sharing);

  try {
    if (typeof Sharing?.isAvailableAsync === 'function') {
      const disponivel = await Sharing.isAvailableAsync();
      if (!disponivel) {
        throw new Error(
          'O compartilhamento nativo não está disponível neste dispositivo.'
        );
      }
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle,
      UTI: 'public.comma-separated-values-text',
    });
    return;
  } catch (error) {
    const fallbackShare = await getFallbackShareAdapter(adapters.fallbackShare);
    if (fallbackShare && typeof fallbackShare.share === 'function') {
      await fallbackShare.share({
        title: dialogTitle,
        message: csvContent,
        url: fileUri,
      });
      return;
    }
    throw error;
  }
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

  await shareFileWithResilientFallback(
    fileUri,
    csvContent,
    'Exportar Relatório de Estoque (CSV)',
    adapters
  );

  return {
    fileUri,
    csvContent,
    rowCount: Array.isArray(items) ? items.length : 0,
  };
}

/**
 * Gera a string CSV do histórico de movimentações de estoque (Audit Log B2B).
 */
export function buildMovementsCsvContent(movements = []) {
  const safeMovements = Array.isArray(movements) ? movements : [];
  const headerLine = MOVEMENTS_CSV_HEADERS.map(escapeCsvCell).join(',');
  const rows = [headerLine];

  for (const mov of safeMovements) {
    if (!mov || typeof mov !== 'object') continue;

    const deltaValue = Number.isFinite(Number(mov.delta))
      ? Number(mov.delta)
      : 0;
    const prevValue = Number.isFinite(Number(mov.previous_qty))
      ? Number(mov.previous_qty)
      : 0;
    const nextValue = Number.isFinite(Number(mov.new_qty))
      ? Number(mov.new_qty)
      : 0;

    rows.push(
      [
        escapeCsvCell(mov.id ?? ''),
        escapeCsvCell(mov.item_name ?? ''),
        escapeCsvCell(mov.barcode ?? ''),
        String(deltaValue),
        String(prevValue),
        String(nextValue),
        escapeCsvCell(mov.reason ?? ''),
        escapeCsvCell(mov.created_at ?? ''),
      ].join(',')
    );
  }

  return `${rows.join('\n')}\n`;
}

/**
 * Gera o arquivo Relatorio_Movimentacoes.csv e compartilha via expo-sharing.
 */
export async function generateAndShareMovementsCSV(
  movements = [],
  adapters = {}
) {
  const FileSystem = await getFileSystemAdapter(adapters.fileSystem);
  const Sharing = await getSharingAdapter(adapters.sharing);

  const csvContent = buildMovementsCsvContent(movements);

  const baseDir =
    FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  if (!baseDir) {
    throw new Error(
      'Diretório temporário indisponível para salvar o relatório de movimentações.'
    );
  }

  const normalizedDir = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
  const fileUri = `${normalizedDir}${MOVEMENTS_CSV_FILENAME}`;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType?.UTF8 || 'utf8',
  });

  await shareFileWithResilientFallback(
    fileUri,
    csvContent,
    'Exportar Relatório de Movimentações (CSV)',
    adapters
  );

  return {
    fileUri,
    csvContent,
    rowCount: Array.isArray(movements) ? movements.length : 0,
  };
}
