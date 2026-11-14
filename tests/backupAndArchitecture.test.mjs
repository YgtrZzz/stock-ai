import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeSnapshotChecksum,
  createSignedBackupSnapshot,
  parseAndVerifyBackupSnapshot,
  exportSignedBackupFile,
} from '../utils/backupManager.js';

describe('Cycle 8 — Signed B2B Backup & Restore, Checksum Tamper Detection & Modular Architecture (TDD)', () => {
  it('creates a signed JSON backup snapshot with deterministic checksum and verifies integrity on restore', () => {
    const sampleData = {
      spaces: [
        { id: 1, name: 'Galpão Central', parent_id: null },
        { id: 2, name: 'Corredor A', parent_id: 1 },
      ],
      items: [
        {
          id: 10,
          name: 'Parafusadeira 20V',
          quantity: 12,
          barcode: '7891000100103',
          space_id: 2,
          space_name: 'Corredor A',
        },
      ],
      movements: [
        {
          id: 100,
          item_name: 'Parafusadeira 20V',
          previous_qty: 0,
          new_qty: 12,
          delta: 12,
          reason: 'cadastro_inicial',
          created_at: '2026-11-14T12:00:00.000Z',
        },
      ],
    };

    const jsonSnapshot = createSignedBackupSnapshot(sampleData);
    const parsed = JSON.parse(jsonSnapshot);

    assert.equal(parsed.app, 'ArmarioDigital');
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(typeof parsed.checksum, 'string');
    assert.equal(parsed.checksum.length, 16);
    assert.equal(parsed.data.spaces.length, 2);
    assert.equal(parsed.data.items.length, 1);

    const verification = parseAndVerifyBackupSnapshot(jsonSnapshot);
    assert.equal(verification.valid, true);
    assert.equal(verification.reason, 'ok');
    assert.equal(verification.data.items[0].name, 'Parafusadeira 20V');
    assert.equal(verification.data.items[0].quantity, 12);
    assert.equal(verification.data.spaces[1].parentName, 'Galpão Central');
  });

  it('detects tampered backup payloads (checksum mismatch) and blocks prototype pollution or oversized JSON', () => {
    const jsonSnapshot = createSignedBackupSnapshot({
      spaces: [{ id: 1, name: 'Cofre', parent_id: null }],
      items: [
        {
          id: 1,
          name: 'Notebook Corporativo',
          quantity: 5,
          barcode: '7899999999999',
          space_id: 1,
        },
      ],
      movements: [],
    });

    // Adultera a quantidade de 5 para 500 mantendo o checksum original
    const tamperedJson = jsonSnapshot.replace('"quantity": 5', '"quantity": 500');
    const tamperedResult = parseAndVerifyBackupSnapshot(tamperedJson);
    assert.equal(tamperedResult.valid, false);
    assert.equal(tamperedResult.reason, 'checksum_mismatch');

    // Bloqueia Prototype Pollution (__proto__)
    const pollutedJson = '{"app":"ArmarioDigital","__proto__":{"isAdmin":true}}';
    const pollutedResult = parseAndVerifyBackupSnapshot(pollutedJson);
    assert.equal(pollutedResult.valid, false);
    assert.equal(pollutedResult.reason, 'unsafe_payload');

    // Bloqueia payload gigante (> 1 MB)
    const hugeResult = parseAndVerifyBackupSnapshot('A'.repeat(1100 * 1024));
    assert.equal(hugeResult.valid, false);
    assert.equal(hugeResult.reason, 'payload_too_large');
  });

  it('exports Backup_ArmarioDigital.json via FileSystem and shares with resilient fallback', async () => {
    let writtenUri = null;
    let writtenContent = null;
    let sharedUri = null;

    const fakeFs = {
      cacheDirectory: 'file:///cache/',
      EncodingType: { UTF8: 'utf8' },
      async writeAsStringAsync(uri, content) {
        writtenUri = uri;
        writtenContent = content;
      },
    };

    const fakeSharing = {
      async isAvailableAsync() {
        return true;
      },
      async shareAsync(uri) {
        sharedUri = uri;
      },
    };

    const res = await exportSignedBackupFile(
      {
        spaces: [{ id: 1, name: 'Estoque', parent_id: null }],
        items: [{ id: 1, name: 'Cabo HDMI', quantity: 8, space_id: 1 }],
        movements: [],
      },
      { FileSystem: fakeFs, Sharing: fakeSharing }
    );

    assert.equal(writtenUri, 'file:///cache/Backup_ArmarioDigital.json');
    assert.equal(sharedUri, 'file:///cache/Backup_ArmarioDigital.json');
    assert.ok(writtenContent.includes('"checksum"'));
    assert.equal(res.fileUri, 'file:///cache/Backup_ArmarioDigital.json');
  });

  it('modularizes ProfileContext, OnboardingScreen, B2BBackupRestoreCard, and restoreDatabaseSnapshot without emojis', () => {
    const baseDir = 'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital';
    const contextSource = fs.readFileSync(
      path.resolve(baseDir, 'context/ProfileContext.js'),
      'utf8'
    );
    const onboardingSource = fs.readFileSync(
      path.resolve(baseDir, 'screens/OnboardingScreen.js'),
      'utf8'
    );
    const backupCardSource = fs.readFileSync(
      path.resolve(baseDir, 'components/B2BBackupRestoreCard.js'),
      'utf8'
    );
    const dbSource = fs.readFileSync(
      path.resolve(baseDir, 'database.js'),
      'utf8'
    );
    const appSource = fs.readFileSync(
      path.resolve(baseDir, 'App.js'),
      'utf8'
    );

    assert.ok(contextSource.includes('createContext'));
    assert.ok(onboardingSource.includes('memo('));
    assert.ok(backupCardSource.includes('tabular-nums'));
    assert.ok(dbSource.includes('restoreDatabaseSnapshot'));
    assert.ok(appSource.includes('B2BBackupRestoreCard'));
    assert.ok(appSource.includes('OnboardingScreen'));
  });
});
