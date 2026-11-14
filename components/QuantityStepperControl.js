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
 * Evita re-renderização ao digitar o nome do produto no Passo 1.
 */
function QuantityStepperControlComponent({
  quantity,
  onChangeQuantity,
  onAdjustQuantity,
  onAddBatch,
  disabled = false,
}) {
  return (
    <View>
      <View style={styles.qtyStepperRow}>
        <TouchableOpacity
          style={styles.qtyStepButton}
          activeOpacity={0.78}
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
          <Plus size={18} color={TOKENS.ground} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.batchControlsRow}>
        <Text style={styles.batchLabel}>Atalhos de qtd:</Text>
        <View style={styles.batchPillsGroup}>
          {LOTES_RAPIDOS_B2B.map((valor) => (
            <TouchableOpacity
              key={valor}
              style={styles.batchPill}
              activeOpacity={0.78}
              onPress={() => onAddBatch(valor)}
              disabled={disabled}
            >
              <Text style={styles.batchPillText}>+{valor}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.batchPillReset}
            activeOpacity={0.78}
            onPress={() => onChangeQuantity('1')}
            disabled={disabled}
          >
            <Text style={styles.batchPillResetText}>1 un.</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const QuantityStepperControl = memo(QuantityStepperControlComponent);
export default QuantityStepperControl;

const styles = StyleSheet.create({
  input: {
    backgroundColor: TOKENS.surfaceAlt,
    borderWidth: 1,
    borderColor: TOKENS.rule,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: TOKENS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyStepButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: TOKENS.surfaceAlt,
    borderWidth: 1,
    borderColor: TOKENS.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyStepButtonPrimary: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: TOKENS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyStepperInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: 11,
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
    color: TOKENS.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  batchPillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchPill: {
    backgroundColor: TOKENS.surfaceAlt,
    borderWidth: 1,
    borderColor: TOKENS.rule,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  batchPillText: {
    color: TOKENS.text,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  batchPillReset: {
    backgroundColor: TOKENS.ground,
    borderWidth: 1,
    borderColor: TOKENS.rule,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  batchPillResetText: {
    color: TOKENS.muted,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
