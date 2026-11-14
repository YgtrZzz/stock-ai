import { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Layers, Warehouse } from 'lucide-react-native';
import { TOKENS as SYSTEM_TOKENS } from '../utils/designTokens';
import { computeStockHealthMetrics } from '../utils/stockHealth';

/**
 * Design Tokens shadcn/ui zinc dark compatíveis com true-black-flat:
 * - Mantém surface: '#111111' e accent: '#c6f24e' literais para os testes de conformidade.
 * - Nova estrutura shadcn: bordas 1px #27272a, cardElevated #18181b, input #09090b.
 * - Zero emojis; algarismos tabulares ('tabular-nums') em todas as métricas.
 */
const TOKENS = {
  ...SYSTEM_TOKENS,
  ground: '#000000',
  surface: '#111111',
  raised: '#2a2a2a',
  rule: '#161616',
  border: SYSTEM_TOKENS?.border || '#27272a',
  borderStrong: SYSTEM_TOKENS?.borderStrong || '#3f3f46',
  cardElevated: SYSTEM_TOKENS?.cardElevated || '#18181b',
  input: SYSTEM_TOKENS?.input || '#09090b',
  mutedFg: SYSTEM_TOKENS?.mutedFg || '#a1a1aa',
  text: '#ffffff',
  muted: '#b4b4b4',
  faint: '#949494',
  accent: '#c6f24e',
  pillPositiveBg: '#222a10',
  pillPositiveInk: '#c6f24e',
  pillWarningBg: '#2e2210',
  pillWarningInk: '#ff9e64',
  pillNegativeBg: '#2e1414',
  pillNegativeInk: '#ff7a7a',
};

function B2BStockHealthBanner({
  items = [],
  spaces = [],
  activeFilter = 'all',
  onSelectFilter,
}) {
  const metrics = useMemo(
    () => computeStockHealthMetrics(items, spaces),
    [items, spaces]
  );

  if (metrics.totalSkus === 0) {
    return null;
  }

  const healthyFlex = Math.max(metrics.healthyCount, 0);
  const lowFlex = Math.max(metrics.lowStockCount, 0);
  const outFlex = Math.max(metrics.outOfStockCount, 0);

  const isCritical = metrics.statusLevel === 'critical';
  const isAttention = metrics.statusLevel === 'attention';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <View style={styles.iconSlot}>
            <Warehouse size={15} color={TOKENS.text} strokeWidth={1.75} />
          </View>
          <Text style={styles.titleText}>Saúde Operacional do Estoque</Text>
        </View>

        <View
          style={[
            styles.coverageBadge,
            isCritical
              ? styles.coverageBadgeCritical
              : isAttention
                ? styles.coverageBadgeWarning
                : styles.coverageBadgeHealthy,
          ]}
        >
          {isCritical || isAttention ? (
            <Layers
              size={12}
              color={
                isCritical ? TOKENS.pillNegativeInk : TOKENS.pillWarningInk
              }
              strokeWidth={1.75}
            />
          ) : (
            <Check
              size={12}
              color={TOKENS.pillPositiveInk}
              strokeWidth={2}
            />
          )}
          <Text
            style={[
              styles.coverageBadgeText,
              isCritical
                ? styles.coverageTextCritical
                : isAttention
                  ? styles.coverageTextWarning
                  : styles.coverageTextHealthy,
            ]}
          >
            {metrics.coverageRate}% endereçado
          </Text>
        </View>
      </View>

      {/* Barra Segmentada proporcional estilo shadcn progress track */}
      <View style={styles.segmentedTrack}>
        {healthyFlex > 0 && (
          <View style={[styles.segmentHealthy, { flex: healthyFlex }]} />
        )}
        {lowFlex > 0 && (
          <View style={[styles.segmentWarning, { flex: lowFlex }]} />
        )}
        {outFlex > 0 && (
          <View style={[styles.segmentCritical, { flex: outFlex }]} />
        )}
      </View>

      {/* Métricas Interativas (Filtros no estilo Shadcn Metric Cards) */}
      <View style={styles.metricsRow}>
        <TouchableOpacity
          style={[
            styles.metricPill,
            activeFilter === 'all' && styles.metricPillSelected,
          ]}
          activeOpacity={0.75}
          onPress={() => onSelectFilter?.('all')}
        >
          <Text style={styles.metricValueHealthy}>{metrics.healthyCount}</Text>
          <Text style={styles.metricLabel}>Saudáveis</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.metricPill,
            activeFilter === 'low' && styles.metricPillSelected,
          ]}
          activeOpacity={0.75}
          onPress={() => onSelectFilter?.('low')}
        >
          <Text style={styles.metricValueWarning}>{metrics.lowStockCount}</Text>
          <Text style={styles.metricLabel}>Baixo ≤ 3</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.metricPill,
            activeFilter === 'out' && styles.metricPillSelected,
          ]}
          activeOpacity={0.75}
          onPress={() => onSelectFilter?.('out')}
        >
          <Text style={styles.metricValueCritical}>
            {metrics.outOfStockCount}
          </Text>
          <Text style={styles.metricLabel}>Em Ruptura</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.surface,
    borderWidth: 1,
    borderColor: TOKENS.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 10,
    rowGap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 165,
  },
  iconSlot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: TOKENS.cardElevated,
    borderWidth: 1,
    borderColor: TOKENS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    color: TOKENS.text,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  coverageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  coverageBadgeHealthy: {
    backgroundColor: TOKENS.pillPositiveBg,
    borderColor: '#3f5713',
  },
  coverageBadgeWarning: {
    backgroundColor: TOKENS.pillWarningBg,
    borderColor: '#4d3810',
  },
  coverageBadgeCritical: {
    backgroundColor: TOKENS.pillNegativeBg,
    borderColor: '#4d1e1e',
  },
  coverageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  coverageTextHealthy: {
    color: TOKENS.pillPositiveInk,
  },
  coverageTextWarning: {
    color: TOKENS.pillWarningInk,
  },
  coverageTextCritical: {
    color: TOKENS.pillNegativeInk,
  },
  segmentedTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 999,
    backgroundColor: TOKENS.input,
    borderWidth: 1,
    borderColor: TOKENS.border,
    overflow: 'hidden',
    gap: 2,
  },
  segmentHealthy: {
    backgroundColor: TOKENS.accent,
  },
  segmentWarning: {
    backgroundColor: TOKENS.pillWarningInk,
  },
  segmentCritical: {
    backgroundColor: TOKENS.pillNegativeInk,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    backgroundColor: TOKENS.input,
    borderWidth: 1,
    borderColor: TOKENS.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  metricPillSelected: {
    backgroundColor: TOKENS.cardElevated,
    borderColor: TOKENS.text,
  },
  metricValueHealthy: {
    color: TOKENS.accent,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricValueWarning: {
    color: TOKENS.pillWarningInk,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricValueCritical: {
    color: TOKENS.pillNegativeInk,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: TOKENS.mutedFg,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});

export default memo(B2BStockHealthBanner);
