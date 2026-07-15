/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1A1E',
    background: '#F5F5FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EDE9FE',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#33284D',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Brand accent colors, shared across light/dark — used for gradients, buttons, and highlights. */
export const Brand = {
  accent: '#6C5CE7',
  accentSecondary: '#A855F7',
  gradient: ['#7C3AED', '#EC4899'] as [string, string],
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
} as const;

/** Pastel badge color pairs (background + foreground) for icon badges on stat/action cards. */
export const BadgeColors = {
  purple: { bg: '#EDE9FE', fg: '#7C3AED' },
  blue: { bg: '#DBEAFE', fg: '#2563EB' },
  pink: { bg: '#FCE7F3', fg: '#DB2777' },
  green: { bg: '#DCFCE7', fg: '#16A34A' },
  amber: { bg: '#FEF3C7', fg: '#D97706' },
} as const;

export const Radius = {
  card: 20,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Height of the tab bar itself (not the device safe-area inset, which is handled separately by SafeAreaView). */
export const TabBarHeight = Platform.select({ ios: 50, android: 84 }) ?? 0;
export const MaxContentWidth = 800;
