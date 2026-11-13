const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('tflite')) {
  config.resolver.assetExts.push('tflite');
}
if (!config.resolver.assetExts.includes('bin')) {
  config.resolver.assetExts.push('bin');
}

module.exports = config;
