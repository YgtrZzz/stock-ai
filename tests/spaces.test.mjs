import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

/**
 * Ambiente de teste isolado com motor SQLite real em memória (node:sqlite)
 * e simulação de expo-file-system/legacy para validar o Mapa Visual de Espaços.
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

globalThis.__SPACE_TEST_ENV__ = testEnv;
globalThis.__CREATE_SPACE_SQLITE_ADAPTER__ = createSqliteAdapter;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') {
      return {
        url: 'data:text/javascript,export async function openDatabaseAsync() { return globalThis.__CREATE_SPACE_SQLITE_ADAPTER__(); }',
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
          'export const documentDirectory = globalThis.__SPACE_TEST_ENV__.documentDirectory;',
          'export const cacheDirectory = globalThis.__SPACE_TEST_ENV__.cacheDirectory;',
          'export async function getInfoAsync(uri) { return { exists: true, isDirectory: true, uri }; }',
          'export async function makeDirectoryAsync(uri) { globalThis.__SPACE_TEST_ENV__.createdDirs.push(uri); }',
          'export async function moveAsync({ from, to }) { globalThis.__SPACE_TEST_ENV__.movedFiles.push({ from, to }); }',
          'export async function deleteAsync(uri) { globalThis.__SPACE_TEST_ENV__.deletedFiles.push(uri); }',
        ].join('\n'),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const dbModule = await import('../database.js');

describe('Visual Map — Spaces Image Storage & Hierarchy Migration (TDD)', () => {
  beforeEach(() => {
    testEnv.rawSqlite = new DatabaseSync(':memory:');
    testEnv.movedFiles = [];
    testEnv.createdDirs = [];
    testEnv.deletedFiles = [];
    if (typeof dbModule.resetDatabaseConnectionForTests === 'function') {
      dbModule.resetDatabaseConnectionForTests();
    }
  });

  it('migrates pre-existing hierarchical spaces tree to include image_uri without destroying parent-child links or items', async () => {
    // Arrange: Cria árvore hierárquica (Quarto Casal -> Closet -> Gaveta 2) no schema v5 (sem image_uri em spaces)
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
        image_uri TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO spaces (id, name, parent_id, created_at)
        VALUES (1, 'Quarto Casal', NULL, '2026-10-30T10:00:00.000Z');
      INSERT INTO spaces (id, name, parent_id, created_at)
        VALUES (2, 'Closet Principal', 1, '2026-10-30T10:01:00.000Z');
      INSERT INTO spaces (id, name, parent_id, created_at)
        VALUES (3, 'Gaveta 2', 2, '2026-10-30T10:02:00.000Z');
      INSERT INTO items (id, name, space_id, quantity, barcode, image_uri, created_at)
        VALUES (1, 'Relógio de Pulso', 3, 1, NULL, 'file:///app/documents/armario_images/watch.jpg', '2026-10-30T10:03:00.000Z');
      PRAGMA user_version = 5;
    `);

    // Act: Executa initDatabase() e lista os espaços
    await dbModule.initDatabase();
    const spaces = await dbModule.getSpaces();

    // Assert: Todos os 3 níveis da árvore permanecem intactos e expõem image_uri: null
    assert.equal(spaces.length, 3);
    assert.equal(spaces[0].name, 'Quarto Casal');
    assert.equal(spaces[0].parent_id, null);
    assert.equal(spaces[0].image_uri, null);

    assert.equal(spaces[1].name, 'Closet Principal');
    assert.equal(spaces[1].parent_id, 1);
    assert.equal(spaces[1].parent_name, 'Quarto Casal');
    assert.equal(spaces[1].image_uri, null);

    assert.equal(spaces[2].name, 'Gaveta 2');
    assert.equal(spaces[2].parent_id, 2);
    assert.equal(spaces[2].parent_name, 'Closet Principal');
    assert.equal(spaces[2].item_count, 1);
    assert.equal(spaces[2].image_uri, null);
  });

  it('moves captured space photo from temporary cache to FileSystem.documentDirectory when creating a space', async () => {
    // Arrange
    await dbModule.initDatabase();
    const tempSpacePhoto = 'file:///app/cache/Camera/closet-overview.jpg';

    // Act
    const created = await dbModule.addSpace(
      'Armário da Cozinha',
      null,
      tempSpacePhoto
    );
    const spaces = await dbModule.getSpaces();

    // Assert
    assert.equal(testEnv.movedFiles.length, 1);
    assert.equal(testEnv.movedFiles[0].from, tempSpacePhoto);
    assert.ok(
      testEnv.movedFiles[0].to.startsWith(testEnv.documentDirectory),
      `Expected permanent URI in documentDirectory, got ${testEnv.movedFiles[0].to}`
    );
    assert.equal(created.image_uri, testEnv.movedFiles[0].to);
    assert.equal(spaces.length, 1);
    assert.equal(spaces[0].image_uri, testEnv.movedFiles[0].to);
  });

  it('updates an existing space photo and/or name via updateSpaceImage and updateSpace preserving hierarchy', async () => {
    // Arrange: Cria espaço pai e sub-espaço inicialmente sem foto
    await dbModule.initDatabase();
    const garagem = await dbModule.addSpace('Garagem', null, null);
    const estante = await dbModule.addSpace('Estante Metálica', garagem.id, null);
    assert.equal(estante.image_uri, null);

    // Act 1: Atualiza apenas a foto via updateSpaceImage
    assert.equal(
      typeof dbModule.updateSpaceImage,
      'function',
      'updateSpaceImage must be exported from database.js'
    );
    const novaFotoCache = 'file:///app/cache/Camera/metal-shelf.jpg';
    const permanentUri = await dbModule.updateSpaceImage(
      estante.id,
      novaFotoCache
    );

    // Act 2: Edita nome e foto do espaço via updateSpace
    assert.equal(
      typeof dbModule.updateSpace,
      'function',
      'updateSpace must be exported from database.js'
    );
    const updatedSpace = await dbModule.updateSpace(estante.id, {
      name: 'Estante Metálica Norte',
      image_uri: permanentUri,
    });

    // Assert: Foto movida apenas 1 vez (idempotente na segunda chamada) e hierarquia preservada
    assert.equal(testEnv.movedFiles.length, 1);
    assert.ok(permanentUri.startsWith(testEnv.documentDirectory));
    assert.equal(updatedSpace.name, 'Estante Metálica Norte');
    assert.equal(updatedSpace.image_uri, permanentUri);

    const spaces = await dbModule.getSpaces();
    const estanteNoBanco = spaces.find((s) => s.id === estante.id);
    assert.equal(estanteNoBanco.name, 'Estante Metálica Norte');
    assert.equal(estanteNoBanco.parent_id, garagem.id);
    assert.equal(estanteNoBanco.parent_name, 'Garagem');
    assert.equal(estanteNoBanco.image_uri, permanentUri);
  });

  it('deleteSpace safely promotes child sub-spaces, relocates items to parent space without data loss, and deletes orphaned space image', async () => {
    await dbModule.initDatabase();
    assert.equal(
      typeof dbModule.deleteSpace,
      'function',
      'deleteSpace must be exported from database.js'
    );

    const galpaoPrincipal = await dbModule.addSpace('Galpão Principal', null, null);
    const corredorIntermediario = await dbModule.addSpace(
      'Corredor Intermediário',
      galpaoPrincipal.id,
      'file:///app/cache/Camera/corredor.jpg'
    );
    const prateleiraFilha = await dbModule.addSpace(
      'Prateleira 01',
      corredorIntermediario.id,
      null
    );

    const itemNoCorredor = await dbModule.insertItem(
      'Bobina Film Stretch',
      corredorIntermediario.id,
      12,
      '7891110002229',
      null
    );

    const res = await dbModule.deleteSpace(corredorIntermediario.id);
    assert.equal(res.deletedId, corredorIntermediario.id);
    assert.equal(res.promotedChildrenCount, 1);
    assert.equal(res.relocatedItemsCount, 1);

    // O sub-espaço filho não foi destruído pelo CASCADE: foi promovido para Galpão Principal!
    const spacesAfter = await dbModule.getSpaces();
    assert.equal(spacesAfter.length, 2);
    const prateleiraAtualizada = spacesAfter.find((s) => s.id === prateleiraFilha.id);
    assert.equal(prateleiraAtualizada.parent_id, galpaoPrincipal.id);

    // O item do corredor também foi realocado com segurança para Galpão Principal
    const itemAtualizado = await dbModule.getItemByBarcode('7891110002229');
    assert.equal(itemAtualizado.id, itemNoCorredor.id);
    assert.equal(itemAtualizado.space_id, galpaoPrincipal.id);

    // A foto órfã do corredor excluído foi removida do disco
    assert.equal(testEnv.deletedFiles.length, 1);
    assert.equal(testEnv.deletedFiles[0], corredorIntermediario.image_uri);
  });
});
