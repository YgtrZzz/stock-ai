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
 */
const SCHEMA_VERSION = 5;

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
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
          quantity INTEGER DEFAULT 1,
          barcode TEXT,
          image_uri TEXT,
          created_at TEXT NOT NULL
        );
      `);

      // Inspeção não-destrutiva de colunas para bancos criados em versões anteriores
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

      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_spaces_parent ON spaces(parent_id);
        CREATE INDEX IF NOT EXISTS idx_items_space ON items(space_id);
        CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
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
  const limpo = String(name ?? '').trim();
  if (!limpo) {
    throw new Error('O nome não pode ficar vazio.');
  }
  return limpo;
}

/* ==========================================================
   ESPAÇOS (Cômodos e Subcômodos)
   ========================================================== */

/**
 * Cadastra um novo espaço.
 * @param {string} name Nome do espaço (ex: 'Estoque Central', 'Armário 1').
 * @param {number|null} parent_id ID do espaço pai, ou null para um espaço raiz.
 * @returns {Promise<{ id: number, name: string, parent_id: number|null, created_at: string }>}
 */
export async function addSpace(name, parent_id = null) {
  const nome = limparNome(name);
  const parentId = parent_id ?? null;
  const db = await initDatabase();
  const createdAt = new Date().toISOString();

  const result = await db.runAsync(
    'INSERT INTO spaces (name, parent_id, created_at) VALUES (?, ?, ?);',
    [nome, parentId, createdAt]
  );

  return {
    id: result.lastInsertRowId,
    name: nome,
    parent_id: parentId,
    created_at: createdAt,
  };
}

/**
 * Lista todos os espaços com informações de hierarquia e contagem de itens.
 * @returns {Promise<Array<{ id: number, name: string, parent_id: number|null, parent_name: string|null, created_at: string, item_count: number }>>}
 */
export async function getSpaces() {
  const db = await initDatabase();
  return db.getAllAsync(`
    SELECT
      s.id,
      s.name,
      s.parent_id,
      p.name AS parent_name,
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
  const finalImageUri = await persistCapturedImage(image_uri);
  const db = await initDatabase();
  await db.runAsync('UPDATE items SET image_uri = ? WHERE id = ?;', [
    finalImageUri,
    id,
  ]);
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
 * filtrando opcionalmente pelo termo de busca (searchQuery).
 * @param {string} searchQuery Termo de busca opcional para filtrar por nome.
 * @returns {Promise<Array<{ id: number, name: string, space_id: number|null, quantity: number, barcode: string|null, image_uri: string|null, space_name: string|null, created_at: string }>>}
 */
export async function getItems(searchQuery = '') {
  const db = await initDatabase();
  const termo = String(searchQuery ?? '').trim();

  if (termo) {
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
      WHERE items.name LIKE ?
      ORDER BY items.id DESC;
      `,
      [`%${termo}%`]
    );
  }

  return db.getAllAsync(`
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
    ORDER BY items.id DESC;
  `);
}

/**
 * Atualiza a quantidade de um item específico pelo ID.
 * @param {number} id ID do item a ser atualizado.
 * @param {number} newQuantity Nova quantidade (bloqueada para não ficar menor que 0).
 */
export async function updateItemQuantity(id, newQuantity) {
  const parsedQty = parseInt(newQuantity, 10);
  const finalQuantity = Number.isFinite(parsedQty) ? Math.max(0, parsedQty) : 0;

  const db = await initDatabase();
  await db.runAsync('UPDATE items SET quantity = ? WHERE id = ?;', [
    finalQuantity,
    id,
  ]);
}

/**
 * Remove um item específico pelo ID.
 * @param {number} id ID do item a ser removido.
 */
export async function deleteItem(id) {
  const db = await initDatabase();
  await db.runAsync('DELETE FROM items WHERE id = ?;', [id]);
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
export const listarEspacos = getSpaces;

export default {
  getDatabase,
  initDatabase,
  persistCapturedImage,
  addSpace,
  getSpaces,
  insertItem,
  updateItemImage,
  getItemByBarcode,
  getItems,
  updateItemQuantity,
  deleteItem,
  resetDatabaseConnectionForTests,
  inicializarBanco,
  adicionarEspaco,
  listarEspacos,
  inserirItem,
  atualizarImagemItem,
  buscarItemPorCodigo,
  listarItens,
  atualizarQuantidadeItem,
  removerItem,
};
