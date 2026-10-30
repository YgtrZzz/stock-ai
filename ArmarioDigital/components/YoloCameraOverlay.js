import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Check, Layers, Package, Plus } from 'lucide-react-native';
import {
  normalizeDetections,
  projectBoundingBoxToViewport,
  summarizeDetectionsForProfile,
} from '../vision/yoloAdapter';

/**
 * Tokens estritos 'true-black-flat' (design-taste-frontend):
 * - Ground #000000, Surface #111111, Raised #2a2a2a, Rule #161616
 * - Accent #c6f24e restrito às marcas de dados (bounding boxes, percentuais de confiança e contagem)
 * - Zero emojis; algarismos tabulares ('tabular-nums') em todos os contadores e percentuais
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
  pillNeutralBg: '#222222',
  pillNeutralInk: '#ffffff',
  radiusCard: 20,
  radiusControl: 999,
  fsBody: 14,
  fsSmall: 12,
};

/**
 * Componente nativo de sobreposição vetorial para renderização de Bounding Boxes YOLO (.tflite)
 * e barra de ação adaptativa por perfil ('home' vs 'business').
 */
export default function YoloCameraOverlay({
  detections = [],
  userProfile = 'home',
  onApplySuggestion,
}) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const normalized = normalizeDetections(detections);
  const summary = summarizeDetectionsForProfile(normalized, userProfile);
  const isBusiness = summary.profile === 'business';

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== viewport.width || height !== viewport.height) {
      setViewport({ width, height });
    }
  };

  if (!summary.hasDetections) {
    return null;
  }

  const primaryPercent = Math.round(summary.primaryConfidence * 100);

  return (
    <View
      style={styles.overlayRoot}
      onLayout={handleLayout}
      pointerEvents="box-none"
    >
      {/* Camada Vetorial SVG: Desenha as Bounding Boxes em #c6f24e */}
      {viewport.width > 0 && viewport.height > 0 && (
        <View style={styles.svgLayer} pointerEvents="none">
          <Svg width={viewport.width} height={viewport.height}>
            {normalized.map((det) => {
              const box = projectBoundingBoxToViewport(
                det.bbox,
                viewport.width,
                viewport.height
              );
              return (
                <Rect
                  key={det.id}
                  x={box.left}
                  y={box.top}
                  width={box.width}
                  height={box.height}
                  stroke={TOKENS.accent}
                  strokeWidth={2}
                  rx={8}
                  ry={8}
                  fill="rgba(198, 242, 78, 0.08)"
                />
              );
            })}
          </Svg>

          {/* Rótulos de classe e confiança ancorados no topo de cada Bounding Box */}
          {normalized.map((det) => {
            const box = projectBoundingBoxToViewport(
              det.bbox,
              viewport.width,
              viewport.height
            );
            const confPct = Math.round(det.confidence * 100);
            const badgeTop = Math.max(8, box.top - 28);

            return (
              <View
                key={`badge-${det.id}`}
                style={[
                  styles.bboxBadge,
                  {
                    left: Math.max(8, box.left),
                    top: badgeTop,
                  },
                ]}
              >
                <Text style={styles.bboxBadgeLabel} numberOfLines={1}>
                  {det.label}
                </Text>
                <Text style={styles.bboxBadgeConfidence}>{confPct}%</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Barra Inferior Adaptativa ('home': Classe Principal | 'business': Contagem de Lote) */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryInfoCol}>
          <View style={styles.summaryHeaderRow}>
            {isBusiness ? (
              <Layers
                size={14}
                color={TOKENS.pillPositiveInk}
                strokeWidth={1.75}
              />
            ) : (
              <Package
                size={14}
                color={TOKENS.pillPositiveInk}
                strokeWidth={1.75}
              />
            )}
            <Text style={styles.summaryModeText}>
              {isBusiness ? 'Contagem YOLO (Lote B2B)' : 'Objeto Identificado'}
            </Text>
          </View>

          {isBusiness ? (
            <View style={styles.summaryMetricRow}>
              <Text style={styles.summaryPrimaryText} numberOfLines={1}>
                {summary.dominantLabel}
              </Text>
              <View style={styles.dataCountPill}>
                <Text style={styles.dataCountPillText}>
                  {summary.totalDetected} un.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.summaryMetricRow}>
              <Text style={styles.summaryPrimaryText} numberOfLines={1}>
                {summary.primaryLabel}
              </Text>
              <View style={styles.dataCountPill}>
                <Text style={styles.dataCountPillText}>{primaryPercent}%</Text>
              </View>
            </View>
          )}
        </View>

        {typeof onApplySuggestion === 'function' && (
          <TouchableOpacity
            style={styles.applyInvertedPill}
            activeOpacity={0.85}
            onPress={() => onApplySuggestion(summary)}
          >
            {isBusiness ? (
              <Plus size={14} color={TOKENS.ground} strokeWidth={1.75} />
            ) : (
              <Check size={14} color={TOKENS.ground} strokeWidth={1.75} />
            )}
            <Text style={styles.applyInvertedPillText}>
              {isBusiness
                ? `Usar ${summary.suggestedQuantity} un.`
                : 'Usar nome'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  svgLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bboxBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.pillPositiveBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
    maxWidth: 220,
  },
  bboxBadgeLabel: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    flexShrink: 1,
  },
  bboxBadgeConfidence: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.surface,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: TOKENS.radiusCard,
    gap: 12,
  },
  summaryInfoCol: {
    flex: 1,
    gap: 4,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryModeText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  summaryMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryPrimaryText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
    flexShrink: 1,
  },
  dataCountPill: {
    backgroundColor: TOKENS.pillPositiveBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: TOKENS.radiusControl,
  },
  dataCountPillText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  applyInvertedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TOKENS.text,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  applyInvertedPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
