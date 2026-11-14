import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

const DATABASE_NAME = 'armario.db';
const IMAGES_SUBDIR = 'armario_images/';

/**
 * Versão do schema.
 * v1: tabela 'inventory'
 * v2: tabelas 'spaces' e 'items'
 * v3: coluna 'quantity INTEGER DEFAULT 1' na tabela 'items' (padrão B2B)
 * v4: coluna 'barcode TEXT' na tabela 'items' (separação Código de Barras vs Nome + Soma Automática)
 * v5: coluna 'image_uri TEXT' na tabela 'items' com migração não-destrutiva e persistência em FileSystem.documentDirectory
 * v6: coluna 'image_uri TEXT' na tabela 'spaces' (Mapa Visual de Locais) com migração não-destrutiva
 * v7: tabela 'stock_movements' (Audit Log de Entradas, Baixas e Sincronizações CSV B2B)
 */
const SCHEMA_VERSION = 7;

// Mantém uma única instância aberta do banco (padrão Singleton assíncrono)
let dbPromise = null;
let initPromise = null;

/**
 * Reinicia as referências de conexão em memória (exclusivo para isolamento de testes automatizados).
 */
export function resetDatabaseConnectionForTests() {
  dbPromise = null;
  initPromise = null;
}

/**
 * Abre (ou reutiliza) a conexão com o banco de dados 'armario.db'.
 * @returns {Promise<SQLite.SQLiteDatabase>}
 */
export async function getDatabase() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return dbPromise;
}

/**
 * Move uma foto capturada do cache temporário da câmera para o diretório permanente
 * FileSystem.documentDirectory antes de persistir o novo URI no SQLite.
 * Operação idempotente: se o URI já estiver dentro de documentDirectory, retorna-o diretamente.
 *
 * @param {string|null|undefined} sourceUri URI de origem da imagem.
 * @returns {Promise<string|null>} Novo URI permanente em FileSystem.documentDirectory ou null.
 */
