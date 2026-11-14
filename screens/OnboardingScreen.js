import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Building2, ChevronRight, Home } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Tela de Onboarding Inicial memoizada (React.memo) para escolha do Perfil Operacional
 * ('home' vs 'business'), seguindo estritamente os tokens 'true-black-flat'.
 */
function OnboardingScreen({ onSelectProfile }) {
  return (
    <View style={styles.onboardingScreen}>
      <StatusBar style="light" />
      <View style={styles.onboardingContent}>
        <Text style={styles.onboardingBrand}>Armário Digital</Text>
        <Text style={styles.onboardingTitle}>
          Como você vai usar o aplicativo?
        </Text>
        <Text style={styles.onboardingSubtitle}>
          A experiência se adapta automaticamente ao seu fluxo de trabalho. Você
          poderá alternar o modo a qualquer momento no topo da tela.
        </Text>

        <View style={styles.onboardingCardsGroup}>
          <TouchableOpacity
            style={styles.onboardingCard}
            activeOpacity={0.82}
            onPress={() => onSelectProfile('home')}
          >
            <View style={styles.onboardingCardHeader}>
              <Home size={22} color={TOKENS.text} strokeWidth={1.5} />
              <View style={styles.onboardingModePill}>
                <Text style={styles.onboardingModePillText}>Uso Pessoal</Text>
              </View>
            </View>
            <Text style={styles.onboardingCardTitle}>Para minha Casa</Text>
            <Text style={styles.onboardingCardDesc}>
              Organização visual por cômodos, armários e gavetas. Foco em
              fotografar e encontrar rapidamente seus pertences domésticos.
            </Text>
            <View style={styles.onboardingActionRow}>
              <View style={styles.primaryInvertedPill}>
                <View style={styles.buttonContentRow}>
                  <Text style={styles.primaryInvertedPillText}>
                    Entrar no Modo Casa
                  </Text>
                  <ChevronRight
                    size={16}
                    color={TOKENS.ground}
                    strokeWidth={1.75}
                  />
                </View>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.onboardingCard}
            activeOpacity={0.82}
            onPress={() => onSelectProfile('business')}
          >
            <View style={styles.onboardingCardHeader}>
              <Building2 size={22} color={TOKENS.accent} strokeWidth={1.5} />
              <View style={styles.onboardingModePillAccent}>
                <Text style={styles.onboardingModePillAccentText}>
                  Estoque B2B
                </Text>
              </View>
            </View>
            <Text style={styles.onboardingCardTitle}>Para meu Negócio</Text>
            <Text style={styles.onboardingCardDesc}>
              Leitura contínua de Código de Barras e QR Code, soma automática de
              estoque (+1), atalhos de lote rápido e controle de SKUs.
            </Text>
            <View style={styles.onboardingActionRow}>
              <View style={styles.primaryInvertedPill}>
                <View style={styles.buttonContentRow}>
                  <Text style={styles.primaryInvertedPillText}>
                    Entrar no Modo Negócio
                  </Text>
                  <ChevronRight
                    size={16}
                    color={TOKENS.ground}
                    strokeWidth={1.75}
                  />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  onboardingScreen: {
    flex: 1,
    backgroundColor: TOKENS.ground,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  onboardingContent: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  onboardingBrand: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsBody,
    fontWeight: '500',
    marginBottom: 8,
  },
  onboardingTitle: {
    color: TOKENS.text,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    marginBottom: 8,
  },
  onboardingSubtitle: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsBody,
    lineHeight: 20,
    marginBottom: 24,
  },
  onboardingCardsGroup: {
    gap: TOKENS.gap,
  },
  onboardingCard: {
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusCard,
    padding: TOKENS.pad,
  },
  onboardingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  onboardingModePill: {
    backgroundColor: TOKENS.pillNeutralBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  onboardingModePillText: {
    color: TOKENS.pillNeutralInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  onboardingModePillAccent: {
    backgroundColor: TOKENS.pillPositiveBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  onboardingModePillAccentText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  onboardingCardTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
    marginBottom: 6,
  },
  onboardingCardDesc: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsBody,
    lineHeight: 20,
    marginBottom: 18,
  },
  onboardingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryInvertedPill: {
    backgroundColor: TOKENS.text,
    height: TOKENS.controlHeight,
    paddingHorizontal: 18,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInvertedPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});

export default memo(OnboardingScreen);
