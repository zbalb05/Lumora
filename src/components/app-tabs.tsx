import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type IconName = keyof typeof Ionicons.glyphMap;

const BAR_RADIUS = 32;

const TAB_META: Record<string, { outline: IconName; filled: IconName }> = {
  index: { outline: 'home-outline', filled: 'home' },
  library: { outline: 'book-outline', filled: 'book' },
  chat: { outline: 'chatbubble-outline', filled: 'chatbubble' },
  progress: { outline: 'stats-chart-outline', filled: 'stats-chart' },
  account: { outline: 'person-outline', filled: 'person' },
};

function TabIcon({
  focused,
  name,
  color,
}: {
  focused: boolean;
  name: IconName;
  color: string;
}) {
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: withSpring(focused ? 1 : 0, { damping: 22, stiffness: 450, mass: 0.5 }),
    transform: [{ scale: withSpring(focused ? 1 : 0.6, { damping: 22, stiffness: 450, mass: 0.5 }) }],
  }));
  const iconScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(focused ? 1.08 : 1, { damping: 16, stiffness: 400, mass: 0.5 }) }],
  }));

  return (
    <View style={styles.iconWrap}>
      <Animated.View style={[styles.iconHighlight, highlightStyle]} />
      <Animated.View style={iconScaleStyle}>
        <Ionicons name={name} size={22} color={color} />
      </Animated.View>
    </View>
  );
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, Spacing.two) }]} pointerEvents="box-none">
      <BlurView
        intensity={95}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={[styles.bar, { backgroundColor: theme.backgroundElement + 'E6' }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_META[route.name] ?? TAB_META.index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <AnimatedPressable key={route.key} onPress={onPress} style={styles.tabButton}>
              <TabIcon
                focused={focused}
                name={focused ? meta.filled : meta.outline}
                color={focused ? '#FFFFFF' : theme.textSecondary}
              />
            </AnimatedPressable>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.four,
  },
  bar: {
    flexDirection: 'row',
    borderRadius: BAR_RADIUS,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHighlight: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Brand.accent,
  },
});
