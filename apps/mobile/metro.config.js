// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// on-device waste classifier (react-native-fast-tflite)
config.resolver.assetExts.push('tflite');

module.exports = config;
