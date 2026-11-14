import { createContext } from 'react';

/**
 * Contexto global de Perfil de Uso ('home' | 'business' | null) + Lightbox de Fotos
 */
export const ProfileContext = createContext({
  userProfile: null,
  selectProfile: async () => {},
  resetProfile: async () => {},
  openLightbox: () => {},
});
