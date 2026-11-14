import { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Layers, Warehouse } from 'lucide-react-native';
import { computeStockHealthMetrics } from '../utils/stockHealth';

/**
 * Design Tokens estritos 'true-black-flat' (design-taste-frontend):
 * - Superfícies planas (#000000 -> #111111 -> #2a2a2a), sem sombras ou gradientes.
 * - Tipografia tabular-nums para todas as métricas e percentuais.
 * - Zero emojis; exclusivamente ícones vetoriais Lucide.
 */
const TOKENS = {
  ground: '#000000',
  surface: '#111111',
  raised: '#2a2a2a',
  rule: '#161616',
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
          <Warehouse size={16} color={TOKENS.text} strokeWidth={1.75} />
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

      {/* Barra Segmentada proporcional de Saúde de SKUs ('true-black-flat') */}
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

      {/* Métricas Interativas de Giro e Ruptura */}
      <View style={styles.metricsRow}>
        <TouchableOpacity
          style={[
            styles.metricPill,
            activeFilter === 'all' && styles.metricPillSelected,
          ]}
          activeOpacity={0.8}
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
          activeOpacity={0.8}
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
          activeOpacity={0.8}
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
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  titleText: {
    color: TOKENS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  coverageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  coverageBadgeHealthy: {
    backgroundColor: TOKENS.pillPositiveBg,
  },
  coverageBadgeWarning: {
    backgroundColor: TOKENS.pillWarningBg,
  },
  coverageBadgeCritical: {
    backgroundColor: TOKENS.pillNegativeBg,
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
    height: 8,
    borderRadius: 999,
    backgroundColor: TOKENS.raised,
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
    backgroundColor: TOKENS.raised,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  metricPillSelected: {
    borderWidth: 1,
    borderColor: TOKENS.text,
  },
  metricValueHealthy: {
    color: TOKENS.accent,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricValueWarning: {
    color: TOKENS.pillWarningInk,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricValueCritical: {
    color: TOKENS.pillNegativeInk,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: TOKENS.muted,
    fontSize: 11,
    fontWeight: '500',
  },
});

export default memo(B2BStockHealthBanner);
