import { memo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Layers, RefreshCw } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Painel B2B de Backup & Restauração Integral Assinada (JSON com Checksum de Integridade).
 * Segue estritamente 'true-black-flat', 'tabular-nums' e zero emojis.
 */
function B2BBackupRestoreCard({
  spacesCount = 0,
  itemsCount = 0,
  exporting = false,
  restoring = false,
  onExportBackup,
  onRestoreBackupJson,
}) {
  const [expanded, setExpanded] = useState(false);
  const [backupJsonText, setBackupJsonText] = useState('');

  const handleRestorePress = async () => {
    const trimmed = backupJsonText.trim();
    if (!trimmed || restoring) return;
    const ok = await onRestoreBackupJson?.(trimmed);
    if (ok) {
      setBackupJsonText('');
      setExpanded(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleCol}>
          <Text style={styles.title}>Backup Seguro & Restauração (JSON)</Text>
          <Text style={styles.subtitle}>
            {spacesCount} locais · {itemsCount} SKUs · Assinatura de integridade
          </Text>
        </View>

        <View style={styles.actionsRightRow}>
          <TouchableOpacity
            style={[
              styles.exportPillButton,
              exporting && styles.controlDisabled,
            ]}
            activeOpacity={0.82}
            onPress={onExportBackup}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={TOKENS.ground} />
            ) : (
              <>
                <Layers size={13} color={TOKENS.ground} strokeWidth={1.75} />
                <Text style={styles.exportPillText}>Backup</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.togglePillButton,
              expanded && styles.togglePillButtonActive,
            ]}
            activeOpacity={0.82}
            onPress={() => setExpanded((prev) => !prev)}
          >
            <RefreshCw
              size={13}
              color={expanded ? TOKENS.ground : TOKENS.text}
              strokeWidth={1.75}
            />
            <Text
              style={[
                styles.togglePillText,
                expanded && styles.togglePillTextActive,
              ]}
            >
              {expanded ? 'Fechar' : 'Restaurar'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {expanded && (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Cole abaixo o conteúdo de um arquivo Backup_ArmarioDigital.json. O
            checksum criptográfico será validado antes de sincronizar espaços e
            SKUs.
          </Text>
          <TextInput
            style={styles.jsonInput}
            value={backupJsonText}
            onChangeText={setBackupJsonText}
            placeholder='{"app":"ArmarioDigital","schemaVersion":1,"checksum":"..."}'
            placeholderTextColor={TOKENS.faint}
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[
              styles.restoreSubmitPill,
              (!backupJsonText.trim() || restoring) && styles.controlDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleRestorePress}
            disabled={!backupJsonText.trim() || restoring}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={TOKENS.ground} />
            ) : (
              <View style={styles.inlineRow}>
                <Check size={15} color={TOKENS.ground} strokeWidth={2} />
                <Text style={styles.restoreSubmitText}>
                  Validar Checksum e Restaurar Backup
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusCard,
    padding: 18,
    marginBottom: TOKENS.gap,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  subtitle: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  actionsRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exportPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.text,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: TOKENS.radiusControl,
  },
  exportPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  togglePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.raised,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: TOKENS.radiusControl,
  },
  togglePillButtonActive: {
    backgroundColor: TOKENS.text,
  },
  togglePillText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  togglePillTextActive: {
    color: TOKENS.ground,
  },
  body: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.rule,
    gap: 10,
  },
  hint: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  jsonInput: {
    backgroundColor: TOKENS.raised,
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  restoreSubmitPill: {
    backgroundColor: TOKENS.text,
    height: 38,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  restoreSubmitText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  controlDisabled: {
    opacity: 0.35,
  },
});

export default memo(B2BBackupRestoreCard);
