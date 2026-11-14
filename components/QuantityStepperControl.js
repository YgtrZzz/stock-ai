import { memo } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

const LOTES_RAPIDOS_B2B = [1, 5, 10, 25];

/**
 * Controle Memoizado de Passo 2 (Quantidade + Atalhos de Lote Rápido)
 * Estética shadcn/ui v4 + 21st.dev Magic Dark: input inset #09090b com borda 1px #27272a e pílulas táticas.
 */
function QuantityStepperControlComponent({
  quantity,
  onChangeQuantity,
  onAdjustQuantity,
  onAddBatch,
  disabled = false,
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.qtyStepperRow}>
        <TouchableOpacity
          style={styles.qtyStepButton}
          activeOpacity={0.75}
          onPress={() => onAdjustQuantity(-1)}
          disabled={disabled}
        >
          <Minus size={18} color={TOKENS.text} strokeWidth={1.75} />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, styles.qtyStepperInput]}
          value={quantity}
          onChangeText={(txt) => onChangeQuantity(txt.replace(/[^0-9]/g, ''))}
          placeholder="1"
          placeholderTextColor={TOKENS.faint}
          keyboardType="numeric"
          maxLength={5}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          editable={!disabled}
        />

        <TouchableOpacity
          style={styles.qtyStepButtonPrimary}
          activeOpacity={0.8}
          onPress={() => onAdjustQuantity(1)}
          disabled={disabled}
        >
          <Plus size={18} color={TOKENS.ground} strokeWidth={2.25} />
        </TouchableOpacity>
      </View>

      <View style={styles.batchControlsRow}>
        <Text style={styles.batchLabel}>Lote rápido</Text>
        <View style={styles.batchPillsGroup}>
          {LOTES_RAPIDOS_B2B.map((valor) => (
            <TouchableOpacity
              key={valor}
              style={styles.batchPill}
              activeOpacity={0.75}
              onPress={() => onAddBatch(valor)}
              disabled={disabled}
            >
              <Text style={styles.batchPillText}>+{valor}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.batchPillReset}
            activeOpacity={0.75}
            onPress={() => onChangeQuantity('1')}
            disabled={disabled}
          >
            <Text style={styles.batchPillResetText}>Reset (1)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const QuantityStepperControl = memo(QuantityStepperControlComponent);
export default QuantityStepperControl;

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: TOKENS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyStepButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyStepButtonPrimary: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: TOKENS.accent,
    borderWidth: 1,
    borderColor: '#d8f870',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyStepperInput: {
    flex: 1,
    height: 46,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },
  batchControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  batchLabel: {
    color: TOKENS.faint,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  batchPillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchPill: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  batchPillText: {
    color: TOKENS.text,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  batchPillReset: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  batchPillResetText: {
    color: TOKENS.muted,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
