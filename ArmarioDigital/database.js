import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'armario.db';

/**
 * Versão do schema. Incrementar sempre que a estrutura das tabelas mudar.
 * v1: tabela 'inventory' (sem espaços)
 * v2: tabelas 'spaces' (hierárquica) e 'items' (com space_id)
 */
const SCHEMA_VERSION = 2;

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
 * Recria todas as tabelas do zero (apenas desenvolvimento local).
 * Remove também a tabela antiga 'inventory' da v1.
 */
async function recriarSchema(db) {
  await db.execAsync(`
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS spaces;
    DROP TABLE IF EXISTS inventory;

    CREATE TABLE spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_spaces_parent ON spaces(parent_id);
    CREATE INDEX idx_items_space ON items(space_id);

    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

/**
 * Inicializa o banco 'armario.db'.
 * - Ativa as foreign keys (desligadas por padrão no SQLite, valem por conexão).
 * - Se o schema estiver desatualizado, dropa e recria as tabelas UMA única vez.
 *   Nas aberturas seguintes os dados são preservados.
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
        console.log(`[Database] Migrando schema v${versaoAtual} -> v${SCHEMA_VERSION} (recriando tabelas)`);
        await recriarSchema(db);
      }
      return db;
    })().catch((error) => {
      initPromise = null; // permite nova tentativa
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

  return { id: result.lastInsertRowId, name: nome, parent_id: parentId, created_at: createdAt };
}

/**
 * Lista todos os espaços (lista plana; a hierarquia é dada por parent_id).
 * Inclui a contagem de itens guardados diretamente em cada espaço.
 * @returns {Promise<Array<{ id: number, name: string, parent_id: number|null, created_at: string, item_count: number }>>}
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
   ITENS
   ========================================================== */

/**
 * Insere um novo item vinculado a um espaço.
 * @param {string} name Nome do item.
 * @param {number|null} space_id ID do espaço onde o item está guardado.
 * @returns {Promise<{ id: number, name: string, space_id: number|null, created_at: string }>}
 */
export async function insertItem(name, space_id = null) {
  const nome = limparNome(name);
  const spaceId = space_id ?? null;
  const db = await initDatabase();
  const createdAt = new Date().toISOString();

  const result = await db.runAsync(
    'INSERT INTO items (name, space_id, created_at) VALUES (?, ?, ?);',
    [nome, spaceId, createdAt]
  );

  return { id: result.lastInsertRowId, name: nome, space_id: spaceId, created_at: createdAt };
}

/**
 * Lista todos os itens, do mais recente para o mais antigo,
 * incluindo o nome do espaço onde cada um está guardado.
 * @returns {Promise<Array<{ id: number, name: string, space_id: number|null, space_name: string|null, created_at: string }>>}
 */
export async function getItems() {
  const db = await initDatabase();
  return db.getAllAsync(`
    SELECT i.id, i.name, i.space_id, s.name AS space_name, i.created_at
    FROM items i
    LEFT JOIN spaces s ON s.id = i.space_id
    ORDER BY i.id DESC;
  `);
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
  deleteItem,
  inicializarBanco,
  adicionarEspaco,
  listarEspacos,
  inserirItem,
  listarItens,
  removerItem,
};
