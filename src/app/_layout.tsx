import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { SubscriptionProvider, useSubscription } from '@/contexts/subscription-context';
import { ThemePreferenceProvider } from '@/contexts/theme-preference';
import { db } from '@/db/client';
import { deleteOrphanedStudySets } from '@/db/queries/study-sets';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { purchasesConfigError } from '@/services/purchases';
import { supabaseConfigError } from '@/services/supabase';
import migrations from '../../drizzle/migrations';

// expo-notifications auto-registers for a remote push token as a side effect of just being
// imported on Android. Expo Go SDK 53+ removed remote push support, so that registration logs
// an error every app start — which Metro's dev client renders as a full-screen LogBox overlay
// covering the whole app. We only use local scheduled notifications (goal reminders), never
// push, so this is always safe to silence.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
]);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AnimatedSplashOverlay />
      {supabaseConfigError ? (
        <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
          <ThemedText type="subtitle">Configuration error</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {supabaseConfigError}
          </ThemedText>
        </ThemedView>
      ) : error ? (
        <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ThemedText type="subtitle">Database setup failed</ThemedText>
          <ThemedText themeColor="textSecondary">{error.message}</ThemedText>
        </ThemedView>
      ) : !success ? (
        <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </ThemedView>
      ) : (
        <AuthProvider>
          <SubscriptionProvider>
            <ThemePreferenceProvider>
              <AuthGate />
            </ThemePreferenceProvider>
          </SubscriptionProvider>
        </AuthProvider>
      )}
    </GestureHandlerRootView>
  );
}

/** Waits for the persisted session to resolve before mounting the Stack, so a signed-in user
 * never sees a flash of the sign-in screen while `getSession()` reads from AsyncStorage. */
function AuthGate() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return <AppShell />;
}

function AppShell() {
  const colorScheme = useColorScheme();
  const { status, passwordRecovery } = useAuth();
  const { status: subscriptionStatus } = useSubscription();

  useEffect(() => {
    deleteOrphanedStudySets();
  }, []);

  const needsSubscriptionCheck = status === 'signed-in' && !passwordRecovery;

  if (needsSubscriptionCheck && purchasesConfigError) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
        <ThemedText type="subtitle">Subscriptions not configured</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          {purchasesConfigError}
        </ThemedText>
      </ThemedView>
    );
  }

  // Waits for RevenueCat's customer info before deciding tabs vs. paywall, so a subscribed user
  // never sees a flash of the paywall while the entitlement check is still in flight.
  if (needsSubscriptionCheck && subscriptionStatus === 'loading') {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const subscribed = subscriptionStatus === 'subscribed';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Protected guard={passwordRecovery}>
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={needsSubscriptionCheck && subscribed}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="document/[id]" options={{ title: '' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="record-lecture" options={{ title: 'Record Lecture' }} />
        </Stack.Protected>
        <Stack.Protected guard={needsSubscriptionCheck && !subscribed}>
          <Stack.Screen name="paywall" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'signed-in' && !passwordRecovery}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
