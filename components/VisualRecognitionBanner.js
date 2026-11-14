import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Banner Memoizado de Reconhecimento Visual por Foto (Edge AI Visual Matcher v3)
 * Exibe o nome do item reconhecido, local, código e saldo com zero re-renders desnecessários.
 */
function VisualRecognitionBannerComponent({ match, onDismiss }) {
  if (!match?.item) return null;

  const { item } = match;
  return (
    <View style={styles.scannedBarcodeBanner}>
      <View style={styles.scannedBarcodeLeft}>
        <Check size={16} color={TOKENS.pillPositiveInk} strokeWidth={2} />
        <View style={styles.scannedBarcodeTextCol}>
          <Text style={styles.scannedBarcodeText} numberOfLines={1}>
            Item reconhecido pela foto: {item.name}
          </Text>
          <Text style={styles.scannedBarcodeSubtext}>
            Local: {item.space_name || 'Sem local'}
            {item.barcode ? ` · Código: ${item.barcode}` : ''} · Saldo:{' '}
            {item.quantity} un.
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={16} color={TOKENS.pillPositiveInk} strokeWidth={1.5} />
      </TouchableOpacity>
    </View>
  );
}

const VisualRecognitionBanner = memo(VisualRecognitionBannerComponent);
export default VisualRecognitionBanner;

const styles = StyleSheet.create({
  scannedBarcodeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.pillPositiveFill,
    borderWidth: 1,
    borderColor: '#3f5713',
    borderRadius: 12,
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
  scannedBarcodeTextCol: {
    flex: 1,
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
    marginTop: 2,
    opacity: 0.88,
    fontVariant: ['tabular-nums'],
  },
});
