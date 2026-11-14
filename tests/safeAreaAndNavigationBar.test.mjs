import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Cycle 15 (Part 1) — Android Virtual Navigation Bar & Safe Area Insets (Samsung S8 Guard)', () => {
  const appPath = path.resolve(
    'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/App.js'
  );
  const onboardingPath = path.resolve(
    'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/screens/OnboardingScreen.js'
  );
  const lightboxPath = path.resolve(
    'C:/Users/ygorg/deteccao-de-objetos/ArmarioDigital/components/PhotoLightboxModal.js'
  );

  it('App.js imports SafeAreaProvider and useSafeAreaInsets from react-native-safe-area-context', () => {
    const appSource = fs.readFileSync(appPath, 'utf8');
    assert.match(
      appSource,
      /import\s*\{[^}]*SafeAreaProvider[^}]*\}\s*from\s*['"]react-native-safe-area-context['"]/,
      'App.js must import SafeAreaProvider'
    );
    assert.match(
      appSource,
      /useSafeAreaInsets/,
      'App.js must import useSafeAreaInsets'
    );
  });

  it('App.js wraps the application in SafeAreaProvider and calculates dynamic bottomInset for Tab.Navigator', () => {
    const appSource = fs.readFileSync(appPath, 'utf8');
    assert.match(
      appSource,
      /<SafeAreaProvider>/,
      'App.js must render <SafeAreaProvider>'
    );
    assert.match(
      appSource,
      /height:\s*56\s*\+\s*bottomInset/,
      'tabBarStyle must dynamically add bottomInset to height'
    );
    assert.match(
      appSource,
      /paddingBottom:\s*bottomInset\s*>\s*0\s*\?\s*bottomInset\s*:\s*6/,
      'tabBarStyle must adapt paddingBottom to bottomInset'
    );
  });

  it('OnboardingScreen.js and PhotoLightboxModal.js adapt to safe area insets preventing navigation bar occlusion', () => {
    const onboardingSource = fs.readFileSync(onboardingPath, 'utf8');
    const lightboxSource = fs.readFileSync(lightboxPath, 'utf8');

    assert.match(
      onboardingSource,
      /useSafeAreaInsets/,
      'OnboardingScreen must use safe area insets'
    );
    assert.match(
      lightboxSource,
      /useSafeAreaInsets/,
      'PhotoLightboxModal must use safe area insets'
    );
    assert.equal(
      /[\u{1F300}-\u{1FAFF}]/u.test(onboardingSource),
      false,
      'OnboardingScreen must not have emojis'
    );
  });
});
