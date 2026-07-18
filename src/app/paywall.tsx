import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';

import { AnimatedPressable } from '@/components/animated-pressable';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useSubscription } from '@/contexts/subscription-context';
import { clearLocalCacheOnSignOut } from '@/db/queries/reset';
import { pushPendingChanges } from '@/services/sync';

// Matches sign-in.tsx's fixed dark look — a paywall is part of the same auth-adjacent flow.
const palette = {
  background: '#0B0A14',
  card: '#FFFFFF14',
  cardBorder: '#FFFFFF1F',
  cardBorderSelected: '#C4B5FD',
  text: '#FFFFFF',
  textSecondary: '#A8A4B8',
};

const FEATURES = [
  'Unlimited AI chat, notes, flashcards, and quizzes',
  'Syncs across every device you sign in on',
  'Cancel anytime',
];

export default function PaywallScreen() {
  const { signOut } = useAuth();
  const { offerings, error, purchase, restore } = useSubscription();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const packages = offerings?.current?.availablePackages ?? [];
  const selected = packages.find((pkg) => pkg.identifier === selectedId) ?? packages[0] ?? null;

  const handlePurchase = async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      await purchase(selected);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restore();
      if (!restored) Alert.alert('No subscription found', 'We couldn’t find an active subscription for this account.');
    } finally {
      setRestoring(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can subscribe and sign back in any time.', [
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

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={Brand.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}>
            <View style={styles.heroIcon}>
              <Text style={styles.heroEmoji}>🎓</Text>
            </View>
            <Text style={styles.heroTitle}>Unlock Lumora</Text>
            <Text style={styles.heroSubtitle}>Subscribe to keep using Lumora.</Text>
          </LinearGradient>

          <View style={styles.featureList}>
            {FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={20} color={Brand.accentSecondary} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {packages.length === 0 ? (
            <View style={styles.card}>
              <ActivityIndicator color={palette.text} />
              <Text style={styles.cardBody}>Loading subscription options…</Text>
            </View>
          ) : (
            <View style={styles.plans}>
              {packages.map((pkg: PurchasesPackage) => {
                const isSelected = pkg.identifier === selected?.identifier;
                return (
                  <Pressable
                    key={pkg.identifier}
                    onPress={() => setSelectedId(pkg.identifier)}
                    style={[styles.planCard, isSelected && styles.planCardSelected]}>
                    <View style={styles.planInfo}>
                      <Text style={styles.planTitle}>{pkg.product.title}</Text>
                      <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
                    </View>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={isSelected ? palette.cardBorderSelected : palette.textSecondary}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <AnimatedPressable onPress={handlePurchase} disabled={!selected || purchasing}>
            <LinearGradient
              colors={Brand.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.submitButton, (!selected || purchasing) && styles.disabled]}>
              {purchasing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitLabel}>Subscribe</Text>
              )}
            </LinearGradient>
          </AnimatedPressable>

          <Pressable onPress={handleRestore} disabled={restoring} style={styles.linkRow}>
            <Text style={styles.linkText}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>

          <Pressable onPress={handleSignOut} style={styles.linkRow}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
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
    paddingVertical: Spacing.five,
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
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 36,
    lineHeight: 42,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#F3E8FF',
    textAlign: 'center',
  },
  featureList: {
    gap: Spacing.two,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  featureText: {
    color: palette.text,
    flex: 1,
  },
  card: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    backgroundColor: palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.cardBorder,
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardBody: {
    color: palette.textSecondary,
  },
  plans: {
    gap: Spacing.two,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: palette.card,
    borderWidth: 1.5,
    borderColor: palette.cardBorder,
  },
  planCardSelected: {
    borderColor: palette.cardBorderSelected,
  },
  planInfo: {
    gap: 2,
  },
  planTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  planPrice: {
    color: palette.textSecondary,
  },
  errorText: {
    color: Brand.danger,
    textAlign: 'center',
  },
  submitButton: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
  linkRow: {
    alignItems: 'center',
  },
  linkText: {
    color: '#C4B5FD',
    fontWeight: '700',
  },
  signOutText: {
    color: palette.textSecondary,
  },
});
