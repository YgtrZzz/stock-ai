import {
  sanitizeBarcodeInput,
  sanitizeQuantityInput,
  sanitizeTextInput,
} from './securityValidators.js';

export const BACKUP_FILENAME = 'Backup_ArmarioDigital.json';
const MAX_BACKUP_JSON_BYTES = 1024 * 1024; // 1 MB máximo para evitar DoS / OOM
const FORBIDDEN_KEYS_REGEX = /"(__proto__|constructor|prototype)"\s*:/;

/**
 * Calcula uma assinatura determinística de 64 bits (16 caracteres hexadecimais)
 * combinando FNV-1a e DJB2 sobre a serialização canônica dos dados do backup.
 * Compatível 100% com Hermes (React Native) e Node.js sem dependências externas.
 *
 * @param {object} dataPayload
 * @returns {string}
 */
export function computeSnapshotChecksum(dataPayload) {
  const canonical = JSON.stringify(dataPayload);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let i = 0; i < canonical.length; i += 1) {
    const code = canonical.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;

    h2 = (Math.imul(h2, 33) ^ code) >>> 0;
  }

  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * Normaliza e sanitiza os registros antes de assinar ou restaurar o snapshot.
 *
 * @param {{ spaces?: Array<object>, items?: Array<object>, movements?: Array<object> }} raw
 * @returns {{ spaces: Array<object>, items: Array<object>, movements: Array<object> }}
 */
function normalizeSnapshotData(raw = {}) {
  const rawSpaces = Array.isArray(raw.spaces) ? raw.spaces : [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const rawMovements = Array.isArray(raw.movements) ? raw.movements : [];

  const spaceNameById = new Map();
  for (const sp of rawSpaces) {
    if (sp && sp.id !== undefined && sp.id !== null) {
      const cleanName = sanitizeTextInput(sp.name, 50);
      if (cleanName) {
        spaceNameById.set(Number(sp.id), cleanName);
      }
    }
  }

  const spaces = rawSpaces
    .map((sp) => {
      const name = sanitizeTextInput(sp?.name, 50);
      if (!name) return null;
      const parentId =
        sp?.parent_id !== undefined && sp?.parent_id !== null
          ? Number(sp.parent_id)
          : null;
      const parentName =
        sanitizeTextInput(sp?.parentName || sp?.parent_name || '', 50) ||
        (parentId !== null ? spaceNameById.get(parentId) || null : null);

      return {
        name,
        parentName: parentName || null,
      };
    })
    .filter(Boolean);

  const items = rawItems
    .map((it) => {
      const name = sanitizeTextInput(it?.name, 60);
      if (!name) return null;
      const quantity = sanitizeQuantityInput(it?.quantity, 1, 99999);
      const barcode = sanitizeBarcodeInput(it?.barcode) || null;
      const spaceId =
        it?.space_id !== undefined && it?.space_id !== null
          ? Number(it.space_id)
          : null;
      const spaceName =
        sanitizeTextInput(it?.spaceName || it?.space_name || '', 50) ||
        (spaceId !== null ? spaceNameById.get(spaceId) || null : null);

      return {
        name,
        quantity,
        barcode,
        spaceName: spaceName || null,
      };
    })
    .filter(Boolean);

  const movements = rawMovements.slice(0, 200).map((mov) => ({
    item_name: sanitizeTextInput(mov?.item_name || 'Item', 60),
    previous_qty: sanitizeQuantityInput(mov?.previous_qty, 0, 99999),
    new_qty: sanitizeQuantityInput(mov?.new_qty, 0, 99999),
    delta: Number.isFinite(Number(mov?.delta)) ? Math.trunc(Number(mov.delta)) : 0,
    reason: sanitizeTextInput(mov?.reason || 'ajuste_manual', 40),
    created_at: sanitizeTextInput(mov?.created_at || '', 40),
  }));

  return { spaces, items, movements };
}

/**
 * Cria um snapshot JSON assinado com checksum de integridade.
 *
 * @param {{ spaces?: Array<object>, items?: Array<object>, movements?: Array<object> }} payload
 * @returns {string}
 */
export function createSignedBackupSnapshot(payload = {}) {
  const data = normalizeSnapshotData(payload);
  const checksum = computeSnapshotChecksum(data);

  const envelope = {
    app: 'ArmarioDigital',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    checksum,
    counts: {
      spaces: data.spaces.length,
      items: data.items.length,
      movements: data.movements.length,
    },
    data,
  };

  return JSON.stringify(envelope, null, 2);
}

/**
 * Analisa, valida contra Prototype Pollution/DoS e verifica a assinatura de integridade
 * (checksum) de um snapshot JSON antes de restaurar no banco SQLite.
 *
 * @param {unknown} jsonString
 * @returns {{ valid: boolean, reason: string, data?: { spaces: Array<object>, items: Array<object>, movements: Array<object> } }}
 */
export function parseAndVerifyBackupSnapshot(jsonString) {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    return { valid: false, reason: 'empty_payload' };
  }

  if (jsonString.length > MAX_BACKUP_JSON_BYTES) {
    return { valid: false, reason: 'payload_too_large' };
  }

  if (FORBIDDEN_KEYS_REGEX.test(jsonString)) {
    return { valid: false, reason: 'unsafe_payload' };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, reason: 'invalid_json' };
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.app !== 'ArmarioDigital' ||
    typeof parsed.checksum !== 'string' ||
    !parsed.data ||
    typeof parsed.data !== 'object'
  ) {
    return { valid: false, reason: 'invalid_schema' };
  }

  const normalizedData = normalizeSnapshotData(parsed.data);
  const expectedChecksum = computeSnapshotChecksum(normalizedData);

  if (expectedChecksum !== parsed.checksum) {
    return { valid: false, reason: 'checksum_mismatch' };
  }

  return {
    valid: true,
    reason: 'ok',
    data: normalizedData,
  };
}

