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
 * Painel B2B no padrão shadcn/ui zinc dark para Importação em Lote CSV/ERP.
 * Borda 1px #27272a, input inset #09090b com visual terminal/código e botão de lote.
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
            size={13}
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
            activeOpacity={0.82}
            onPress={onSubmitImport}
            disabled={!csvText.trim() || importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color={TOKENS.ground} />
            ) : (
              <View style={styles.inlineRow}>
                <Check size={15} color={TOKENS.ground} strokeWidth={2.25} />
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
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 14,
    padding: 16,
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
    letterSpacing: -0.2,
  },
  subtitle: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: TOKENS.fsSmall,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  togglePillActive: {
    backgroundColor: TOKENS.text,
    borderColor: TOKENS.text,
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
    borderTopColor: TOKENS.border || '#27272a',
    gap: 10,
  },
  hint: {
    color: TOKENS.mutedFg || TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  input: {
    backgroundColor: TOKENS.input || '#09090b',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  submitPill: {
    backgroundColor: TOKENS.text,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  submitPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSmall,
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
