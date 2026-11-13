import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Download } from 'lucide-react-native';
import { generateAndShareInventoryCSV } from '../utils/exportCsv';

/**
 * Tokens estritos 'true-black-flat' (design-taste-frontend):
 * - Ground #000000, Surface #111111, Raised #2a2a2a
 * - Texto e ícone em #ffffff sobre superfície #111111
 * - Marca de dados em #c6f24e sobre pílula #222a10 com algarismos tabulares ('tabular-nums')
 * - Zero emojis; sem sombras ou bordas decorativas
 */
const TOKENS = {
  ground: '#000000',
  surface: '#111111',
  raised: '#2a2a2a',
  text: '#ffffff',
  muted: '#b4b4b4',
  faint: '#949494',
  accent: '#c6f24e',
  pillPositiveBg: '#222a10',
  pillPositiveInk: '#c6f24e',
  radiusCard: 20,
  radiusControl: 999,
  controlHeight: 44,
  fsBody: 14,
  fsSmall: 12,
};

/**
 * Botão nativo B2B 'Exportar Relatório CSV' inspirado na anatomia de Export/Download Button
 * do Shadcn UI React Native e 21st.dev, adaptado estritamente ao sistema 'true-black-flat'.
 */
export default function ExportButton({
  items = [],
  spaces = [],
  itemCount = 0,
  totalUnits = 0,
  loading = false,
  disabled = false,
  label = 'Exportar Relatório CSV',
  loadingLabel = 'Exportando CSV...',
  onPress,
}) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isBusy = Boolean(loading || internalLoading);
  const isDisabled = Boolean(disabled || isBusy);

  const handlePress = async () => {
    if (isDisabled) return;

    setInternalLoading(true);
    try {
      if (typeof onPress === 'function') {
        await onPress();
      } else {
        await generateAndShareInventoryCSV(items, spaces);
      }
    } catch (error) {
      console.error('Erro ao exportar relatório CSV:', error);
      Alert.alert(
        'Erro na exportação',
        'Não foi possível gerar ou compartilhar o relatório CSV.'
      );
    } finally {
      setInternalLoading(false);
    }
  };

  const safeCount = Number.isFinite(Number(itemCount)) ? Number(itemCount) : 0;
  const safeUnits = Number.isFinite(Number(totalUnits))
    ? Number(totalUnits)
    : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.exportButton, isDisabled && styles.buttonDisabled]}
        activeOpacity={0.82}
        onPress={handlePress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: isBusy }}
      >
        <View style={styles.leftContent}>
          <View style={styles.iconSlot}>
            {isBusy ? (
              <ActivityIndicator size="small" color={TOKENS.text} />
            ) : (
              <Download size={16} color={TOKENS.text} strokeWidth={1.75} />
            )}
          </View>

          <View style={styles.textColumn}>
            <Text style={styles.buttonLabel} numberOfLines={1}>
              {isBusy ? loadingLabel : label}
            </Text>
            <Text style={styles.buttonSubtext} numberOfLines={1}>
              {safeCount} {safeCount === 1 ? 'SKU' : 'SKUs'} · {safeUnits}{' '}
              {safeUnits === 1 ? 'un.' : 'uns.'}
            </Text>
          </View>
        </View>

        <View style={styles.formatPill}>
          <Text style={styles.formatPillText}>CSV · {safeCount}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.surface,
    minHeight: TOKENS.controlHeight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: TOKENS.radiusCard,
    gap: 12,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  leftContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconSlot: {
    width: 36,
    height: 36,
    borderRadius: TOKENS.radiusControl,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  buttonLabel: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  buttonSubtext: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  formatPill: {
    backgroundColor: TOKENS.pillPositiveBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TOKENS.radiusControl,
  },
  formatPillText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
