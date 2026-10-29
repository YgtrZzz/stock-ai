import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'armario.db';

/**
 * Versão do schema.
 * v1: tabela 'inventory'
 * v2: tabelas 'spaces' e 'items'
 * v3: coluna 'quantity INTEGER DEFAULT 1' na tabela 'items' (padrão B2B)
 */
const SCHEMA_VERSION = 3;

// Mantém uma única instância aberta do banco (padrão Singleton assíncrono)
let dbPromise = null;
let initPromise = null;

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
 * Inicializa o banco 'armario.db'.
 * Inclui DROP TABLE IF EXISTS items para garantir a recriação limpa com a coluna quantity
 * nesta rodada de evolução do schema.
 * @returns {Promise<SQLite.SQLiteDatabase>}
 */
export async function initDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      const db = await getDatabase();
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

      const row = await db.getFirstAsync('PRAGMA user_version;');
      const versaoAtual = row?.user_version ?? 0;

      if (versaoAtual < SCHEMA_VERSION) {
        await db.execAsync(`
          DROP TABLE IF EXISTS items;
          DROP TABLE IF EXISTS spaces;
          DROP TABLE IF EXISTS inventory;

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
            created_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_spaces_parent ON spaces(parent_id);
          CREATE INDEX IF NOT EXISTS idx_items_space ON items(space_id);

          PRAGMA user_version = ${SCHEMA_VERSION};
        `);
      }

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
   ITENS (Com Controle de Quantidade B2B)
   ========================================================== */

/**
 * Insere um novo item vinculado a um espaço e com a respectiva quantidade.
 * @param {string} name Nome do item.
 * @param {number|null} space_id ID do espaço onde o item está guardado.
 * @param {number} quantity Quantidade do item (padrão: 1).
 * @returns {Promise<{ id: number, name: string, space_id: number|null, quantity: number, created_at: string }>}
 */
export async function insertItem(name, space_id = null, quantity = 1) {
  const nome = limparNome(name);
  const spaceId = space_id ?? null;
  const parsedQty = parseInt(quantity, 10);
  const finalQuantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;

  const db = await initDatabase();
  const createdAt = new Date().toISOString();

  const result = await db.runAsync(
    'INSERT INTO items (name, space_id, quantity, created_at) VALUES (?, ?, ?, ?);',
    [nome, spaceId, finalQuantity, createdAt]
  );

  return {
    id: result.lastInsertRowId,
    name: nome,
    space_id: spaceId,
    quantity: finalQuantity,
    created_at: createdAt,
  };
}

/**
 * Lista os itens do inventário com LEFT JOIN na tabela spaces,
 * filtrando opcionalmente pelo termo de busca (searchQuery).
 * @param {string} searchQuery Termo de busca opcional para filtrar por nome.
 * @returns {Promise<Array<{ id: number, name: string, space_id: number|null, quantity: number, space_name: string|null, created_at: string }>>}
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
export const getAllItems = getItems;
export const listarItens = getItems;
export const atualizarQuantidadeItem = updateItemQuantity;
export const removerItem = deleteItem;
export const adicionarEspaco = addSpace;
export const listarEspacos = getSpaces;

export default {
  getDatabase,
  initDatabase,
  addSpace,
  getSpaces,
  insertItem,
  getItems,
  updateItemQuantity,
  deleteItem,
  inicializarBanco,
  adicionarEspaco,
  listarEspacos,
  inserirItem,
  listarItens,
  atualizarQuantidadeItem,
  removerItem,
};