/**
 * Grava o arquivo `Backup_ArmarioDigital.json` e aciona o compartilhamento nativo resiliente.
 *
 * @param {{ spaces?: Array<object>, items?: Array<object>, movements?: Array<object> }} payload
 * @param {{ FileSystem?: object, Sharing?: object, NativeShare?: object }} [deps]
 * @returns {Promise<{ fileUri: string, jsonContent: string }>}
 */
export async function exportSignedBackupFile(payload = {}, deps = {}) {
  const FileSystem =
    deps.FileSystem || (await import('expo-file-system/legacy'));
  const Sharing = deps.Sharing || (await import('expo-sharing'));

  const jsonContent = createSignedBackupSnapshot(payload);
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  const separator = baseDir && !baseDir.endsWith('/') ? '/' : '';
  const fileUri = `${baseDir}${separator}${BACKUP_FILENAME}`;
  const encoding = FileSystem.EncodingType?.UTF8 ?? 'utf8';

  await FileSystem.writeAsStringAsync(fileUri, jsonContent, { encoding });

  const canShare =
    typeof Sharing.isAvailableAsync === 'function'
      ? await Sharing.isAvailableAsync()
      : true;

  if (canShare && typeof Sharing.shareAsync === 'function') {
    try {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Exportar Backup Seguro (JSON)',
        UTI: 'public.json',
      });
    } catch (error) {
      const msg = String(error?.message || error?.code || '');
      if (msg.includes('ERR_SHARING_IN_PROGRESS')) {
        const NativeShare =
          deps.NativeShare ||
          (await import('react-native')
            .then((m) => m.Share)
            .catch(() => null));
        if (NativeShare && typeof NativeShare.share === 'function') {
          await NativeShare.share({
            title: 'Exportar Backup Seguro (JSON)',
            message: jsonContent,
            url: fileUri,
          });
        }
      } else {
        throw error;
      }
    }
  }

  return { fileUri, jsonContent };
}
