import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

/**
 * Estado global do Fake/In-Memory SQLite (usando o motor real node:sqlite)
 * e do Fake FileSystem (simulando expo-file-system/legacy) para testes determinísticos.
 */
const testEnv = {
  rawSqlite: null,
  movedFiles: [],
  createdDirs: [],
  deletedFiles: [],
  documentDirectory: 'file:///app/documents/',
  cacheDirectory: 'file:///app/cache/',
};

function createSqliteAdapter() {
  return {
    async execAsync(sql) {
      testEnv.rawSqlite.exec(sql);
    },
    async runAsync(sql, params = []) {
      const stmt = testEnv.rawSqlite.prepare(sql);
      const res = stmt.run(...params);
      return {
        lastInsertRowId: Number(res.lastInsertRowid),
        changes: Number(res.changes),
      };
    },
    async getFirstAsync(sql, params = []) {
      const stmt = testEnv.rawSqlite.prepare(sql);
      const row = stmt.get(...params);
      return row ? { ...row } : null;
    },
    async getAllAsync(sql, params = []) {
      const stmt = testEnv.rawSqlite.prepare(sql);
      const rows = stmt.all(...params);
      return rows.map((r) => ({ ...r }));
    },
  };
}

globalThis.__TEST_ENV__ = testEnv;
globalThis.__CREATE_SQLITE_ADAPTER__ = createSqliteAdapter;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') {
      return {
        url: 'data:text/javascript,export async function openDatabaseAsync() { return globalThis.__CREATE_SQLITE_ADAPTER__(); }',
        shortCircuit: true,
      };
    }
    if (
      specifier === 'expo-file-system' ||
      specifier === 'expo-file-system/legacy'
    ) {
      return {
        url: [
          'data:text/javascript,',
          'export const documentDirectory = globalThis.__TEST_ENV__.documentDirectory;',
          'export const cacheDirectory = globalThis.__TEST_ENV__.cacheDirectory;',
          'export async function getInfoAsync(uri) { return { exists: true, isDirectory: true, uri }; }',
          'export async function makeDirectoryAsync(uri) { globalThis.__TEST_ENV__.createdDirs.push(uri); }',
          'export async function moveAsync({ from, to }) { globalThis.__TEST_ENV__.movedFiles.push({ from, to }); }',
          'export async function deleteAsync(uri) { globalThis.__TEST_ENV__.deletedFiles.push(uri); }',
        ].join('\n'),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const dbModule = await import('../database.js');

describe('Database & Permanent Image Storage (TDD - Task 1)', () => {
  beforeEach(() => {
    testEnv.rawSqlite = new DatabaseSync(':memory:');
    testEnv.movedFiles = [];
    testEnv.createdDirs = [];
    testEnv.deletedFiles = [];
    if (typeof dbModule.resetDatabaseConnectionForTests === 'function') {
      dbModule.resetDatabaseConnectionForTests();
    }
  });

  it('preserves existing items when migrating from schema v4 (without image_uri) to v5 without DROP TABLE', async () => {
    // Arrange: Simula um banco na versão 4 já populado com espaços e itens reais
    testEnv.rawSqlite.exec(`
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
        quantity INTEGER DEFAULT 1,
        barcode TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO spaces (id, name, parent_id, created_at)
        VALUES (1, 'Estoque Central', NULL, '2026-10-30T10:00:00.000Z');
      INSERT INTO items (id, name, space_id, quantity, barcode, created_at)
        VALUES (1, 'Parafusadeira Industrial', 1, 12, '7891234567890', '2026-10-30T10:05:00.000Z');
      PRAGMA user_version = 4;
    `);

    // Act: Inicializa o banco (que deve migrar para v5 sem destruir os dados)
    await dbModule.initDatabase();
    const items = await dbModule.getItems();

    // Assert: O item anterior deve continuar existindo e ter a coluna image_uri disponível (null)
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'Parafusadeira Industrial');
    assert.equal(items[0].quantity, 12);
    assert.equal(items[0].barcode, '7891234567890');
    assert.equal(items[0].space_name, 'Estoque Central');
    assert.equal(items[0].image_uri, null);
  });

  it('moves temporary camera photo from cache to FileSystem.documentDirectory and persists the permanent URI in Home profile', async () => {
    // Arrange: Cria um cômodo residencial e simula um URI temporário gerado pela CameraView
    await dbModule.initDatabase();
    const quarto = await dbModule.addSpace('Quarto Casal');
    const tempCameraUri =
      'file:///app/cache/Camera/9f8e7d6c-captured-jacket.jpg';

    // Act: Salva o item no perfil 'home' (sem código de barras, com foto capturada)
    const saved = await dbModule.insertItem(
      'Casaco de Inverno',
      quarto.id,
      1,
      null,
      tempCameraUri
    );

    // Assert: O arquivo foi movido do cache para o documentDirectory e o novo URI foi salvo no SQLite
    assert.equal(testEnv.movedFiles.length, 1);
    assert.equal(testEnv.movedFiles[0].from, tempCameraUri);
    assert.ok(
      testEnv.movedFiles[0].to.startsWith(testEnv.documentDirectory),
      `Expected permanent URI to start with ${testEnv.documentDirectory}, got ${testEnv.movedFiles[0].to}`
    );
    assert.equal(saved.image_uri, testEnv.movedFiles[0].to);
    assert.equal(saved.barcode, null);

    const listed = await dbModule.getItems('Casaco');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].image_uri, testEnv.movedFiles[0].to);
    assert.equal(listed[0].space_name, 'Quarto Casal');
  });

  it('persists barcode and permanent avatar URI in Business profile and preserves image_uri across automatic +1 stock increments', async () => {
    // Arrange: Cria espaço B2B e insere SKU com código de barras e foto temporária
    await dbModule.initDatabase();
    const galpao = await dbModule.addSpace('Galpão A');
    const tempSkuPhoto = 'file:///app/cache/Camera/sku-box-m6.jpg';

    // Act: Insere item B2B e simula leitura subsequente do mesmo barcode (+1 no estoque)
    await dbModule.insertItem(
      'Caixa de Parafusos M6',
      galpao.id,
      10,
      '7890001112223',
      tempSkuPhoto
    );

    const foundByBarcode = await dbModule.getItemByBarcode('7890001112223');
    assert.ok(foundByBarcode);
    await dbModule.updateItemQuantity(
      foundByBarcode.id,
      foundByBarcode.quantity + 1
    );

    const updated = await dbModule.getItemByBarcode('7890001112223');

    // Assert: Quantidade subiu para 11 e o URI permanente em documentDirectory permaneceu intacto
    assert.equal(updated.quantity, 11);
    assert.ok(updated.image_uri.startsWith(testEnv.documentDirectory));
  });

  it('updates an existing item image via updateItemImage moving the new photo to FileSystem.documentDirectory', async () => {
    // Arrange: Item cadastrado inicialmente sem foto
    await dbModule.initDatabase();
    const itemSemFoto = await dbModule.insertItem(
      'Furadeira de Impacto',
      null,
      1,
      '7899998887776',
      null
    );
    assert.equal(itemSemFoto.image_uri, null);

    // Act: Anexa uma foto posteriormente via updateItemImage
    assert.equal(
      typeof dbModule.updateItemImage,
      'function',
      'updateItemImage must be exported from database.js'
    );
    const novaFotoCache = 'file:///app/cache/Camera/drill-new.jpg';
    const permanentUri = await dbModule.updateItemImage(
      itemSemFoto.id,
      novaFotoCache
    );

    // Assert: Foto movida para documentDirectory e persistida no registro do item
    assert.ok(permanentUri.startsWith(testEnv.documentDirectory));
    const items = await dbModule.getItems('Furadeira');
    assert.equal(items[0].image_uri, permanentUri);
    assert.equal(items[0].barcode, '7899998887776');
  });

  it('is idempotent when image_uri is already inside FileSystem.documentDirectory', async () => {
    // Arrange: URI já permanente dentro de documentDirectory
    await dbModule.initDatabase();
    const alreadyPermanentUri =
      'file:///app/documents/armario_images/item_existing.jpg';

    // Act: Insere item com URI já em documentDirectory
    const saved = await dbModule.insertItem(
      'Maleta de Ferramentas',
      null,
      1,
      null,
      alreadyPermanentUri
    );

    // Assert: Nenhum moveAsync redundante foi disparado e o URI foi mantido
    assert.equal(testEnv.movedFiles.length, 0);
    assert.equal(saved.image_uri, alreadyPermanentUri);
  });
});
