import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Barcode, X } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Banner Memoizado de Código de Barras Escaneado no Perfil Business (EAN / UPC / Code128 / QR)
 */
function ScannedBarcodeBannerComponent({
  barcode,
  matchedExistingItem,
  onDismiss,
}) {
  if (!barcode) return null;

  return (
    <View style={styles.scannedBarcodeBanner}>
      <View style={styles.scannedBarcodeLeft}>
        <Barcode size={16} color={TOKENS.pillPositiveInk} strokeWidth={1.5} />
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
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={16} color={TOKENS.pillPositiveInk} strokeWidth={1.5} />
      </TouchableOpacity>
    </View>
  );
}

const ScannedBarcodeBanner = memo(ScannedBarcodeBannerComponent);
export default ScannedBarcodeBanner;

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
