import { memo, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, ChevronRight, Home } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Tela de Onboarding Inicial memoizada (React.memo) para escolha do Perfil Operacional
 * ('home' vs 'business'), seguindo estritamente os tokens 'true-black-flat' e estética shadcn/ui.
 */
function OnboardingScreen({ onSelectProfile }) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets?.bottom ?? 0, 0);
  const topInset = Math.max(insets?.top ?? 0, 0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 75,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <View
      style={[
        styles.onboardingScreen,
        {
          paddingTop: topInset + 16,
          paddingBottom: bottomInset + 16,
        },
      ]}
    >
      <StatusBar style="light" />
      <Animated.View
        style={[
          styles.onboardingContent,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.brandPill}>
          <Text style={styles.onboardingBrand}>Armário Digital</Text>
        </View>
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
              <View style={styles.iconSlotNeutral}>
                <Home size={20} color={TOKENS.text} strokeWidth={1.75} />
              </View>
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
            style={[styles.onboardingCard, styles.onboardingCardBusiness]}
            activeOpacity={0.82}
            onPress={() => onSelectProfile('business')}
          >
            <View style={styles.onboardingCardHeader}>
              <View style={styles.iconSlotAccent}>
                <Building2 size={20} color={TOKENS.accent} strokeWidth={1.75} />
              </View>
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
      </Animated.View>
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
  brandPill: {
    alignSelf: 'flex-start',
    backgroundColor: TOKENS.surface,
    borderWidth: 1,
    borderColor: TOKENS.raised,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: TOKENS.radiusControl,
    marginBottom: 12,
  },
  onboardingBrand: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    letterSpacing: 0.2,
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
    gap: 12,
  },
  onboardingCard: {
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusCard,
    borderWidth: 1,
    borderColor: TOKENS.raised,
    padding: TOKENS.pad,
  },
  onboardingCardBusiness: {
    borderColor: '#3f5713',
  },
  onboardingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconSlotNeutral: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotAccent: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: TOKENS.pillPositiveBg,
    borderWidth: 1,
    borderColor: '#3f5713',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingModePill: {
    backgroundColor: TOKENS.pillNeutralBg,
    borderWidth: 1,
    borderColor: TOKENS.raised,
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
    borderWidth: 1,
    borderColor: '#3f5713',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  onboardingModePillAccentText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
    fontVariant: ['tabular-nums'],
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
