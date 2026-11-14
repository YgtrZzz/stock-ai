import { memo } from 'react';
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
 * Painel B2B memoizado (React.memo) de Histórico Auditável de Movimentações de Estoque.
 */
function AuditHistoryCard({
  movements = [],
  expanded = false,
  onToggleExpand,
  exporting = false,
  onExportCsv,
  formatDate,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Histórico de Movimentações</Text>
          <Text style={styles.subtitle}>
            {movements.length}{' '}
            {movements.length === 1
              ? 'registro auditável recente'
              : 'registros auditáveis recentes'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.togglePill, expanded && styles.togglePillActive]}
          activeOpacity={0.8}
          onPress={onToggleExpand}
        >
          <RefreshCw
            size={13}
            color={expanded ? TOKENS.ground : TOKENS.text}
            strokeWidth={1.75}
          />
          <Text style={[styles.toggleText, expanded && styles.toggleTextActive]}>
            {expanded ? 'Ocultar' : 'Auditoria'}
          </Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.body}>
          {movements.length === 0 ? (
            <Text style={styles.hint}>
              Nenhuma movimentação registrada ainda.
            </Text>
          ) : (
            movements.slice(0, 12).map((mov) => {
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
                      {typeof formatDate === 'function'
                        ? formatDate(mov.created_at)
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

          {movements.length > 0 && (
            <TouchableOpacity
              style={[
                styles.exportPill,
                exporting && styles.controlDisabled,
              ]}
              activeOpacity={0.85}
              onPress={onExportCsv}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={TOKENS.ground} />
              ) : (
                <Text style={styles.exportPillText}>
                  Exportar Auditoria CSV ({movements.length})
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
    fontVariant: ['tabular-nums'],
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
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.rule,
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
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  auditDeltaPill: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditDeltaText: {
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  quantityPillPositive: {
    backgroundColor: TOKENS.pillPositiveBg,
  },
  quantityPillWarning: {
    backgroundColor: TOKENS.pillWarningBg,
  },
  quantityPillValuePositive: {
    color: TOKENS.pillPositiveInk,
  },
  quantityPillValueWarning: {
    color: TOKENS.pillWarningInk,
  },
  exportPill: {
    backgroundColor: TOKENS.text,
    height: TOKENS.controlHeight,
    paddingHorizontal: 18,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  controlDisabled: {
    opacity: 0.35,
  },
});

export default memo(AuditHistoryCard);
