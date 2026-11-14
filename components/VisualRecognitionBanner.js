import { memo, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Banner Memoizado de Reconhecimento Visual por Foto (Edge AI Visual Matcher v3)
 * Estilo shadcn/ui + 21st.dev dark: borda 1px sutil, pílula de confiança tabular e entrada fluida 60 FPS.
 */
function VisualRecognitionBannerComponent({ match, onDismiss }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    if (match?.item) {
      fadeAnim.setValue(0);
      slideAnim.setValue(-6);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 90,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [match?.item?.id, match?.similarity, match?.score, fadeAnim, slideAnim]);

  if (!match?.item) return null;

  const { item } = match;
  const rawScore = match.similarity ?? match.score;
  const confidencePct =
    typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? Math.round(rawScore * 100)
      : null;

  return (
    <Animated.View
      style={[
        styles.scannedBarcodeBanner,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.scannedBarcodeLeft}>
        <View style={styles.iconBadge}>
          <Check size={15} color={TOKENS.pillPositiveInk} strokeWidth={2.25} />
        </View>
        <View style={styles.scannedBarcodeTextCol}>
          <View style={styles.titleRow}>
            <Text style={styles.scannedBarcodeText} numberOfLines={1}>
              Item reconhecido pela foto: {item.name}
            </Text>
            {confidencePct !== null && (
              <View style={styles.scorePill}>
                <Text style={styles.scorePillText}>{confidencePct}%</Text>
              </View>
            )}
          </View>
          <Text style={styles.scannedBarcodeSubtext}>
            Local: {item.space_name || 'Sem local'}
            {item.barcode ? ` · Código: ${item.barcode}` : ''} · Saldo:{' '}
            {item.quantity} un.
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={onDismiss}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={15} color={TOKENS.pillPositiveInk} strokeWidth={1.75} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const VisualRecognitionBanner = memo(VisualRecognitionBannerComponent);
export default VisualRecognitionBanner;

const styles = StyleSheet.create({
  scannedBarcodeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.pillPositiveBg,
    borderWidth: 1,
    borderColor: '#3f5713',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 10,
  },
  scannedBarcodeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: TOKENS.radiusControl,
    backgroundColor: '#2f3b14',
    borderWidth: 1,
    borderColor: '#3f5713',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedBarcodeTextCol: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scannedBarcodeText: {
    flex: 1,
    color: TOKENS.pillPositiveInk,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  scorePill: {
    backgroundColor: '#2f3b14',
    borderWidth: 1,
    borderColor: '#3f5713',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: TOKENS.radiusControl,
  },
  scorePillText: {
    color: TOKENS.pillPositiveInk,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scannedBarcodeSubtext: {
    color: TOKENS.pillPositiveInk,
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.9,
    fontVariant: ['tabular-nums'],
  },
  dismissButton: {
    width: 26,
    height: 26,
    borderRadius: TOKENS.radiusControl,
    backgroundColor: '#2f3b14',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
