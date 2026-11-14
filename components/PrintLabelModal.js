import React, { memo, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  FileText,
  Minus,
  Plus,
  Printer,
  Share2,
  Tag,
  X,
} from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';
import {
  generateCode128SvgPattern,
  generateInternalBarcode,
} from '../utils/labelGenerator';

/**
 * Modal de Pré-visualização & Geração de Etiquetas Adesivas Físicas (Smart Label & Tag Generator).
 * Suporta formatos Térmica 50x30mm e Folha A4, seletor de cópias e impressão/compartilhamento.
 */
function PrintLabelModalComponent({
  visible = false,
  item = null, // { id, name, barcode, space_name, quantity, min_quantity }
  onClose,
  onPrintOrShare,
  printing = false,
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets?.bottom ?? 0, 16);
  const topInset = Math.max(insets?.top ?? 0, 16);

  const [labelFormat, setLabelFormat] = useState('thermal'); // 'thermal' (50x30mm) | 'a4' (Grade 21 un)
  const [copies, setCopies] = useState(1);

  const barcodeData =
    item?.barcode || generateInternalBarcode(item?.id || 1);
  const barcodePattern = useMemo(
    () => generateCode128SvgPattern(barcodeData, { barWidth: 2, height: 40 }),
    [barcodeData]
  );

  if (!item) return null;

  const handleAdjustCopies = (delta) => {
    setCopies((prev) => Math.max(1, Math.min(100, prev + delta)));
  };

  const handleExecutePrint = () => {
    onPrintOrShare?.({
      item,
      barcode: barcodeData,
      format: labelFormat,
      copies,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: topInset,
            paddingBottom: bottomInset,
          },
        ]}
      >
        <View style={styles.dialogCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleCol}>
              <View style={styles.titleIconRow}>
                <Tag size={16} color={TOKENS.accent} strokeWidth={2} />
                <Text style={styles.title}>Etiqueta Inteligente</Text>
              </View>
              <Text style={styles.subtitle}>
                Gere tags adesivas para prateleiras, gavetas e caixas
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

          {/* Label Preview Card (Simulação fiel de Papel Térmico / Adesivo Branco) */}
          <View style={styles.previewContainer}>
            <View
              style={[
                styles.thermalLabelSheet,
                labelFormat === 'a4' && styles.a4LabelSheetPreview,
              ]}
            >
              {/* Top Row da Etiqueta: Nome do SKU e Badge de Espaço */}
              <View style={styles.labelHeaderRow}>
                <Text style={styles.labelItemName} numberOfLines={2}>
                  {item.name || 'Produto sem nome'}
                </Text>
                {item.space_name ? (
                  <View style={styles.labelSpaceBadge}>
                    <Text style={styles.labelSpaceBadgeText} numberOfLines={1}>
                      {item.space_name}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Centro da Etiqueta: Código de Barras Vetorial SVG */}
              <View style={styles.barcodeSvgContainer}>
                <Svg
                  width="100%"
                  height={barcodePattern.barHeight}
                  viewBox={`0 0 ${barcodePattern.totalWidth} ${barcodePattern.barHeight}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {barcodePattern.bars.map((bar, idx) => (
                    <Rect
                      key={idx}
                      x={bar.x}
                      y={0}
                      width={bar.w}
                      height={barcodePattern.barHeight}
                      fill="#000000"
                    />
                  ))}
                </Svg>
                <Text style={styles.humanReadableBarcodeText}>
                  {barcodeData}
                </Text>
              </View>

              {/* Rodapé da Etiqueta: Saldo e Carimbo do Sistema */}
              <View style={styles.labelFooterRow}>
                <Text style={styles.labelFooterMeta}>
                  QTD: {item.quantity || 0} un.
                  {item.min_quantity ? ` · MIN: ${item.min_quantity}` : ''}
                </Text>
                <Text style={styles.labelBrandTag}>ARMÁRIO DIGITAL</Text>
              </View>
            </View>
          </View>

          {/* Formato da Etiqueta (Segmented Control compacto) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Formato de Impressão:</Text>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[
                  styles.segmentedOption,
                  labelFormat === 'thermal' && styles.segmentedOptionActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setLabelFormat('thermal')}
              >
                <Tag
                  size={12}
                  color={
                    labelFormat === 'thermal' ? TOKENS.ground : TOKENS.text
                  }
                  strokeWidth={2}
                />
                <Text
                  style={[
                    styles.segmentedOptionText,
                    labelFormat === 'thermal' &&
                      styles.segmentedOptionTextActive,
                  ]}
                >
                  Térmica 50x30mm
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentedOption,
                  labelFormat === 'a4' && styles.segmentedOptionActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setLabelFormat('a4')}
              >
                <FileText
                  size={12}
                  color={labelFormat === 'a4' ? TOKENS.ground : TOKENS.text}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    styles.segmentedOptionText,
                    labelFormat === 'a4' && styles.segmentedOptionTextActive,
                  ]}
                >
                  Folha A4 (Grade 21)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quantidade de Cópias (Stepper Control) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Cópias a imprimir:</Text>
            <View style={styles.stepperRow}>
              <View style={styles.stepperControlsGroup}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  activeOpacity={0.78}
                  onPress={() => handleAdjustCopies(-1)}
                  disabled={copies <= 1}
                >
                  <Minus size={14} color={TOKENS.text} strokeWidth={2} />
                </TouchableOpacity>

                <View style={styles.stepperValueBox}>
                  <Text style={styles.stepperValueText}>{copies}</Text>
                </View>

                <TouchableOpacity
                  style={styles.stepperBtn}
                  activeOpacity={0.78}
                  onPress={() => handleAdjustCopies(1)}
                >
                  <Plus size={14} color={TOKENS.text} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <View style={styles.quickBatchPillsRow}>
                {[1, 5, 10, 20].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.quickBatchPill,
                      copies === num && styles.quickBatchPillActive,
                    ]}
                    activeOpacity={0.78}
                    onPress={() => setCopies(num)}
                  >
                    <Text
                      style={[
                        styles.quickBatchPillText,
                        copies === num && styles.quickBatchPillTextActive,
                      ]}
                    >
                      {num} un.
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Rodapé de Ações */}
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              activeOpacity={0.8}
              onPress={onClose}
              disabled={printing}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.printBtn,
                printing && styles.controlDisabled,
              ]}
              activeOpacity={0.85}
              onPress={handleExecutePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color={TOKENS.ground} />
              ) : (
                <View style={styles.btnContentRow}>
                  <Printer size={15} color={TOKENS.ground} strokeWidth={2.25} />
                  <Text style={styles.printBtnText}>
                    Imprimir / Compartilhar ({copies})
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const PrintLabelModal = memo(PrintLabelModalComponent);
export default PrintLabelModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dialogCard: {
    backgroundColor: TOKENS.surface,
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 16,
    maxHeight: '90%',
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  titleIconRow: {
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
  previewContainer: {
    backgroundColor: '#0a0a0c',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thermalLabelSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    width: '100%',
    maxWidth: 320,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  a4LabelSheetPreview: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#999999',
  },
  labelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  labelItemName: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    letterSpacing: -0.2,
  },
  labelSpaceBadge: {
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelSpaceBadgeText: {
    color: '#18181b',
    fontSize: 10,
    fontWeight: '600',
  },
  barcodeSvgContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  humanReadableBarcodeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  labelFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    paddingTop: 6,
  },
  labelFooterMeta: {
    color: '#52525b',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  labelBrandTag: {
    color: '#a1a1aa',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionBlock: {
    gap: 6,
  },
  sectionLabel: {
    color: TOKENS.mutedFg || TOKENS.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.input || '#09090b',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  segmentedOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 6,
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
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stepperControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueBox: {
    minWidth: 44,
    height: 34,
    borderRadius: 8,
    backgroundColor: TOKENS.input || '#09090b',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  stepperValueText: {
    color: TOKENS.text,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  quickBatchPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickBatchPill: {
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickBatchPillActive: {
    borderColor: TOKENS.accent,
    backgroundColor: TOKENS.pillPositiveBg,
  },
  quickBatchPillText: {
    color: TOKENS.text,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  quickBatchPillTextActive: {
    color: TOKENS.accent,
    fontWeight: '700',
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
  printBtn: {
    backgroundColor: TOKENS.text,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  printBtnText: {
    color: TOKENS.ground,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  controlDisabled: {
    opacity: 0.35,
  },
});
