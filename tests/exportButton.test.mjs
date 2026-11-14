import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeCsvCell,
  buildInventoryCsvContent,
  generateAndShareInventoryCSV,
  generateAndShareMovementsCSV,
} from '../utils/exportCsv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportButtonPath = path.resolve(__dirname, '../components/ExportButton.js');
const appPath = path.resolve(__dirname, '../App.js');

test('CSV Export Engine & B2B ExportButton Integration (TDD)', async (t) => {
  await t.test(
    'generates CSV header (ID, Código de Barras, Nome do Produto, Quantidade, Espaço) and cross-references space_id with spaces list',
    () => {
      const spaces = [
        { id: 1, name: 'Galpão Principal' },
        { id: 2, name: 'Corredor B, Prateleira "3"' },
      ];
      const items = [
        {
          id: 101,
          barcode: '7891000100103',
          name: 'Parafuso Sextavado 1/4',
          quantity: 250,
          space_id: 1,
        },
        {
          id: 102,
          barcode: '7891000200202',
          name: 'Porca Inox, Polida "Premium"',
          quantity: 80,
          space_id: 2,
        },
        {
          id: 103,
          barcode: null,
          name: 'Arruela Lisa\nLote Especial',
          quantity: 15,
          space_id: null,
        },
      ];

      const csv = buildInventoryCsvContent(items, spaces);
      const lines = csv.trim().split('\n');

      assert.equal(
        lines[0],
        'ID,Código de Barras,Nome do Produto,Quantidade,Espaço'
      );
      assert.equal(
        lines[1],
        '101,7891000100103,Parafuso Sextavado 1/4,250,Galpão Principal'
      );
      assert.equal(
        lines[2],
        '102,7891000200202,"Porca Inox, Polida ""Premium""",80,"Corredor B, Prateleira ""3"""'
      );
      assert.equal(
        lines[3],
        '103,,"Arruela Lisa Lote Especial",15,Sem local definido'
      );
    }
  );

  await t.test(
    'escapeCsvCell properly escapes commas, double quotes, and newlines',
    () => {
      assert.equal(escapeCsvCell('Simples'), 'Simples');
      assert.equal(escapeCsvCell('Com, vírgula'), '"Com, vírgula"');
      assert.equal(escapeCsvCell('Caixa "A"'), '"Caixa ""A"""');
      assert.equal(escapeCsvCell(null), '');
      assert.equal(escapeCsvCell(42), '42');
    }
  );

  await t.test(
    'neutralizes OWASP CSV Formula Injection payloads (=, +, -, @) without altering legitimate numeric barcodes or quantities',
    () => {
      assert.equal(
        escapeCsvCell("=CMD|' /C calc'!A0"),
        "'=CMD|' /C calc'!A0"
      );
      assert.equal(
        escapeCsvCell('+IMPORTXML(A1, "//secret")'),
        '"+IMPORTXML(A1, ""//secret"")"'.replace('"+', '"\'+')
      );
      assert.equal(escapeCsvCell('@SUM(1+1)'), "'@SUM(1+1)");
      assert.equal(escapeCsvCell('-1+1=0'), "'-1+1=0");
      assert.equal(escapeCsvCell('7891000100103'), '7891000100103');
      assert.equal(escapeCsvCell(250), '250');
    }
  );

  await t.test(
    'generateAndShareInventoryCSV saves Relatorio_Estoque.csv via expo-file-system/legacy and invokes Sharing.shareAsync with mimeType text/csv',
    async () => {
      const writtenFiles = [];
      const shareCalls = [];

      const mockFileSystem = {
        cacheDirectory: 'file:///data/user/0/host.exp.exponent/cache/',
        EncodingType: { UTF8: 'utf8' },
        writeAsStringAsync: async (uri, content, options) => {
          writtenFiles.push({ uri, content, options });
        },
      };

      const mockSharing = {
        isAvailableAsync: async () => true,
        shareAsync: async (uri, options) => {
          shareCalls.push({ uri, options });
        },
      };

      const spaces = [{ id: 5, name: 'Almoxarifado B2B' }];
      const items = [
        {
          id: 1,
          barcode: '7890001112223',
          name: 'Cabo HDMI, 2m',
          quantity: 12,
          space_id: 5,
        },
      ];

      const result = await generateAndShareInventoryCSV(items, spaces, {
        fileSystem: mockFileSystem,
        sharing: mockSharing,
      });

      assert.equal(writtenFiles.length, 1);
      assert.equal(
        writtenFiles[0].uri,
        'file:///data/user/0/host.exp.exponent/cache/Relatorio_Estoque.csv'
      );
      assert.match(
        writtenFiles[0].content,
        /^ID,Código de Barras,Nome do Produto,Quantidade,Espaço\n/
      );
      assert.match(
        writtenFiles[0].content,
        /1,7890001112223,"Cabo HDMI, 2m",12,Almoxarifado B2B/
      );

      assert.equal(shareCalls.length, 1);
      assert.equal(
        shareCalls[0].uri,
        'file:///data/user/0/host.exp.exponent/cache/Relatorio_Estoque.csv'
      );
      assert.equal(shareCalls[0].options.mimeType, 'text/csv');
      assert.equal(result.fileUri, writtenFiles[0].uri);
      assert.equal(result.rowCount, 1);
    }
  );

  await t.test(
    'ExportButton and App.js connect generateAndShareInventoryCSV with items, spaces, and loading (isBusy) state',
    () => {
      const source = fs.readFileSync(exportButtonPath, 'utf8');
      const appSource = fs.readFileSync(appPath, 'utf8');

      assert.match(source, /import\s+\{\s*Download\s*\}\s+from\s+['"]lucide-react-native['"]/);
      assert.match(source, /ActivityIndicator/);
      assert.match(source, /surface:\s*['"]#111111['"]/);
      assert.match(source, /text:\s*['"]#ffffff['"]/);
      assert.match(source, /fontVariant:\s*\[\s*['"]tabular-nums['"]\s*\]/);

      assert.match(
        appSource,
        /import\s+\{[^}]*generateAndShareInventoryCSV[^}]*\}\s+from\s+['"]\.\/utils\/exportCsv['"]/
      );
      assert.match(appSource, /generateAndShareInventoryCSV\(\s*items\s*,\s*spaces\s*\)/);
      assert.match(
        appSource,
        /ListHeaderComponent=\{\s*!isHome\s*\?\s*\([\s\S]*?<ExportButton/
      );
    }
  );

  await t.test(
    'generateAndShareMovementsCSV exports audit trail to Relatorio_Movimentacoes.csv with OWASP protection',
    async () => {
      assert.equal(typeof generateAndShareMovementsCSV, 'function');

      const writtenFiles = [];
      const shareCalls = [];

      const mockFileSystem = {
        cacheDirectory: 'file:///data/user/0/host.exp.exponent/cache/',
        EncodingType: { UTF8: 'utf8' },
        async writeAsStringAsync(uri, content) {
          writtenFiles.push({ uri, content });
        },
      };

      const mockSharing = {
        async isAvailableAsync() {
          return true;
        },
        async shareAsync(uri, options) {
          shareCalls.push({ uri, options });
        },
      };

      const movements = [
        {
          id: 9,
          item_name: 'Roteador Wi-Fi 6 Gigabit Pro',
          barcode: '7893216549870',
          delta: 0,
          previous_qty: 6,
          new_qty: 6,
          reason: 'transferencia_local',
          created_at: '2026-11-13T20:15:00.000Z',
        },
      ];

      const result = await generateAndShareMovementsCSV(movements, {
        fileSystem: mockFileSystem,
        sharing: mockSharing,
      });

      assert.equal(writtenFiles.length, 1);
      assert.equal(
        writtenFiles[0].uri,
        'file:///data/user/0/host.exp.exponent/cache/Relatorio_Movimentacoes.csv'
      );
      assert.match(
        writtenFiles[0].content,
        /^ID,Produto,Código de Barras,Variação,Saldo Anterior,Novo Saldo,Motivo,Data\/Hora\n/
      );
      assert.match(
        writtenFiles[0].content,
        /9,Roteador Wi-Fi 6 Gigabit Pro,7893216549870,0,6,6,transferencia_local,2026-11-13T20:15:00\.000Z/
      );
      assert.equal(shareCalls.length, 1);
      assert.equal(result.rowCount, 1);
    }
  );

  await t.test(
    'recovers gracefully from Android ERR_SHARING_IN_PROGRESS by falling back to native Share sheet without throwing',
    async () => {
      const fallbackCalls = [];
      const mockFileSystem = {
        cacheDirectory: 'file:///data/user/0/com.ygtrz.ArmarioDigital/cache/',
        EncodingType: { UTF8: 'utf8' },
        async writeAsStringAsync() {},
      };
      const stuckExpoSharing = {
        async isAvailableAsync() {
          return true;
        },
        async shareAsync() {
          const err = new Error(
            "Call to function 'ExpoSharing.shareAsync' has been rejected. -> Caused by: Another share request is being processed now."
          );
          err.code = 'ERR_SHARING_IN_PROGRESS';
          throw err;
        },
      };
      const mockFallbackShare = {
        async share(payload) {
          fallbackCalls.push(payload);
          return { action: 'sharedAction' };
        },
      };

      const res = await generateAndShareInventoryCSV(
        [{ id: 1, barcode: '78901', name: 'Item Teste', quantity: 3, space_id: null }],
        [],
        {
          fileSystem: mockFileSystem,
          sharing: stuckExpoSharing,
          fallbackShare: mockFallbackShare,
        }
      );

      assert.equal(res.rowCount, 1);
      assert.equal(fallbackCalls.length, 1);
      assert.match(fallbackCalls[0].message, /Item Teste/);
    }
  );
});
