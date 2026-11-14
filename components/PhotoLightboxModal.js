import { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { TOKENS } from '../utils/designTokens';

/**
 * Modal Lightbox de Tela Cheia no padrão shadcn/ui zinc dark.
 * Suporta transição suave de fade a 60 FPS com useNativeDriver: true e frame de foto 1px #27272a.
 */
function PhotoLightboxModal({ lightboxImage, onClose }) {
  const isVisible = Boolean(lightboxImage?.uri);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, fadeAnim]);

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
            activeOpacity={0.78}
            onPress={onClose}
          >
            <X size={14} color={TOKENS.text} strokeWidth={2} />
            <Text style={styles.closePillButtonText}>Fechar</Text>
          </TouchableOpacity>
        </View>

        {isVisible ? (
          <TouchableOpacity
            style={styles.lightboxImageWrapper}
            activeOpacity={1}
            onPress={onClose}
          >
            <Animated.View
              style={[styles.animatedImageContainer, { opacity: fadeAnim }]}
            >
              <Image
                source={{ uri: lightboxImage.uri }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            </Animated.View>
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
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
    letterSpacing: -0.2,
    flex: 1,
  },
  closePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.cardElevated || '#18181b',
    borderWidth: 1,
    borderColor: TOKENS.borderStrong || '#3f3f46',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
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
    borderRadius: 16,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: TOKENS.border || '#27272a',
    overflow: 'hidden',
    padding: 12,
  },
  animatedImageContainer: {
    width: '100%',
    height: '100%',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
});

export default memo(PhotoLightboxModal);
