import React, { memo } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  X,
} from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Modal de Resumo de Auditoria & Discrepâncias de Inventário Físico.
 * Exibe comparativo Sistema vs Físico vs Diferença com tabular-nums, badges de estado e ação de ajuste.
 */
function AuditDiscrepancyModalComponent({
  visible = false,
  items = [], // Array de { id, name, barcode, systemQty, physicalQty, difference }
  onClose,
  onApplyStockAdjustment,
}) {
  const totalChecked = items.length;
  const discrepancies = items.filter((it) => it.difference !== 0);
  const matchedCount = totalChecked - discrepancies.length;

  const renderDiscrepancyItem = ({ item }) => {
    const isExact = item.difference === 0;
    const isShortage = item.difference < 0;
    const isSurplus = item.difference > 0;

    return (
      <View style={styles.itemRow}>
        <View style={styles.itemLeftCol}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.itemMeta}>
            {item.barcode ? `Código: ${item.barcode} · ` : ''}
            Sistema: {item.systemQty} un. · Físico: {item.physicalQty} un.
          </Text>
        </View>

        <View
          style={[
            styles.diffBadge,
            isExact && styles.diffBadgeExact,
            isShortage && styles.diffBadgeShortage,
            isSurplus && styles.diffBadgeSurplus,
          ]}
        >
          <Text
            style={[
              styles.diffBadgeText,
              isExact && styles.diffTextExact,
              isShortage && styles.diffTextShortage,
              isSurplus && styles.diffTextSurplus,
            ]}
          >
            {isExact
              ? 'Exato'
              : `${item.difference > 0 ? `+${item.difference}` : item.difference} un.`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialogCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleBlock}>
              <View style={styles.headerIconRow}>
                <ClipboardList
                  size={16}
                  color={TOKENS.accent}
                  strokeWidth={2}
                />
                <Text style={styles.title}>Conferência de Inventário</Text>
              </View>
              <Text style={styles.subtitle}>
                {totalChecked} SKUs auditados · {discrepancies.length} com
                divergência
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              activeOpacity={0.78}
              onPress={onClose}
            >
              <X size={15} color={TOKENS.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Quick Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statPill}>
              <CheckCircle2
                size={13}
                color={TOKENS.pillPositiveInk}
                strokeWidth={2}
              />
              <Text style={styles.statPillText}>
                {matchedCount} exatos
              </Text>
            </View>

            <View
              style={[
                styles.statPill,
                discrepancies.length > 0 && styles.statPillWarning,
              ]}
            >
              <AlertTriangle
                size={13}
                color={
                  discrepancies.length > 0
                    ? TOKENS.pillWarningInk
                    : TOKENS.mutedFg
                }
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.statPillText,
                  discrepancies.length > 0 && styles.statPillWarningText,
                ]}
              >
                {discrepancies.length} divergentes
              </Text>
            </View>
          </View>

          {/* List of checked SKUs */}
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id || item.barcode)}
            renderItem={renderDiscrepancyItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={() => (
              <Text style={styles.emptyText}>
                Nenhum item registrado nesta conferência.
              </Text>
            )}
          />

          {/* Footer Actions */}
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              activeOpacity={0.8}
              onPress={onClose}
            >
              <Text style={styles.cancelBtnText}>Fechar</Text>
            </TouchableOpacity>

            {typeof onApplyStockAdjustment === 'function' &&
              discrepancies.length > 0 && (
                <TouchableOpacity
                  style={styles.applyBtn}
                  activeOpacity={0.85}
                  onPress={onApplyStockAdjustment}
                >
                  <Check size={15} color={TOKENS.ground} strokeWidth={2.25} />
                  <Text style={styles.applyBtnText}>
                    Ajustar Saldo ({discrepancies.length})
                  </Text>
                </TouchableOpacity>
              )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const AuditDiscrepancyModal = memo(AuditDiscrepancyModalComponent);
export default AuditDiscrepancyModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    padding: 16,
  },
  dialogCard: {
    backgroundColor: TOKENS.surface,
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 16,
    maxHeight: '84%',
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 3,
  },
  headerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.input || '#09090b',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statPillText: {
    color: TOKENS.text,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statPillWarning: {
    borderColor: '#4d3810',
    backgroundColor: TOKENS.pillWarningBg,
  },
  statPillWarningText: {
    color: TOKENS.pillWarningInk,
  },
  listContent: {
    paddingVertical: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
  },
  itemLeftCol: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  itemMeta: {
    color: TOKENS.mutedFg || TOKENS.faint,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  diffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffBadgeExact: {
    backgroundColor: TOKENS.pillPositiveBg,
    borderColor: '#3f5713',
  },
  diffBadgeShortage: {
    backgroundColor: TOKENS.pillNegativeBg,
    borderColor: '#4d1e1e',
  },
  diffBadgeSurplus: {
    backgroundColor: TOKENS.pillWarningBg,
    borderColor: '#4d3810',
  },
  diffBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  diffTextExact: {
    color: TOKENS.pillPositiveInk,
  },
  diffTextShortage: {
    color: TOKENS.pillNegativeInk,
  },
  diffTextSurplus: {
    color: TOKENS.pillWarningInk,
  },
  separator: {
    height: 1,
    backgroundColor: TOKENS.border || '#27272a',
  },
  emptyText: {
    color: TOKENS.mutedFg || TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    textAlign: 'center',
    marginVertical: 18,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border || '#27272a',
  },
  cancelBtn: {
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: TOKENS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.text,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: TOKENS.ground,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
