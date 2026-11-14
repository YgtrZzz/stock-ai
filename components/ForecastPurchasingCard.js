import { memo, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Package,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';
import {
  computeAbcCurve,
  computeItemRunoutForecast,
} from '../utils/inventoryForecast';

/**
 * Painel PME de Previsão de Esgotamento (Runout Forecaster) & Curva ABC de Giro.
 * Estilo shadcn/ui zinc dark: borda 1px #27272a, cards elevados #18181b, zero emojis e tabular-nums.
 */
function ForecastPurchasingCardComponent({
  items = [],
  movements = [],
  spaces = [],
  exporting = false,
  onExportForecast,
}) {
  const [expanded, setExpanded] = useState(false);
  const [filterMode, setFilterMode] = useState('reorder'); // 'reorder' | 'all' | 'dormant'

  const forecastData = useMemo(() => {
    const forecast = computeItemRunoutForecast(items, movements, {
      windowDays: 30,
      targetCoverageDays: 15,
    });
    const abc = computeAbcCurve(items, movements, 30);

    const merged = forecast.map((f) => ({
      ...f,
      abcClass: abc.classes[f.id] || 'C',
    }));

    // Ordena priorizando urgência de reposição
    merged.sort((a, b) => {
      const urgencyWeight = {
        out_of_stock: 4,
        critical: 3,
        attention: 2,
        healthy: 1,
        dormant: 0,
      };
      const diff = urgencyWeight[b.urgencyStatus] - urgencyWeight[a.urgencyStatus];
      if (diff !== 0) return diff;
      return b.suggestedRestockQty - a.suggestedRestockQty;
    });

    const needReorderCount = merged.filter(
      (m) => m.urgencyStatus === 'out_of_stock' || m.urgencyStatus === 'critical' || m.urgencyStatus === 'attention'
    ).length;
    const dormantCount = merged.filter((m) => m.urgencyStatus === 'dormant').length;

    return {
      items: merged,
      abcSummary: abc.summary,
      needReorderCount,
      dormantCount,
    };
  }, [items, movements]);

  if (!items || items.length === 0) return null;

  const displayedList = forecastData.items.filter((item) => {
    if (filterMode === 'reorder') {
      return (
        item.urgencyStatus === 'out_of_stock' ||
        item.urgencyStatus === 'critical' ||
        item.urgencyStatus === 'attention'
      );
    }
    if (filterMode === 'dormant') {
      return item.urgencyStatus === 'dormant';
    }
    return true;
  });

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.iconSlot}>
              <TrendingUp size={15} color={TOKENS.accent} strokeWidth={2} />
            </View>
            <Text style={styles.title}>Previsão de Compras & Curva ABC</Text>
          </View>
          <Text style={styles.subtitle}>
            {forecastData.needReorderCount}{' '}
            {forecastData.needReorderCount === 1 ? 'item requer' : 'itens requerem'}{' '}
            reposição · Giro A: {forecastData.abcSummary.classACount} SKUs
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.togglePill, expanded && styles.togglePillActive]}
          activeOpacity={0.8}
          onPress={() => setExpanded((prev) => !prev)}
        >
          {expanded ? (
            <ChevronUp size={14} color={TOKENS.ground} strokeWidth={2} />
          ) : (
            <ChevronDown size={14} color={TOKENS.text} strokeWidth={2} />
          )}
          <Text style={[styles.toggleText, expanded && styles.toggleTextActive]}>
            {expanded ? 'Ocultar' : 'Análise'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Resumo Rápido Sempre Visível quando há itens em alerta */}
      {forecastData.needReorderCount > 0 && !expanded && (
        <View style={styles.quickAlertBanner}>
          <AlertTriangle
            size={14}
            color={TOKENS.pillWarningInk}
            strokeWidth={2}
          />
          <Text style={styles.quickAlertText}>
            {forecastData.needReorderCount} produto(s) com risco de ruptura nos próximos 7 dias.
          </Text>
        </View>
      )}

      {expanded && (
        <View style={styles.body}>
          {/* Barra de Filtros da Previsão */}
          <View style={styles.filterPillsRow}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                filterMode === 'reorder' && styles.filterPillActive,
              ]}
              activeOpacity={0.75}
              onPress={() => setFilterMode('reorder')}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filterMode === 'reorder' && styles.filterPillTextActive,
                ]}
              >
                Reposição ({forecastData.needReorderCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                filterMode === 'all' && styles.filterPillActive,
              ]}
              activeOpacity={0.75}
              onPress={() => setFilterMode('all')}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filterMode === 'all' && styles.filterPillTextActive,
                ]}
              >
                Todos ({forecastData.items.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                filterMode === 'dormant' && styles.filterPillActive,
              ]}
              activeOpacity={0.75}
              onPress={() => setFilterMode('dormant')}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filterMode === 'dormant' && styles.filterPillTextActive,
                ]}
              >
                Parados ({forecastData.dormantCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Listagem de Itens com Previsão e Sugestão de Reposição */}
          {displayedList.length === 0 ? (
            <View style={styles.emptyStateBox}>
              <Package size={20} color={TOKENS.faint} strokeWidth={1.5} />
              <Text style={styles.emptyStateText}>
                Nenhum produto encontrado neste filtro.
              </Text>
            </View>
          ) : (
            displayedList.slice(0, 10).map((item) => {
              const isOut = item.urgencyStatus === 'out_of_stock';
              const isCritical = item.urgencyStatus === 'critical';
              const isAttention = item.urgencyStatus === 'attention';

              const badgeColor = isOut || isCritical
                ? styles.statusBadgeCritical
                : isAttention
                  ? styles.statusBadgeAttention
                  : item.urgencyStatus === 'dormant'
                    ? styles.statusBadgeDormant
                    : styles.statusBadgeHealthy;

              const badgeText = isOut
                ? 'Esgotado'
                : isCritical
                  ? `${item.daysRemaining}d restantes`
                  : isAttention
                    ? `${item.daysRemaining}d restantes`
                    : item.urgencyStatus === 'dormant'
                      ? 'Sem Saídas (30d)'
                      : `${item.daysRemaining}d cobertos`;

              return (
                <View key={String(item.id)} style={styles.itemRow}>
                  <View style={styles.itemLeftCol}>
                    <View style={styles.nameRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {/* Badge Curva ABC */}
                      <View
                        style={[
                          styles.abcBadge,
                          item.abcClass === 'A'
                            ? styles.abcBadgeA
                            : item.abcClass === 'B'
                              ? styles.abcBadgeB
                              : styles.abcBadgeC,
                        ]}
                      >
                        <Text style={styles.abcBadgeText}>
                          Curva {item.abcClass}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.itemMetaText}>
                      Estoque: {item.quantity} un. · Consumo: {item.dailyBurnRate.toFixed(1)}/dia
                    </Text>
                  </View>

                  <View style={styles.itemRightCol}>
                    <View style={[styles.statusBadge, badgeColor]}>
                      <Text style={styles.statusBadgeText}>{badgeText}</Text>
                    </View>

                    {item.suggestedRestockQty > 0 && (
                      <View style={styles.reorderPill}>
                        <ShoppingCart size={11} color={TOKENS.ground} strokeWidth={2} />
                        <Text style={styles.reorderPillText}>
                          +{item.suggestedRestockQty} un. (15d)
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {/* Botão de Exportação de Compras CSV */}
          <TouchableOpacity
            style={[styles.exportCsvButton, exporting && styles.controlDisabled]}
            activeOpacity={0.8}
            onPress={() => onExportForecast?.(forecastData.items)}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={TOKENS.ground} />
            ) : (
              <View style={styles.inlineRow}>
                <Download size={14} color={TOKENS.ground} strokeWidth={2} />
                <Text style={styles.exportCsvButtonText}>
                  Exportar Relatório de Compras Sugeridas (CSV)
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const ForecastPurchasingCard = memo(ForecastPurchasingCardComponent);
export default ForecastPurchasingCard;

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
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconSlot: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 5,
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
  quickAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2e2210',
    borderWidth: 1,
    borderColor: '#4d3810',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  quickAlertText: {
    color: TOKENS.pillWarningInk,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  body: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border || '#27272a',
    gap: 12,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPill: {
    backgroundColor: TOKENS.input || '#09090b',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  filterPillActive: {
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderColor: TOKENS.text,
  },
  filterPillText: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  filterPillTextActive: {
    color: TOKENS.text,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.border || '#27272a',
    gap: 10,
  },
  itemLeftCol: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    flexShrink: 1,
  },
  abcBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  abcBadgeA: {
    backgroundColor: '#222a10',
    borderColor: '#3f5713',
  },
  abcBadgeB: {
    backgroundColor: '#2e2210',
    borderColor: '#4d3810',
  },
  abcBadgeC: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
  },
  abcBadgeText: {
    color: TOKENS.text,
    fontSize: 9,
    fontWeight: '700',
  },
  itemMetaText: {
    color: TOKENS.mutedFg || TOKENS.faint,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  itemRightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeCritical: {
    backgroundColor: '#2e1414',
    borderColor: '#4d1e1e',
  },
  statusBadgeAttention: {
    backgroundColor: '#2e2210',
    borderColor: '#4d3810',
  },
  statusBadgeHealthy: {
    backgroundColor: '#222a10',
    borderColor: '#3f5713',
  },
  statusBadgeDormant: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
  },
  statusBadgeText: {
    color: TOKENS.text,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  reorderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: TOKENS.accent,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reorderPillText: {
    color: TOKENS.ground,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  emptyStateText: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: TOKENS.fsSmall,
  },
  exportCsvButton: {
    backgroundColor: TOKENS.text,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  exportCsvButtonText: {
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
