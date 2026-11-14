import { memo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Layers } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Painel B2B memoizado (React.memo) para Importação em Lote de Catálogo CSV/ERP.
 */
function CsvBulkImportCard({
  expanded = false,
  onToggleExpand,
  csvText = '',
  onChangeCsvText,
  importing = false,
  onSubmitImport,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Importação em Lote (ERP / CSV)</Text>
          <Text style={styles.subtitle}>
            Sincronize SKUs, saldos e locais via planilha
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.togglePill, expanded && styles.togglePillActive]}
          activeOpacity={0.8}
          onPress={onToggleExpand}
        >
          <Layers
            size={14}
            color={expanded ? TOKENS.ground : TOKENS.text}
            strokeWidth={1.75}
          />
          <Text style={[styles.toggleText, expanded && styles.toggleTextActive]}>
            {expanded ? 'Fechar' : 'Importar CSV'}
          </Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Formato aceito (vírgula ou ponto e vírgula):{'\n'}
            Código de Barras;Nome do Produto;Quantidade;Espaço
          </Text>
          <TextInput
            style={styles.input}
            value={csvText}
            onChangeText={onChangeCsvText}
            placeholder={
              '7891000100103;Caixa Organizadora 20L;15;Galpão A\n7892000200206;Parafusadeira 20V;4;Corredor B'
            }
            placeholderTextColor={TOKENS.faint}
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[
              styles.submitPill,
              (!csvText.trim() || importing) && styles.controlDisabled,
            ]}
            activeOpacity={0.85}
            onPress={onSubmitImport}
            disabled={!csvText.trim() || importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color={TOKENS.ground} />
            ) : (
              <View style={styles.inlineRow}>
                <Check size={16} color={TOKENS.ground} strokeWidth={2} />
                <Text style={styles.submitPillText}>Processar Lote CSV</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusCard,
    padding: 18,
    marginBottom: TOKENS.gap,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  subtitle: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  togglePillActive: {
    backgroundColor: TOKENS.text,
  },
  toggleText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: TOKENS.ground,
  },
  body: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.rule,
    gap: 10,
  },
  hint: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  input: {
    backgroundColor: TOKENS.raised,
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  submitPill: {
    backgroundColor: TOKENS.text,
    height: TOKENS.controlHeight,
    paddingHorizontal: 18,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  controlDisabled: {
    opacity: 0.35,
  },
});

export default memo(CsvBulkImportCard);
