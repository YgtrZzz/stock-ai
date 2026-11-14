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

  it('deletes the orphaned image file from armario_images/ when deleteItem or updateItemImage replaces it', async () => {
    await dbModule.initDatabase();
    const item = await dbModule.insertItem(
      'Monitor Industrial 24"',
      null,
      4,
      '7891112223334',
      'file:///app/cache/Camera/monitor-old.jpg'
    );
    const firstPermanentUri = item.image_uri;
    assert.ok(firstPermanentUri.startsWith('file:///app/documents/armario_images/'));
    assert.equal(testEnv.deletedFiles.length, 0);

    // Act 1: Substitui a foto do SKU por uma nova captura
    const secondPermanentUri = await dbModule.updateItemImage(
      item.id,
      'file:///app/cache/Camera/monitor-new.jpg'
    );
    assert.notEqual(secondPermanentUri, firstPermanentUri);
    assert.equal(testEnv.deletedFiles.length, 1);
    assert.equal(testEnv.deletedFiles[0], firstPermanentUri);

    // Act 2: Exclui o item do banco e verifica limpeza da segunda foto
    await dbModule.deleteItem(item.id);
    assert.equal(testEnv.deletedFiles.length, 2);
    assert.equal(testEnv.deletedFiles[1], secondPermanentUri);
  });

  it('blocks Path Traversal and refuses to delete files outside armario_images/', async () => {
    await dbModule.initDatabase();
    assert.equal(
      typeof dbModule.deletePersistedImageIfOwned,
      'function',
      'deletePersistedImageIfOwned must be exported'
    );

    const externalUri = 'file:///app/documents/armario.db';
    const traversalUri =
      'file:///app/documents/armario_images/../../secret_config.json';

    const resExternal = await dbModule.deletePersistedImageIfOwned(externalUri);
    const resTraversal = await dbModule.deletePersistedImageIfOwned(traversalUri);

    assert.equal(resExternal, false);
    assert.equal(resTraversal, false);
    assert.equal(testEnv.deletedFiles.length, 0);
  });

  it('searches items by product name, barcode (SKU/EAN), or space_name in getItems(searchQuery)', async () => {
    await dbModule.initDatabase();
    const corredorB = await dbModule.addSpace('Corredor B2B');
    await dbModule.insertItem(
      'Parafusadeira Impacto 20V',
      corredorB.id,
      8,
      '7899988776655',
      null
    );
    await dbModule.insertItem(
      'Chave Inglesa Cromada',
      null,
      3,
      '7890001112223',
      null
    );

    const byBarcode = await dbModule.getItems('7899988');
    assert.equal(byBarcode.length, 1);
    assert.equal(byBarcode[0].name, 'Parafusadeira Impacto 20V');

    const bySpace = await dbModule.getItems('Corredor B2B');
    assert.equal(bySpace.length, 1);
    assert.equal(bySpace[0].barcode, '7899988776655');
  });

  it('bulkUpsertItemsFromCatalog inserts new items, updates existing SKUs by barcode preserving image_uri, and auto-creates missing spaces', async () => {
    await dbModule.initDatabase();
    const galpaoA = await dbModule.addSpace('Galpão A');
    const existing = await dbModule.insertItem(
      'Fonte ATX 500W',
      galpaoA.id,
      2,
      '7895005005001',
      'file:///app/cache/Camera/fonte-atx.jpg'
    );

    assert.equal(
      typeof dbModule.bulkUpsertItemsFromCatalog,
      'function',
      'bulkUpsertItemsFromCatalog must be exported'
    );

    const stats = await dbModule.bulkUpsertItemsFromCatalog([
      {
        barcode: '7895005005001',
        name: 'Fonte ATX 500W Real',
        quantity: 15,
        space_name: 'Galpão A',
      },
      {
        barcode: '7896006006002',
        name: 'Cabo de Rede Cat6 305m',
        quantity: 4,
        space_name: 'Prateleira Telecom',
      },
      {
        barcode: '',
        name: 'Fita Isolante 20m',
        quantity: 25,
        space_name: 'Sem local definido',
      },
    ]);

    assert.equal(stats.updatedCount, 1);
    assert.equal(stats.insertedCount, 2);
    assert.equal(stats.createdSpacesCount, 1);
    assert.equal(stats.totalProcessed, 3);

    const updatedSku = await dbModule.getItemByBarcode('7895005005001');
    assert.equal(updatedSku.name, 'Fonte ATX 500W Real');
    assert.equal(updatedSku.quantity, 15);
    assert.equal(
      updatedSku.image_uri,
      existing.image_uri,
      'must preserve existing image_uri during ERP CSV bulk upsert'
    );

    const newSku = await dbModule.getItemByBarcode('7896006006002');
    assert.equal(newSku.name, 'Cabo de Rede Cat6 305m');
    assert.equal(newSku.quantity, 4);
    assert.equal(newSku.space_name, 'Prateleira Telecom');
  });

  it('records audit log entries in stock_movements on insertItem, updateItemQuantity, and bulkUpsertItemsFromCatalog', async () => {
    await dbModule.initDatabase();

    assert.equal(
      typeof dbModule.getStockMovements,
      'function',
      'getStockMovements must be exported'
    );

    const item = await dbModule.insertItem(
      'Disjuntor Bipolar 32A',
      null,
      10,
      '7897778889990',
      null
    );

    await dbModule.updateItemQuantity(item.id, 14);
    await dbModule.updateItemQuantity(item.id, 11);

    const movements = await dbModule.getStockMovements(10);
    assert.equal(movements.length, 3);

    // Ordem decrescente (mais recente primeiro)
    assert.equal(movements[0].item_name, 'Disjuntor Bipolar 32A');
    assert.equal(movements[0].previous_qty, 14);
    assert.equal(movements[0].new_qty, 11);
    assert.equal(movements[0].delta, -3);
    assert.equal(movements[0].reason, 'baixa_estoque');

    assert.equal(movements[1].previous_qty, 10);
    assert.equal(movements[1].new_qty, 14);
    assert.equal(movements[1].delta, 4);
    assert.equal(movements[1].reason, 'entrada_estoque');

    assert.equal(movements[2].previous_qty, 0);
    assert.equal(movements[2].new_qty, 10);
    assert.equal(movements[2].delta, 10);
    assert.equal(movements[2].reason, 'cadastro_inicial');
  });

  it('updates item name and transfers space_id via updateItemDetails while recording transferencia_local in stock_movements', async () => {
    await dbModule.initDatabase();

    assert.equal(
      typeof dbModule.updateItemDetails,
      'function',
      'updateItemDetails must be exported'
    );

    const setorRecebimento = await dbModule.addSpace('Doca de Recebimento');
    const setorExpedicao = await dbModule.addSpace('Setor de Expedição');

    const item = await dbModule.insertItem(
      'Roteador Wi-Fi 6 Empresarial',
      setorRecebimento.id,
      6,
      '7893216549870',
      'file:///app/cache/Camera/router.jpg'
    );

    const updated = await dbModule.updateItemDetails(item.id, {
      name: 'Roteador Wi-Fi 6 Gigabit Pro',
      space_id: setorExpedicao.id,
    });

    assert.equal(updated.name, 'Roteador Wi-Fi 6 Gigabit Pro');
    assert.equal(updated.space_id, setorExpedicao.id);
    assert.equal(updated.image_uri, item.image_uri);

    const list = await dbModule.getItems('Roteador Wi-Fi 6 Gigabit Pro');
    assert.equal(list.length, 1);
    assert.equal(list[0].space_name, 'Setor de Expedição');

    const movements = await dbModule.getStockMovements(5);
    assert.equal(movements[0].reason, 'transferencia_local');
    assert.equal(movements[0].delta, 0);
    assert.equal(movements[0].previous_qty, 6);
    assert.equal(movements[0].new_qty, 6);

    // Act 2: Atualiza também a fotografia via updateItemDetails e limpa a antiga
    const updatedWithNewPhoto = await dbModule.updateItemDetails(item.id, {
      name: 'Roteador Wi-Fi 6 Gigabit Pro',
      space_id: setorExpedicao.id,
      image_uri: 'file:///app/cache/Camera/router-v2.jpg',
    });

    assert.notEqual(updatedWithNewPhoto.image_uri, item.image_uri);
    assert.ok(
      updatedWithNewPhoto.image_uri.startsWith(
        'file:///app/documents/armario_images/'
      )
    );
    assert.equal(testEnv.deletedFiles.length, 1);
    assert.equal(testEnv.deletedFiles[0], item.image_uri);
  });
});