export async function persistCapturedImage(sourceUri) {
  const limpo = sourceUri ? String(sourceUri).trim() : '';
  if (!limpo) return null;

  const docDir = FileSystem?.documentDirectory;
  if (!docDir) {
    return limpo;
  }

  // Se já está salvo no documentDirectory, não precisa mover novamente
  if (limpo.startsWith(docDir)) {
    return limpo;
  }

  const baseDir = docDir.endsWith('/')
    ? `${docDir}${IMAGES_SUBDIR}`
    : `${docDir}/${IMAGES_SUBDIR}`;

  // Extrai extensão segura do arquivo original (padrão .jpg)
  const matchExt = limpo.match(/\.(jpg|jpeg|png|webp)$/i);
  const ext = matchExt ? matchExt[0].toLowerCase() : '.jpg';
  const uniqueName = `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const destinationUri = `${baseDir}${uniqueName}`;

  try {
    if (typeof FileSystem.makeDirectoryAsync === 'function') {
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
    }
    if (typeof FileSystem.moveAsync === 'function') {
      await FileSystem.moveAsync({
        from: limpo,
        to: destinationUri,
      });
      return destinationUri;
    }
    return limpo;
  } catch (error) {
    console.warn(
      '[Database] Falha ao mover imagem para documentDirectory, mantendo URI original:',
      error
    );
    return limpo;
  }
}

/**
 * Remove com segurança uma fotografia antiga armazenada em FileSystem.documentDirectory/armario_images/.
 * Bloqueia qualquer tentativa de Path Traversal ('..') ou exclusão fora do diretório gerenciado.
 *
 * @param {string|null|undefined} targetUri URI do arquivo a ser removido.
 * @returns {Promise<boolean>} true se o arquivo pertencia a armario_images/ e foi removido; false caso contrário.
 */
export async function deletePersistedImageIfOwned(targetUri) {
  const limpo = targetUri ? String(targetUri).trim() : '';
  if (!limpo) return false;

  // Proteção estrita contra Path Traversal ou caracteres de escape de diretório
  if (limpo.includes('..') || limpo.includes('\\') || limpo.includes('%2e') || limpo.includes('%2E')) {
    return false;
  }

  const docDir = FileSystem?.documentDirectory;
  if (!docDir) return false;

  const baseDir = docDir.endsWith('/')
    ? `${docDir}${IMAGES_SUBDIR}`
    : `${docDir}/${IMAGES_SUBDIR}`;

  if (!limpo.startsWith(baseDir)) {
    return false;
  }

  const fileNamePart = limpo.slice(baseDir.length);
  if (!fileNamePart || fileNamePart.includes('/') || !/^[A-Za-z0-9._-]+$/.test(fileNamePart)) {
    return false;
  }

  try {
    if (typeof FileSystem.deleteAsync === 'function') {
      await FileSystem.deleteAsync(limpo, { idempotent: true });
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[Database] Aviso ao limpar imagem antiga órfã:', error);
    return false;
  }
}

/**
 * Inicializa o banco 'armario.db' de forma não-destrutiva.
 * Garante a criação das tabelas 'spaces' e 'items' e aplica migrações incrementais
 * via PRAGMA table_info(items) sem apagar registros existentes.
 * @returns {Promise<SQLite.SQLiteDatabase>}
 */
export async function initDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      const db = await getDatabase();
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS spaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          parent_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
          image_uri TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
          quantity INTEGER DEFAULT 1,
          min_quantity INTEGER NOT NULL DEFAULT 3,
          barcode TEXT,
          image_uri TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
          item_name TEXT NOT NULL,
          barcode TEXT,
          delta INTEGER NOT NULL,
          previous_qty INTEGER NOT NULL,
          new_qty INTEGER NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      // Inspeção não-destrutiva de colunas da tabela 'spaces' para preservar a árvore hierárquica
      const colunasSpaces = await db.getAllAsync('PRAGMA table_info(spaces);');
      const nomesColunasSpaces = new Set(colunasSpaces.map((col) => col.name));

      if (!nomesColunasSpaces.has('image_uri')) {
        await db.execAsync('ALTER TABLE spaces ADD COLUMN image_uri TEXT;');
      }

      // Inspeção não-destrutiva de colunas da tabela 'items' para bancos criados em versões anteriores
      const colunasItems = await db.getAllAsync('PRAGMA table_info(items);');
      const nomesColunas = new Set(colunasItems.map((col) => col.name));

      if (!nomesColunas.has('quantity')) {
        await db.execAsync(
          'ALTER TABLE items ADD COLUMN quantity INTEGER DEFAULT 1;'
        );
      }
      if (!nomesColunas.has('barcode')) {
        await db.execAsync('ALTER TABLE items ADD COLUMN barcode TEXT;');
      }
      if (!nomesColunas.has('image_uri')) {
        await db.execAsync('ALTER TABLE items ADD COLUMN image_uri TEXT;');
      }
      if (!nomesColunas.has('min_quantity')) {
        await db.execAsync(
          'ALTER TABLE items ADD COLUMN min_quantity INTEGER NOT NULL DEFAULT 3;'
        );
      }

      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_spaces_parent ON spaces(parent_id);
        CREATE INDEX IF NOT EXISTS idx_items_space ON items(space_id);
        CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
        CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(item_id);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);

      return db;
    })().catch((error) => {
      initPromise = null;
      console.error('[Database] Erro ao inicializar o banco armario.db:', error);
      throw error;
    });
  }
  return initPromise;
}

function limparNome(name) {
  const limpo = String(name ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 160);
  if (!limpo) {
    throw new Error('O nome não pode ficar vazio.');
  }
  return limpo;
}

/**
 * Registra uma movimentação auditável de estoque na tabela stock_movements.
 */
async function recordStockMovement(
  db,
  { item_id, item_name, barcode = null, previous_qty, new_qty, reason }
) {
  const prev = Number.isFinite(Number(previous_qty)) ? Number(previous_qty) : 0;
  const next = Number.isFinite(Number(new_qty)) ? Number(new_qty) : 0;
  const delta = next - prev;
  if (
    delta === 0 &&
    reason !== 'cadastro_inicial' &&
    reason !== 'transferencia_local'
  ) {
    return;
  }

  const finalReason =
    reason || (delta >= 0 ? 'entrada_estoque' : 'baixa_estoque');
  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO stock_movements (item_id, item_name, barcode, delta, previous_qty, new_qty, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      item_id ?? null,
      String(item_name ?? '').trim() || 'Item',
      barcode ?? null,
      delta,
      prev,
      next,
      finalReason,
      createdAt,
    ]
  );
}

/* ==========================================================
   ESPAÇOS (Cômodos e Subcômodos)
   ========================================================== */

/**
 * Cadastra um novo espaço, movendo a foto capturada (se houver) para FileSystem.documentDirectory.
 * @param {string} name Nome do espaço (ex: 'Estoque Central', 'Armário 1').
 * @param {number|null} parent_id ID do espaço pai, ou null para um espaço raiz.
 * @param {string|null} image_uri URI local da fotografia do espaço (opcional).
 * @returns {Promise<{ id: number, name: string, parent_id: number|null, image_uri: string|null, created_at: string }>}
 */
export async function addSpace(name, parent_id = null, image_uri = null) {
  const nome = limparNome(name);
  const parentId = parent_id ?? null;
  const finalImageUri = await persistCapturedImage(image_uri);
  const db = await initDatabase();
  const createdAt = new Date().toISOString();

  const result = await db.runAsync(
    'INSERT INTO spaces (name, parent_id, image_uri, created_at) VALUES (?, ?, ?, ?);',
    [nome, parentId, finalImageUri, createdAt]
  );

  return {
    id: result.lastInsertRowId,
    name: nome,
    parent_id: parentId,
    image_uri: finalImageUri,
    created_at: createdAt,
  };
}

/**
 * Atualiza (ou anexa) a fotografia de um espaço existente no Mapa Visual,
 * movendo o arquivo do cache para FileSystem.documentDirectory.
 * @param {number} id ID do espaço.
 * @param {string|null} image_uri URI da nova fotografia (ou null para limpar).
 * @returns {Promise<string|null>} Novo URI permanente persistido.
 */
export async function updateSpaceImage(id, image_uri = null) {
  const db = await initDatabase();
  const anterior = await db.getFirstAsync(
    'SELECT image_uri FROM spaces WHERE id = ?;',
    [id]
  );
  const finalImageUri = await persistCapturedImage(image_uri);
  await db.runAsync('UPDATE spaces SET image_uri = ? WHERE id = ?;', [
    finalImageUri,
    id,
  ]);
  if (anterior?.image_uri && anterior.image_uri !== finalImageUri) {
    await deletePersistedImageIfOwned(anterior.image_uri);
  }
  return finalImageUri;
}

/**
 * Edita o nome e/ou a fotografia de um espaço existente preservando sua posição na árvore hierárquica.
 * @param {number} id ID do espaço.
 * @param {{ name: string, image_uri?: string|null }} payload Dados atualizados do espaço.
 * @returns {Promise<{ id: number, name: string, image_uri: string|null }>}
 */
export async function updateSpace(id, { name, image_uri = null } = {}) {
  const nome = limparNome(name);
  const db = await initDatabase();
  const anterior = await db.getFirstAsync(
    'SELECT image_uri FROM spaces WHERE id = ?;',
    [id]
  );
  const finalImageUri = await persistCapturedImage(image_uri);

  await db.runAsync(
    'UPDATE spaces SET name = ?, image_uri = ? WHERE id = ?;',
    [nome, finalImageUri, id]
  );

  if (anterior?.image_uri && anterior.image_uri !== finalImageUri) {
    await deletePersistedImageIfOwned(anterior.image_uri);
  }

  return {
    id,
    name: nome,
    image_uri: finalImageUri,
  };
}

/**
 * Exclui com segurança um espaço/setor sem perder dados:
 * 1. Promove sub-espaços filhos para o parent_id do espaço excluído (evitando deleção em cascata).
 * 2. Realoca itens vinculados ao espaço para o parent_id do espaço excluído (ou null) e grava trilha de auditoria.
 * 3. Remove o registro do espaço e limpa a fotografia órfã em armario_images/.
 *
 * @param {number} id ID do espaço a ser excluído.
 * @returns {Promise<{ deletedId: number, promotedChildrenCount: number, relocatedItemsCount: number }>}
 */
export async function deleteSpace(id) {
  const parsedId = parseInt(id, 10);
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    throw new Error('ID de espaço inválido.');
  }

  const db = await initDatabase();
  const anterior = await db.getFirstAsync(
    'SELECT id, name, parent_id, image_uri FROM spaces WHERE id = ?;',
    [parsedId]
  );

  if (!anterior) {
    return {
      deletedId: parsedId,
      promotedChildrenCount: 0,
      relocatedItemsCount: 0,
    };
  }

  const fallbackParentId = anterior.parent_id ?? null;

  // 1. Promove sub-espaços filhos para o nível superior antes do DELETE
  const childrenRes = await db.runAsync(
    'UPDATE spaces SET parent_id = ? WHERE parent_id = ?;',
    [fallbackParentId, parsedId]
  );

  // 2. Realoca itens para o espaço pai (ou null) e grava trilha de transferência no Audit Log
  const affectedItems = await db.getAllAsync(
    'SELECT id, name, barcode, COALESCE(quantity, 1) AS quantity FROM items WHERE space_id = ?;',
    [parsedId]
  );

  const itemsRes = await db.runAsync(
    'UPDATE items SET space_id = ? WHERE space_id = ?;',
    [fallbackParentId, parsedId]
  );

  for (const item of affectedItems) {
    await recordStockMovement(db, {
      item_id: item.id,
      item_name: item.name,
      barcode: item.barcode,
      previous_qty: item.quantity,
      new_qty: item.quantity,
      reason: 'transferencia_local',
    });
  }

  // 3. Exclui o espaço e limpa sua fotografia persistida
  await db.runAsync('DELETE FROM spaces WHERE id = ?;', [parsedId]);
  if (anterior.image_uri) {
    await deletePersistedImageIfOwned(anterior.image_uri);
  }

  return {
    deletedId: parsedId,
    promotedChildrenCount: Number(childrenRes?.changes ?? 0),
    relocatedItemsCount: Number(itemsRes?.changes ?? affectedItems.length),
  };
}

/**
 * Lista todos os espaços com informações de hierarquia, fotografia (image_uri) e contagem de itens.
 * @returns {Promise<Array<{ id: number, name: string, parent_id: number|null, parent_name: string|null, image_uri: string|null, created_at: string, item_count: number }>>}
 */
export async function getSpaces() {
  const db = await initDatabase();
  return db.getAllAsync(`
    SELECT
      s.id,
      s.name,
      s.parent_id,
      p.name AS parent_name,
      s.image_uri,
      s.created_at,
      COUNT(i.id) AS item_count
    FROM spaces s
    LEFT JOIN spaces p ON p.id = s.parent_id
    LEFT JOIN items i ON i.space_id = s.id
    GROUP BY s.id
    ORDER BY s.id ASC;
  `);
}

/* ==========================================================
   ITENS (Com Quantidade B2B, Código de Barras e Foto Permanente)
   ========================================================== */

/**
 * Insere um novo item vinculado a um espaço, movendo a foto capturada para
 * FileSystem.documentDirectory antes de persistir no SQLite.
 * @param {string} name Nome do item.
 * @param {number|null} space_id ID do espaço onde o item está guardado.
 * @param {number} quantity Quantidade do item (padrão: 1).
 * @param {string|null} barcode Código de barras associado ao item (opcional).
 * @param {string|null} image_uri URI local da fotografia capturada (opcional).
 * @returns {Promise<{ id: number, name: string, space_id: number|null, quantity: number, barcode: string|null, image_uri: string|null, created_at: string }>}
 */
export async function insertItem(
  name,
  space_id = null,
  quantity = 1,
  barcode = null,
  image_uri = null
) {
  const nome = limparNome(name);
  const spaceId = space_id ?? null;
  const parsedQty = parseInt(quantity, 10);
  const finalQuantity =
    Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
  const finalBarcode = barcode ? String(barcode).trim() || null : null;
  const finalImageUri = await persistCapturedImage(image_uri);

  const db = await initDatabase();
  const createdAt = new Date().toISOString();

  const result = await db.runAsync(
    'INSERT INTO items (name, space_id, quantity, barcode, image_uri, created_at) VALUES (?, ?, ?, ?, ?, ?);',
    [nome, spaceId, finalQuantity, finalBarcode, finalImageUri, createdAt]
  );

  await recordStockMovement(db, {
    item_id: result.lastInsertRowId,
    item_name: nome,
    barcode: finalBarcode,
    previous_qty: 0,
    new_qty: finalQuantity,
    reason: 'cadastro_inicial',
  });

  return {
    id: result.lastInsertRowId,
    name: nome,
    space_id: spaceId,
    quantity: finalQuantity,
    barcode: finalBarcode,
    image_uri: finalImageUri,
    created_at: createdAt,
  };
}

/**
 * Atualiza (ou anexa) a fotografia de um item existente, movendo o arquivo do cache
 * para FileSystem.documentDirectory antes de gravar no banco.
 * @param {number} id ID do item a ser atualizado.
 * @param {string|null} image_uri URI da nova fotografia (ou null para limpar).
 * @returns {Promise<string|null>} Novo URI permanente persistido.
 */
export async function updateItemImage(id, image_uri = null) {
  const db = await initDatabase();
  const anterior = await db.getFirstAsync(
    'SELECT image_uri FROM items WHERE id = ?;',
    [id]
  );
  const finalImageUri = await persistCapturedImage(image_uri);
  await db.runAsync('UPDATE items SET image_uri = ? WHERE id = ?;', [
    finalImageUri,
    id,
  ]);
  if (anterior?.image_uri && anterior.image_uri !== finalImageUri) {
    await deletePersistedImageIfOwned(anterior.image_uri);
  }
  return finalImageUri;
}

/**
 * Busca um item cadastrado pelo código de barras (barcode).
 * @param {string} barcode Código de barras escaneado.
 * @returns {Promise<{ id: number, name: string, space_id: number|null, quantity: number, barcode: string|null, image_uri: string|null, space_name: string|null, created_at: string } | null>}
 */
export async function getItemByBarcode(barcode) {
  const codigo = String(barcode ?? '').trim();
  if (!codigo) return null;

  const db = await initDatabase();
  const item = await db.getFirstAsync(
    `
    SELECT
      items.id,
      items.name,
      items.space_id,
      COALESCE(items.quantity, 1) AS quantity,
      items.barcode,
      items.image_uri,
      spaces.name AS space_name,
      items.created_at
    FROM items
    LEFT JOIN spaces ON items.space_id = spaces.id
    WHERE items.barcode = ?
    ORDER BY items.id DESC
    LIMIT 1;
    `,
    [codigo]
  );

  return item ?? null;
}

/**
 * Lista os itens do inventário com LEFT JOIN na tabela spaces,
 * filtrando opcionalmente pelo termo de busca (nome do produto, código de barras EAN/SKU ou nome do espaço).
 * @param {string} searchQuery Termo de busca opcional.
 * @returns {Promise<Array<{ id: number, name: string, space_id: number|null, quantity: number, barcode: string|null, image_uri: string|null, space_name: string|null, created_at: string }>>}
 */
export async function getItems(searchQuery = '') {
  const db = await initDatabase();
  const termo = String(searchQuery ?? '').trim();

  if (termo) {
    const padrao = `%${termo}%`;
    return db.getAllAsync(
      `
      SELECT
        items.id,
        items.name,
        items.space_id,
        COALESCE(items.quantity, 1) AS quantity,
        COALESCE(items.min_quantity, 3) AS min_quantity,
        items.barcode,
        items.image_uri,
        spaces.name AS space_name,
        items.created_at
      FROM items
      LEFT JOIN spaces ON items.space_id = spaces.id
      WHERE items.name LIKE ?
         OR COALESCE(items.barcode, '') LIKE ?
         OR COALESCE(spaces.name, '') LIKE ?
      ORDER BY items.id DESC;
      `,
      [padrao, padrao, padrao]
    );
  }

  return db.getAllAsync(`
    SELECT
      items.id,
      items.name,
      items.space_id,
      COALESCE(items.quantity, 1) AS quantity,
      COALESCE(items.min_quantity, 3) AS min_quantity,
      items.barcode,
      items.image_uri,
      spaces.name AS space_name,
      items.created_at
    FROM items
    LEFT JOIN spaces ON items.space_id = spaces.id
    ORDER BY items.id DESC;
  `);
}

/**
 * Lista todos os itens vinculados diretamente a um espaço específico (space_id),
 * ordenados do mais recente para o mais antigo.
 *
 * @param {number|string|null} spaceId ID do espaço/local físico.
 * @returns {Promise<Array<{ id: number, name: string, space_id: number, quantity: number, barcode: string|null, image_uri: string|null, space_name: string|null, created_at: string }>>}
 */
export async function getItemsBySpace(spaceId) {
  const parsedId = parseInt(spaceId, 10);
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    return [];
  }
  const db = await initDatabase();
  return db.getAllAsync(
    `
    SELECT
      items.id,
      items.name,
      items.space_id,
      COALESCE(items.quantity, 1) AS quantity,
      items.barcode,
      items.image_uri,
      spaces.name AS space_name,
      items.created_at
    FROM items
    LEFT JOIN spaces ON items.space_id = spaces.id
    WHERE items.space_id = ?
    ORDER BY items.id DESC;
    `,
    [parsedId]
  );
}

/**
 * Importa/atualiza um lote de mercadorias (Bulk Upsert B2B) a partir de registros de catálogo/CSV.
 * - Se o SKU (barcode) já existir, atualiza nome, quantidade e espaço preservando o image_uri existente.
 * - Se o espaço informado não existir (e não for 'Sem local definido'), cria o espaço automaticamente.
 *
 * @param {Array<{ barcode?: string|null, name?: string, quantity?: number|string, space_name?: string|null }>} entries
 * @returns {Promise<{ insertedCount: number, updatedCount: number, createdSpacesCount: number, totalProcessed: number }>}
 */
export async function bulkUpsertItemsFromCatalog(entries = []) {
  const db = await initDatabase();
  const safeEntries = Array.isArray(entries) ? entries : [];

  const existingSpaces = await getSpaces();
  const spaceMap = new Map();
  for (const sp of existingSpaces) {
    if (sp && sp.name) {
      spaceMap.set(String(sp.name).trim().toLowerCase(), sp.id);
    }
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let createdSpacesCount = 0;
  let totalProcessed = 0;

  for (const raw of safeEntries) {
    const rawName = String(raw?.name ?? '').trim();
    if (!rawName) continue;

    const rawBarcode = String(raw?.barcode ?? '').trim();
    const barcode =
      rawBarcode && rawBarcode !== '-' && rawBarcode.toLowerCase() !== 's/n'
        ? rawBarcode
        : null;

    const parsedQty = parseInt(String(raw?.quantity ?? '1'), 10);
    const quantity = Number.isFinite(parsedQty) ? Math.max(0, parsedQty) : 1;

    const rawSpaceName = String(raw?.space_name ?? '').trim();
    let spaceId = null;

    if (
      rawSpaceName &&
      rawSpaceName !== '-' &&
      rawSpaceName.toLowerCase() !== 'sem local definido'
    ) {
      const key = rawSpaceName.toLowerCase();
      if (spaceMap.has(key)) {
        spaceId = spaceMap.get(key);
      } else {
        const createdSpace = await addSpace(rawSpaceName, null, null);
        spaceId = createdSpace.id;
        spaceMap.set(key, spaceId);
        createdSpacesCount += 1;
      }
    }

    if (barcode) {
      const existingItem = await getItemByBarcode(barcode);
      if (existingItem) {
        const previousQty = Number(existingItem.quantity ?? 0);
        await db.runAsync(
          'UPDATE items SET name = ?, quantity = ?, space_id = ? WHERE id = ?;',
          [rawName, quantity, spaceId, existingItem.id]
        );
        if (quantity !== previousQty) {
          await recordStockMovement(db, {
            item_id: existingItem.id,
            item_name: rawName,
            barcode,
            previous_qty: previousQty,
            new_qty: quantity,
            reason: 'sincronizacao_csv',
          });
        }
        updatedCount += 1;
        totalProcessed += 1;
        continue;
      }
    }

    await insertItem(rawName, spaceId, quantity, barcode, null);
    insertedCount += 1;
    totalProcessed += 1;
  }

  return {
    insertedCount,
    updatedCount,
    createdSpacesCount,
    totalProcessed,
  };
}

/**
 * Atualiza a quantidade de um item específico pelo ID e grava registro no Audit Log (stock_movements).
 * @param {number} id ID do item a ser atualizado.
 * @param {number} newQuantity Nova quantidade (bloqueada para não ficar menor que 0).
 * @param {string|null} [reason] Motivo opcional ('entrada_estoque' | 'baixa_estoque' | 'sincronizacao_csv').
 */
export async function updateItemQuantity(id, newQuantity, reason = null) {
  const parsedQty = parseInt(newQuantity, 10);
  const finalQuantity = Number.isFinite(parsedQty) ? Math.max(0, parsedQty) : 0;

  const db = await initDatabase();
  const anterior = await db.getFirstAsync(
    'SELECT id, name, barcode, COALESCE(quantity, 1) AS quantity FROM items WHERE id = ?;',
    [id]
  );

  await db.runAsync('UPDATE items SET quantity = ? WHERE id = ?;', [
    finalQuantity,
    id,
  ]);

  if (anterior) {
    await recordStockMovement(db, {
      item_id: anterior.id,
      item_name: anterior.name,
      barcode: anterior.barcode,
      previous_qty: anterior.quantity,
      new_qty: finalQuantity,
      reason,
    });
  }
}

/**
 * Edita o nome, código de barras e/ou transfere a localização (space_id) de um item existente,
 * registrando 'transferencia_local' no Audit Log quando o espaço for alterado.
 *
 * @param {number} id ID do item a ser atualizado.
 * @param {{ name: string, space_id?: number|null, barcode?: string|null }} payload
 * @returns {Promise<{ id: number, name: string, space_id: number|null, quantity: number, barcode: string|null, image_uri: string|null }>}
 */
export async function updateItemDetails(
  id,
  { name, space_id, barcode, image_uri, min_quantity } = {}
) {
  const nome = limparNome(name);
  const db = await initDatabase();

  const anterior = await db.getFirstAsync(
    'SELECT id, name, space_id, COALESCE(quantity, 1) AS quantity, COALESCE(min_quantity, 3) AS min_quantity, barcode, image_uri FROM items WHERE id = ?;',
    [id]
  );

  if (!anterior) {
    throw new Error('Item não encontrado.');
  }

  const nextSpaceId =
    space_id === undefined ? anterior.space_id : (space_id ?? null);
  const nextBarcode =
    barcode === undefined
      ? anterior.barcode
      : String(barcode ?? '').trim() || null;

  const parsedMin = parseInt(min_quantity, 10);
  const nextMinQuantity =
    min_quantity === undefined
      ? Number(anterior.min_quantity ?? 3)
      : Number.isFinite(parsedMin)
        ? Math.max(0, Math.min(99999, parsedMin))
        : 3;

  const nextImageUri =
    image_uri === undefined
      ? anterior.image_uri
      : await persistCapturedImage(image_uri);

  await db.runAsync(
    'UPDATE items SET name = ?, space_id = ?, barcode = ?, image_uri = ?, min_quantity = ? WHERE id = ?;',
    [nome, nextSpaceId, nextBarcode, nextImageUri, nextMinQuantity, id]
  );

  if (
    image_uri !== undefined &&
    anterior.image_uri &&
    anterior.image_uri !== nextImageUri
  ) {
    await deletePersistedImageIfOwned(anterior.image_uri);
  }

  if (nextSpaceId !== anterior.space_id) {
    await recordStockMovement(db, {
      item_id: anterior.id,
      item_name: nome,
      barcode: nextBarcode,
      previous_qty: anterior.quantity,
      new_qty: anterior.quantity,
      reason: 'transferencia_local',
    });
  }

  return {
    id: anterior.id,
    name: nome,
    space_id: nextSpaceId,
    quantity: anterior.quantity,
    barcode: nextBarcode,
    image_uri: nextImageUri,
  };
}

/**
 * Retorna o histórico recente de movimentações de estoque (Audit Log B2B),
 * ordenado da movimentação mais recente para a mais antiga.
 *
 * @param {number} [limit=40] Quantidade máxima de registros retornados.
 * @returns {Promise<Array<{ id: number, item_id: number|null, item_name: string, barcode: string|null, delta: number, previous_qty: number, new_qty: number, reason: string, created_at: string }>>}
 */
export async function getStockMovements(limit = 40) {
  const parsedLimit = parseInt(limit, 10);
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(200, parsedLimit)
      : 40;

  const db = await initDatabase();
  return db.getAllAsync(
    `SELECT id, item_id, item_name, barcode, delta, previous_qty, new_qty, reason, created_at
     FROM stock_movements
     ORDER BY id DESC
     LIMIT ?;`,
    [safeLimit]
  );
}

/**
 * Restaura um snapshot JSON assinado de espaços hierárquicos e itens de forma segura
 * (sem DROP TABLE), preservando registros existentes e gravando auditoria.
 *
 * @param {{ spaces?: Array<{ name: string, parentName?: string|null }>, items?: Array<{ name: string, quantity: number, barcode?: string|null, spaceName?: string|null }> }} snapshotData
 * @returns {Promise<{ restoredSpaces: number, restoredItems: number }>}
 */
export async function restoreDatabaseSnapshot(snapshotData = {}) {
  const db = await initDatabase();
  const safeSpaces = Array.isArray(snapshotData?.spaces)
    ? snapshotData.spaces
    : [];
  const safeItems = Array.isArray(snapshotData?.items)
    ? snapshotData.items
    : [];

  const existingSpaces = await getSpaces();
  const spaceIdByName = new Map();
  for (const sp of existingSpaces) {
    if (sp?.name) {
      spaceIdByName.set(String(sp.name).trim().toLowerCase(), sp.id);
    }
  }

  let restoredSpaces = 0;

  // 1ª passagem: garante todos os espaços raiz (sem parentName)
  for (const sp of safeSpaces) {
    const cleanName = String(sp?.name ?? '').trim();
    if (!cleanName || sp?.parentName) continue;
    const key = cleanName.toLowerCase();
    if (!spaceIdByName.has(key)) {
      const created = await addSpace(cleanName, null, null);
      spaceIdByName.set(key, created.id);
      restoredSpaces += 1;
    }
  }

  // 2ª passagem: garante sub-espaços (com parentName)
  for (const sp of safeSpaces) {
    const cleanName = String(sp?.name ?? '').trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (spaceIdByName.has(key)) continue;

    const parentKey = sp?.parentName
      ? String(sp.parentName).trim().toLowerCase()
      : null;
    let parentId = parentKey ? spaceIdByName.get(parentKey) ?? null : null;
    if (parentKey && parentId === null) {
      const createdParent = await addSpace(String(sp.parentName).trim(), null, null);
      parentId = createdParent.id;
      spaceIdByName.set(parentKey, parentId);
      restoredSpaces += 1;
    }

    const createdSub = await addSpace(cleanName, parentId, null);
    spaceIdByName.set(key, createdSub.id);
    restoredSpaces += 1;
  }

  const catalogEntries = safeItems.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    barcode: it.barcode || null,
    space_name: it.spaceName || '',
  }));

  const upsertStats = await bulkUpsertItemsFromCatalog(catalogEntries);

  return {
    restoredSpaces: restoredSpaces + upsertStats.createdSpacesCount,
    restoredItems: upsertStats.totalProcessed,
    insertedCount: upsertStats.insertedCount,
    updatedCount: upsertStats.updatedCount,
  };
}

/**
 * Remove um item específico pelo ID.
 * @param {number} id ID do item a ser removido.
 */
export async function deleteItem(id) {
  const db = await initDatabase();
  const anterior = await db.getFirstAsync(
    'SELECT image_uri FROM items WHERE id = ?;',
    [id]
  );
  await db.runAsync('DELETE FROM items WHERE id = ?;', [id]);
  if (anterior?.image_uri) {
    await deletePersistedImageIfOwned(anterior.image_uri);
  }
}

// Aliases em inglês e português para facilitar importação
export const initDB = initDatabase;
export const inicializarBanco = initDatabase;
export const addItem = insertItem;
export const inserirItem = insertItem;
export const atualizarImagemItem = updateItemImage;
export const buscarItemPorCodigo = getItemByBarcode;
export const getAllItems = getItems;
export const listarItens = getItems;
export const atualizarQuantidadeItem = updateItemQuantity;
export const removerItem = deleteItem;
export const adicionarEspaco = addSpace;
export const atualizarImagemEspaco = updateSpaceImage;
export const atualizarEspaco = updateSpace;
export const listarEspacos = getSpaces;

export default {
  getDatabase,
  initDatabase,
  persistCapturedImage,
  addSpace,
  updateSpaceImage,
  updateSpace,
  deleteSpace,
  getSpaces,
  insertItem,
  updateItemImage,
  getItemByBarcode,
  getItems,
  getItemsBySpace,
  bulkUpsertItemsFromCatalog,
  restoreDatabaseSnapshot,
  updateItemQuantity,
  updateItemDetails,
  getStockMovements,
  deleteItem,
  deletePersistedImageIfOwned,
  resetDatabaseConnectionForTests,
  inicializarBanco,
  adicionarEspaco,
  atualizarImagemEspaco,
  atualizarEspaco,
  listarEspacos,
  inserirItem,
  atualizarImagemItem,
  buscarItemPorCodigo,
  listarItens,
  atualizarQuantidadeItem,
  removerItem,
};
