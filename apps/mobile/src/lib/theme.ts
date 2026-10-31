import { Platform, useColorScheme } from 'react-native';

const light = {
  primary: '#0D9488', primaryStrong: '#0F766E', primarySoft: '#CCFBF1', onPrimary: '#FFFFFF',
  accent: '#D97706', onAccent: '#1C1917',
  bg: '#F6FAF9', card: '#FFFFFF', fg: '#0F2E2B', muted: '#EEF3F2', mutedFg: '#475569', border: '#D5E3E0',
  success: '#15803D', successSoft: '#DCFCE7', warning: '#B45309', warningSoft: '#FEF3C7', danger: '#DC2626', dangerSoft: '#FEE2E2', info: '#0369A1',
};
const dark: typeof light = {
  primary: '#2DD4BF', primaryStrong: '#5EEAD4', primarySoft: '#134E4A', onPrimary: '#0B1514',
  accent: '#F59E0B', onAccent: '#1C1917',
  bg: '#0B1514', card: '#111F1D', fg: '#E6F2F0', muted: '#18302C', mutedFg: '#9FB3AF', border: '#1F3532',
  success: '#4ADE80', successSoft: '#14532D', warning: '#FBBF24', warningSoft: '#451A03', danger: '#F87171', dangerSoft: '#450A0A', info: '#38BDF8',
};
export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

// Fonts are embedded natively (expo-font plugin): Android registers them by family name, iOS by PostScript name.
const ios = Platform.OS === 'ios';
export const font = {
  regular: ios ? 'FiraSans-Regular' : 'FiraSans_400Regular',
  medium: ios ? 'FiraSans-Medium' : 'FiraSans_500Medium',
  semibold: ios ? 'FiraSans-SemiBold' : 'FiraSans_600SemiBold',
  bold: ios ? 'FiraSans-Bold' : 'FiraSans_700Bold',
  mono: ios ? 'FiraCode-Medium' : 'FiraCode_500Medium',
};
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 16 };
