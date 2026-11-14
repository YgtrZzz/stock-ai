import { memo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MapPin } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Formata o nome hierárquico de um espaço ("Pai / Filho" ou "Nome").
 */
export function formatSpaceHierarchyName(espaco) {
  if (!espaco) return '';
  return espaco.parent_name
    ? `${espaco.parent_name} / ${espaco.name}`
    : espaco.name;
}

/**
 * Seletor Horizontal Memoizado de Locais de Armazenagem (Passo 3 do Scanner)
 */
function SpaceSelectorRowComponent({
  spaces = [],
  selectedSpaceId = null,
  onSelectSpace,
}) {
  if (!Array.isArray(spaces) || spaces.length === 0) {
    return (
      <View style={styles.noSpacesBox}>
        <Text style={styles.noSpacesText}>
          Nenhum espaço cadastrado. Crie locais na aba Espaços ou salve sem
          local.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.selectorRow}
    >
      <TouchableOpacity
        style={[
          styles.spaceChip,
          selectedSpaceId === null && styles.spaceChipActive,
        ]}
        activeOpacity={0.8}
        onPress={() => onSelectSpace(null)}
      >
        <Text
          style={[
            styles.spaceChipText,
            selectedSpaceId === null && styles.spaceChipTextActive,
          ]}
        >
          Sem local
        </Text>
      </TouchableOpacity>

      {spaces.map((espaco) => {
        const selecionado = selectedSpaceId === espaco.id;
        return (
          <TouchableOpacity
            key={espaco.id}
            style={[styles.spaceChip, selecionado && styles.spaceChipActive]}
            activeOpacity={0.8}
            onPress={() => onSelectSpace(espaco.id)}
          >
            <MapPin
              size={13}
              color={selecionado ? TOKENS.ground : TOKENS.muted}
              strokeWidth={1.5}
            />
            <Text
              style={[
                styles.spaceChipText,
                selecionado && styles.spaceChipTextActive,
              ]}
            >
              {formatSpaceHierarchyName(espaco)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const SpaceSelectorRow = memo(SpaceSelectorRowComponent);
export default SpaceSelectorRow;

const styles = StyleSheet.create({
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  spaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.surfaceAlt,
    borderWidth: 1,
    borderColor: TOKENS.rule,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  spaceChipActive: {
    backgroundColor: TOKENS.text,
    borderColor: TOKENS.text,
  },
  spaceChipText: {
    color: TOKENS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  spaceChipTextActive: {
    color: TOKENS.ground,
    fontWeight: '700',
  },
  noSpacesBox: {
    backgroundColor: TOKENS.surfaceAlt,
    borderWidth: 1,
    borderColor: TOKENS.rule,
    borderRadius: 12,
    padding: 12,
  },
  noSpacesText: {
    color: TOKENS.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
