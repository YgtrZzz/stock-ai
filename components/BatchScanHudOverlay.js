import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ClipboardList,
  Layers,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Overlay HUD de Alta Performance para o Modo Scanner Contínuo (Bipagem Rápida B2B).
 * - Segmented Control de Modo Operacional (Entrada +1 | Saída -1 | Auditoria).
 * - Toast flutuante com feedback visual instantâneo animado a 60 FPS (useNativeDriver: true).
 * - Barra inferior (Session Dock) com telemetria de lote e botões de ação rápida.
 * - 100% compliant: true-black-flat, shadcn zinc dark, zero emojis, tabular-nums.
 */
function BatchScanHudOverlayComponent({
  enabled = false,
  onToggleEnabled,
  operationMode = 'in', // 'in' | 'out' | 'audit'
  onSelectOperationMode,
  lastScanFeedback = null, // { type: 'success'|'not_found'|'blocked', barcode, itemName, prevQty, newQty, delta, timestamp }
  sessionStats = { totalBips: 0, totalSkus: 0 },
  onResetSession,
  onFinishBatch,
  onOpenQuickCreate,
}) {
  const toastAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    if (lastScanFeedback?.timestamp) {
      toastAnim.setValue(0);
      slideAnim.setValue(-12);
      Animated.parallel([
        Animated.timing(toastAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 7,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [lastScanFeedback?.timestamp, toastAnim, slideAnim]);

  if (!enabled) {
    return (
      <View style={styles.disabledContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.enablePill}
          activeOpacity={0.82}
          onPress={onToggleEnabled}
        >
          <Zap size={14} color={TOKENS.accent} strokeWidth={2} />
          <Text style={styles.enablePillText}>Ativar Bipagem Contínua</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isSuccess = lastScanFeedback?.type === 'success';
  const isNotFound = lastScanFeedback?.type === 'not_found';
  const isBlocked = lastScanFeedback?.type === 'blocked';

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      {/* Top Bar: Toggle de Ativação e Segmented Control de Modo */}
      <View style={styles.topControlsRow} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.activeModeIndicator}
          activeOpacity={0.8}
          onPress={onToggleEnabled}
        >
          <View style={styles.pulseDot} />
          <Text style={styles.activeModeIndicatorText}>LOTE ATIVO</Text>
          <X size={13} color={TOKENS.text} strokeWidth={2} />
        </TouchableOpacity>

        <View style={styles.segmentedModeControl}>
          <TouchableOpacity
            style={[
              styles.segmentedOption,
              operationMode === 'in' && styles.segmentedOptionActive,
            ]}
            activeOpacity={0.75}
            onPress={() => onSelectOperationMode?.('in')}
          >
            <ArrowUpRight
              size={12}
              color={
                operationMode === 'in' ? TOKENS.ground : TOKENS.pillPositiveInk
              }
              strokeWidth={2}
            />
            <Text
              style={[
                styles.segmentedOptionText,
                operationMode === 'in' && styles.segmentedOptionTextActive,
              ]}
            >
              Entrada
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentedOption,
              operationMode === 'out' && styles.segmentedOptionActive,
            ]}
            activeOpacity={0.75}
            onPress={() => onSelectOperationMode?.('out')}
          >
            <ArrowDownRight
              size={12}
              color={
                operationMode === 'out' ? TOKENS.ground : TOKENS.pillNegativeInk
              }
              strokeWidth={2}
            />
            <Text
              style={[
                styles.segmentedOptionText,
                operationMode === 'out' && styles.segmentedOptionTextActive,
              ]}
            >
              Saída
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentedOption,
              operationMode === 'audit' && styles.segmentedOptionActive,
            ]}
            activeOpacity={0.75}
            onPress={() => onSelectOperationMode?.('audit')}
          >
            <ClipboardList
              size={12}
              color={
                operationMode === 'audit' ? TOKENS.ground : TOKENS.text
              }
              strokeWidth={2}
            />
            <Text
              style={[
                styles.segmentedOptionText,
                operationMode === 'audit' && styles.segmentedOptionTextActive,
              ]}
            >
              Auditoria
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating HUD Feedback Toast (animado no centro superior da mira óptica) */}
      {lastScanFeedback && (
        <Animated.View
          style={[
            styles.feedbackToast,
            isSuccess && styles.toastSuccess,
            isNotFound && styles.toastNotFound,
            isBlocked && styles.toastBlocked,
            {
              opacity: toastAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.toastLeft}>
            <View
              style={[
                styles.toastIconSlot,
                isSuccess && styles.toastIconSuccess,
                isNotFound && styles.toastIconNotFound,
                isBlocked && styles.toastIconBlocked,
              ]}
            >
              {isSuccess && (
                <Check
                  size={14}
                  color={TOKENS.pillPositiveInk}
                  strokeWidth={2.25}
                />
              )}
              {isNotFound && (
                <AlertTriangle
                  size={14}
                  color={TOKENS.pillWarningInk}
                  strokeWidth={2}
                />
              )}
              {isBlocked && (
                <X size={14} color={TOKENS.pillNegativeInk} strokeWidth={2} />
              )}
            </View>

            <View style={styles.toastTextCol}>
              <Text style={styles.toastTitle} numberOfLines={1}>
                {isSuccess
                  ? lastScanFeedback.itemName
                  : isNotFound
                    ? `Código ${lastScanFeedback.barcode || ''}`
                    : 'Ação Bloqueada'}
              </Text>
              <Text style={styles.toastSubtitle} numberOfLines={1}>
                {isSuccess
                  ? `${lastScanFeedback.prevQty} un. → ${lastScanFeedback.newQty} un. (${lastScanFeedback.delta > 0 ? `+${lastScanFeedback.delta}` : lastScanFeedback.delta})`
                  : isNotFound
                    ? 'SKU não cadastrado no catálogo'
                    : 'Item sem saldo suficiente para baixa'}
              </Text>
            </View>
          </View>

          {isNotFound && typeof onOpenQuickCreate === 'function' && (
            <TouchableOpacity
              style={styles.toastActionBtn}
              activeOpacity={0.8}
              onPress={() => onOpenQuickCreate(lastScanFeedback.barcode)}
            >
              <Text style={styles.toastActionBtnText}>Cadastrar</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Bottom Floating Session Dock */}
      <View style={styles.sessionDock} pointerEvents="auto">
        <View style={styles.dockStatsCol}>
          <View style={styles.dockStatsRow}>
            <Layers size={14} color={TOKENS.accent} strokeWidth={1.75} />
            <Text style={styles.dockStatsLabel}>Lote em Andamento:</Text>
          </View>
          <Text style={styles.dockStatsValues}>
            {sessionStats.totalBips}{' '}
            {sessionStats.totalBips === 1 ? 'bip' : 'bips'} ·{' '}
            {sessionStats.totalSkus} SKUs
          </Text>
        </View>

        <View style={styles.dockActionsRow}>
          <TouchableOpacity
            style={styles.dockResetBtn}
            activeOpacity={0.78}
            onPress={onResetSession}
          >
            <RotateCcw size={14} color={TOKENS.text} strokeWidth={1.75} />
            <Text style={styles.dockResetBtnText}>Limpar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockFinishBtn}
            activeOpacity={0.82}
            onPress={onFinishBatch}
          >
            <Check size={14} color={TOKENS.ground} strokeWidth={2.25} />
            <Text style={styles.dockFinishBtnText}>
              {operationMode === 'audit' ? 'Conferir' : 'Concluir'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const BatchScanHudOverlay = memo(BatchScanHudOverlayComponent);
export default BatchScanHudOverlay;

const styles = StyleSheet.create({
  disabledContainer: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 20,
  },
  enablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 17, 17, 0.92)',
    borderWidth: 1,
    borderColor: '#3f5713',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  enablePillText: {
    color: TOKENS.accent,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 17, 17, 0.94)',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: TOKENS.accent,
  },
  activeModeIndicatorText: {
    color: TOKENS.text,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  segmentedModeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 9, 11, 0.92)',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  segmentedOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  segmentedOptionActive: {
    backgroundColor: TOKENS.text,
  },
  segmentedOptionText: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  segmentedOptionTextActive: {
    color: TOKENS.ground,
    fontWeight: '700',
  },
  feedbackToast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17, 17, 17, 0.95)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignSelf: 'center',
    width: '96%',
    maxWidth: 420,
    gap: 8,
  },
  toastSuccess: {
    borderColor: '#3f5713',
  },
  toastNotFound: {
    borderColor: '#4d3810',
  },
  toastBlocked: {
    borderColor: '#4d1e1e',
  },
  toastLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  toastIconSlot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIconSuccess: {
    backgroundColor: TOKENS.pillPositiveBg,
    borderWidth: 1,
    borderColor: '#3f5713',
  },
  toastIconNotFound: {
    backgroundColor: TOKENS.pillWarningBg,
    borderWidth: 1,
    borderColor: '#4d3810',
  },
  toastIconBlocked: {
    backgroundColor: TOKENS.pillNegativeBg,
    borderWidth: 1,
    borderColor: '#4d1e1e',
  },
  toastTextCol: {
    flex: 1,
    gap: 1,
  },
  toastTitle: {
    color: TOKENS.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  toastSubtitle: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  toastActionBtn: {
    backgroundColor: TOKENS.text,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toastActionBtnText: {
    color: TOKENS.ground,
    fontSize: 11,
    fontWeight: '700',
  },
  sessionDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17, 17, 17, 0.94)',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  dockStatsCol: {
    flex: 1,
    gap: 1,
  },
  dockStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dockStatsLabel: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: 11,
    fontWeight: '500',
  },
  dockStatsValues: {
    color: TOKENS.text,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dockActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dockResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  dockResetBtnText: {
    color: TOKENS.text,
    fontSize: 11,
    fontWeight: '600',
  },
  dockFinishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.text,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  dockFinishBtnText: {
    color: TOKENS.ground,
    fontSize: 11,
    fontWeight: '700',
  },
});
