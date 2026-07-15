import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, MaxContentWidth, Radius, Spacing, TabBarHeight } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { clearLocalCacheOnSignOut } from '@/db/queries/reset';
import { pullRemoteChanges, pushPendingChanges } from '@/services/sync';

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await pushPendingChanges();
    await pullRemoteChanges();
    setRefreshing(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time with the same account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await pushPendingChanges();
          await signOut();
          await clearLocalCacheOnSignOut();
        },
      },
    ]);
  };

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Signed in';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'account';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Brand.accent}
              colors={[Brand.accent]}
            />
          }>
          <LinearGradient
            colors={Brand.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}>
            <View style={styles.avatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <ThemedText style={styles.avatarEmoji}>🙂</ThemedText>
              )}
            </View>
            <ThemedText type="subtitle" style={styles.heroTitle} numberOfLines={1}>
              {displayName}
            </ThemedText>
            {user?.email && (
              <ThemedText type="small" style={styles.heroSubtitle}>
                {user.email}
              </ThemedText>
            )}
          </LinearGradient>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Signed in with {provider}</ThemedText>
            <ThemedText themeColor="textSecondary">
              Your documents, notes, flashcards, and chat history sync to your account, so
              they&apos;re available wherever you sign in.
            </ThemedText>
          </ThemedView>

          <AnimatedPressable onPress={() => router.push('/settings')}>
            <ThemedView type="backgroundElement" style={styles.linkRow}>
              <ThemedText type="smallBold">Settings</ThemedText>
              <ThemedText type="subtitle" themeColor="textSecondary">
                ›
              </ThemedText>
            </ThemedView>
          </AnimatedPressable>

          <AnimatedPressable onPress={handleSignOut}>
            <ThemedView type="backgroundElement" style={styles.linkRow}>
              <ThemedText type="smallBold" style={styles.signOutLabel}>
                Sign out
              </ThemedText>
            </ThemedView>
          </AnimatedPressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: TabBarHeight + Spacing.three,
    gap: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  hero: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    borderRadius: Radius.card,
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEmoji: {
    fontSize: 36,
    lineHeight: 42,
  },
  heroTitle: {
    color: '#FFFFFF',
  },
  heroSubtitle: {
    color: '#F3E8FF',
    textAlign: 'center',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  signOutLabel: {
    color: '#c0392b',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
});
