import { memo } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Modal Lightbox de Tela Cheia memoizado (React.memo) para inspeção visual
 * de fotografias de produtos e locais sem corte (resizeMode="contain").
 */
function PhotoLightboxModal({ lightboxImage, onClose }) {
  const isVisible = Boolean(lightboxImage?.uri);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.lightboxBackdrop}>
        <View style={styles.lightboxTopBar}>
          <Text style={styles.lightboxTitle} numberOfLines={1}>
            {lightboxImage?.title || 'Visualização de Foto'}
          </Text>
          <TouchableOpacity
            style={styles.closePillButton}
            activeOpacity={0.8}
            onPress={onClose}
          >
            <X size={15} color={TOKENS.text} strokeWidth={1.75} />
            <Text style={styles.closePillButtonText}>Fechar</Text>
          </TouchableOpacity>
        </View>

        {isVisible ? (
          <TouchableOpacity
            style={styles.lightboxImageWrapper}
            activeOpacity={1}
            onPress={onClose}
          >
            <Image
              source={{ uri: lightboxImage.uri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  lightboxTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  lightboxTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
    flex: 1,
  },
  closePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    height: TOKENS.controlHeight,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  closePillButtonText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  lightboxImageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#262626',
    overflow: 'hidden',
    padding: 12,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
});

export default memo(PhotoLightboxModal);
