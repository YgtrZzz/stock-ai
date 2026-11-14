import { memo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Download } from 'lucide-react-native';
import { TOKENS as SYSTEM_TOKENS } from '../utils/designTokens';
import { generateAndShareInventoryCSV } from '../utils/exportCsv';

/**
 * Tokens shadcn zinc dark compatíveis com true-black-flat:
 * - Mantém surface: '#111111' literal exigido pelos testes.
 * - Estrutura shadcn card button com borda 1px #27272a e badge de formato tabular.
 * - Zero emojis; algarismos tabulares em todos os contadores.
 */
const TOKENS = {
  ...SYSTEM_TOKENS,
  ground: '#000000',
  surface: '#111111',
  raised: '#2a2a2a',
  border: SYSTEM_TOKENS?.border || '#27272a',
  borderStrong: SYSTEM_TOKENS?.borderStrong || '#3f3f46',
  cardElevated: SYSTEM_TOKENS?.cardElevated || '#18181b',
  mutedFg: SYSTEM_TOKENS?.mutedFg || '#a1a1aa',
  text: '#ffffff',
  muted: '#b4b4b4',
  faint: '#949494',
  accent: '#c6f24e',
  pillPositiveBg: '#222a10',
  pillPositiveInk: '#c6f24e',
  radiusCard: 14,
  radiusControl: 999,
  controlHeight: 44,
  fsBody: 14,
  fsSmall: 12,
};

function ExportButtonComponent({
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
  const pressingRef = useRef(false);
  const safeCount = Number.isFinite(Number(itemCount)) ? Number(itemCount) : 0;
  const safeUnits = Number.isFinite(Number(totalUnits))
    ? Number(totalUnits)
    : 0;
  const isBusy = Boolean(loading || internalLoading);
  const isDisabled = Boolean(disabled || isBusy || safeCount === 0);

  const handlePress = async () => {
    if (isDisabled || pressingRef.current) return;

    pressingRef.current = true;
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
      pressingRef.current = false;
      setInternalLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.exportButton, isDisabled && styles.buttonDisabled]}
        activeOpacity={0.78}
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

const ExportButton = memo(ExportButtonComponent);
export default ExportButton;

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.surface,
    borderWidth: 1,
    borderColor: TOKENS.border,
    minHeight: TOKENS.controlHeight,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
    borderRadius: 10,
    backgroundColor: TOKENS.cardElevated,
    borderWidth: 1,
    borderColor: TOKENS.borderStrong,
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
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  buttonSubtext: {
    color: TOKENS.mutedFg,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  formatPill: {
    backgroundColor: TOKENS.pillPositiveBg,
    borderWidth: 1,
    borderColor: '#3f5713',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  formatPillText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
