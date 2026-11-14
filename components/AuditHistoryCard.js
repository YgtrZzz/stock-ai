import { memo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Painel B2B no padrão shadcn/ui zinc dark de Histórico Auditável de Movimentações.
 * Bordas 1px #27272a, badges refinados com borda contrastante e números tabulares.
 */
function AuditHistoryCard({
  stockMovements,
  movements = [],
  expanded: controlledExpanded,
  onToggleExpand,
  exporting = false,
  onExportMovements,
  onExportCsv,
  formatarData,
  formatDate,
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded =
    typeof controlledExpanded === 'boolean'
      ? controlledExpanded
      : internalExpanded;

  const handleToggle = () => {
    if (typeof onToggleExpand === 'function') {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const handleExport = onExportMovements || onExportCsv;
  const formatFn = formatarData || formatDate;
  const list = Array.isArray(stockMovements) ? stockMovements : movements;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Histórico de Movimentações</Text>
          <Text style={styles.subtitle}>
            {list.length}{' '}
            {list.length === 1
              ? 'registro auditável recente'
              : 'registros auditáveis recentes'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.togglePill, isExpanded && styles.togglePillActive]}
          activeOpacity={0.8}
          onPress={handleToggle}
        >
          <RefreshCw
            size={13}
            color={isExpanded ? TOKENS.ground : TOKENS.text}
            strokeWidth={1.75}
          />
          <Text
            style={[styles.toggleText, isExpanded && styles.toggleTextActive]}
          >
            {isExpanded ? 'Ocultar' : 'Auditoria'}
          </Text>
        </TouchableOpacity>
      </View>

      {isExpanded && (
        <View style={styles.body}>
          {list.length === 0 ? (
            <Text style={styles.hint}>
              Nenhuma movimentação registrada ainda.
            </Text>
          ) : (
            list.slice(0, 12).map((mov) => {
              const isPositive = Number(mov.delta) >= 0;
              const deltaFormatted = isPositive
                ? `+${mov.delta}`
                : String(mov.delta);
              const reasonLabel =
                mov.reason === 'cadastro_inicial'
                  ? 'Cadastro'
                  : mov.reason === 'sincronizacao_csv'
                    ? 'Lote CSV'
                    : mov.reason === 'transferencia_local'
                      ? 'Transferência'
                      : isPositive
                        ? 'Entrada'
                        : 'Baixa';

              return (
                <View key={String(mov.id)} style={styles.auditRow}>
                  <View style={styles.auditLeftCol}>
                    <Text style={styles.auditItemName} numberOfLines={1}>
                      {mov.item_name}
                    </Text>
                    <Text style={styles.auditMetaText}>
                      {reasonLabel} · {mov.previous_qty} para {mov.new_qty} un.
                      {' · '}
                      {typeof formatFn === 'function'
                        ? formatFn(mov.created_at)
                        : mov.created_at}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.auditDeltaPill,
                      isPositive
                        ? styles.quantityPillPositive
                        : styles.quantityPillWarning,
                    ]}
                  >
                    <Text
                      style={[
                        styles.auditDeltaText,
                        isPositive
                          ? styles.quantityPillValuePositive
                          : styles.quantityPillValueWarning,
                      ]}
                    >
                      {deltaFormatted}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          {list.length > 0 && typeof handleExport === 'function' && (
            <TouchableOpacity
              style={[styles.exportPill, exporting && styles.controlDisabled]}
              activeOpacity={0.82}
              onPress={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={TOKENS.ground} />
              ) : (
                <Text style={styles.exportPillText}>
                  Exportar Auditoria CSV ({list.length})
                </Text>
              )}
            </TouchableOpacity>
          )}
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
    fontVariant: ['tabular-nums'],
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
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.border || '#27272a',
  },
  auditLeftCol: {
    flex: 1,
    gap: 2,
  },
  auditItemName: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  auditMetaText: {
    color: TOKENS.mutedFg || TOKENS.faint,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  auditDeltaPill: {
    minWidth: 48,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditDeltaText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  quantityPillPositive: {
    backgroundColor: TOKENS.pillPositiveBg,
    borderColor: '#3f5713',
  },
  quantityPillWarning: {
    backgroundColor: TOKENS.pillWarningBg,
    borderColor: '#4d3810',
  },
  quantityPillValuePositive: {
    color: TOKENS.pillPositiveInk,
  },
  quantityPillValueWarning: {
    color: TOKENS.pillWarningInk,
  },
  exportPill: {
    backgroundColor: TOKENS.text,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  exportPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  controlDisabled: {
    opacity: 0.35,
  },
});

export default memo(AuditHistoryCard);
