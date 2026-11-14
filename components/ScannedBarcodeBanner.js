import { memo, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Barcode, X } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Banner Memoizado de Código de Barras Escaneado no Perfil Business (EAN / UPC / Code128 / QR)
 * Estilo shadcn/ui + 21st.dev dark: superfície #222a10 com borda 1px #3f5713 e micro-interação 60 FPS.
 */
function ScannedBarcodeBannerComponent({
  barcode,
  matchedExistingItem,
  onDismiss,
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    if (barcode) {
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
  }, [barcode, fadeAnim, slideAnim]);

  if (!barcode) return null;

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
          <Barcode size={15} color={TOKENS.pillPositiveInk} strokeWidth={1.75} />
        </View>
        <View style={styles.scannedBarcodeTextCol}>
          <Text style={styles.scannedBarcodeText} numberOfLines={1}>
            Código: {barcode}
          </Text>
          {matchedExistingItem ? (
            <Text style={styles.scannedBarcodeSubtext}>
              SKU já cadastrado ({matchedExistingItem.quantity} un. em estoque).
              Defina quanto somar abaixo e toque em Salvar.
            </Text>
          ) : (
            <Text style={styles.scannedBarcodeSubtext}>
              Novo SKU lido. Informe o nome, quantidade, local e salve.
            </Text>
          )}
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

const ScannedBarcodeBanner = memo(ScannedBarcodeBannerComponent);
export default ScannedBarcodeBanner;

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
  scannedBarcodeText: {
    color: TOKENS.pillPositiveInk,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
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
