import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemePreference } from '@/contexts/theme-preference';

export function useColorScheme() {
  const { preference } = useThemePreference();
  const system = useRNColorScheme();
  return preference === 'system' ? system : preference;
}
