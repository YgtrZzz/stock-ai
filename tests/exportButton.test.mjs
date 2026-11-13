import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeCsvCell,
  buildInventoryCsvContent,
  generateAndShareInventoryCSV,
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
        /import\s+\{\s*generateAndShareInventoryCSV\s*\}\s+from\s+['"]\.\/utils\/exportCsv['"]/
      );
      assert.match(appSource, /generateAndShareInventoryCSV\(\s*items\s*,\s*spaces\s*\)/);
      assert.match(appSource, /ListHeaderComponent=\{\s*!isHome\s*\?\s*\(\s*<ExportButton/);
    }
  );
});
