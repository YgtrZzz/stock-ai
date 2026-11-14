import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Hook que monitora se o teclado virtual está aberto (keyboardDidShow / keyboardDidHide)
 * para aplicar espaçamento extra apenas enquanto o teclado estiver ativo (sem vazio no rodapé).
 */
export function useKeyboardVisible() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });
    const subHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      subShow?.remove?.();
      subHide?.remove?.();
    };
  }, []);

  return keyboardVisible;
}

export default useKeyboardVisible;
