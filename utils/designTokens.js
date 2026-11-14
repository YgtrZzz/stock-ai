/**
 * Fonte única da verdade para os tokens do Design System 'true-black-flat':
 * - Ground #000000, Surface #111111, Raised #2a2a2a, Rule #161616
 * - Accent #c6f24e exclusivo para dados primários e caixas de detecção
 * - Imutável (Object.freeze) para evitar mutações acidentais em tempo de execução
 */
export const TOKENS = Object.freeze({
  ground: '#000000',
  surface: '#111111',
  surfaceAlt: '#161616',
  raised: '#2a2a2a',
  rule: '#161616',
  ruleStrong: '#2a2a2a',
  borderSubtle: '#262626',
  borderPositive: '#3f5713',
  // Camada estrutural shadcn/ui (zinc dark): bordas 1px, inputs inset e superfícies elevadas
  border: '#27272a',
  borderStrong: '#3f3f46',
  input: '#09090b',
  mutedFg: '#a1a1aa',
  cardElevated: '#18181b',
  ring: '#c6f24e',
  radiusShad: 12,
  text: '#ffffff',
  muted: '#b4b4b4',
  faint: '#949494',
  accent: '#c6f24e',
  pillPositiveBg: '#222a10',
  pillPositiveFill: '#222a10',
  pillPositiveInk: '#c6f24e',
  pillWarningBg: '#2a2008',
  pillWarningInk: '#f5b841',
  pillNegativeBg: '#2c100e',
  pillNegativeInk: '#f2645a',
  pillNeutralBg: '#222222',
  pillNeutralInk: '#ffffff',
  radiusCard: 20,
  radiusControl: 999,
  pad: 20,
  gap: 10,
  controlHeight: 34,
  fsTitle: 17,
  fsSection: 15,
  fsBody: 14,
  fsSmall: 12,
  fsKpi: 28,
});
