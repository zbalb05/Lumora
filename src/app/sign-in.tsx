import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

export default function SignInScreen() {
  const theme = useTheme();
  const { signInWithGoogle, signInWithEmail, error } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);

  const busy = googleLoading || emailLoading;

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSendMagicLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setEmailLoading(true);
    try {
      const sent = await signInWithEmail(trimmed);
      if (sent) setEmailSentTo(trimmed);
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.content}>
            <LinearGradient
              colors={Brand.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}>
              <View style={styles.heroIcon}>
                <ThemedText style={styles.heroEmoji}>🎓</ThemedText>
              </View>
              <ThemedText type="subtitle" style={styles.heroTitle}>
                Welcome to Lumora
              </ThemedText>
              <ThemedText type="small" style={styles.heroSubtitle}>
                Sign in to sync your notes, flashcards, and quizzes across devices.
              </ThemedText>
            </LinearGradient>

            <AnimatedPressable
              onPress={handleGoogle}
              disabled={busy}
              style={[styles.button, busy && styles.buttonDisabled]}>
              <ThemedView type="backgroundElement" style={styles.buttonInner}>
                {googleLoading ? (
                  <ActivityIndicator />
                ) : (
                  <Ionicons name="logo-google" size={20} color="#EA4335" />
                )}
                <ThemedText type="smallBold">Continue with Google</ThemedText>
              </ThemedView>
            </AnimatedPressable>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.backgroundSelected }]} />
              <ThemedText type="small" themeColor="textSecondary">
                or
              </ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: theme.backgroundSelected }]} />
            </View>

            {emailSentTo ? (
              <ThemedView type="backgroundElement" style={styles.emailSentCard}>
                <ThemedText type="smallBold">Check your inbox</ThemedText>
                <ThemedText themeColor="textSecondary">
                  We sent a sign-in link to {emailSentTo}. Tap it on this device to finish signing
                  in.
                </ThemedText>
                <AnimatedPressable onPress={() => setEmailSentTo(null)}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.useDifferentEmail}>
                    Use a different email
                  </ThemedText>
                </AnimatedPressable>
              </ThemedView>
            ) : (
              <View style={styles.emailForm}>
                <ThemedView type="backgroundElement" style={styles.emailInputWrap}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.emailInput, { color: theme.text }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!busy}
                    returnKeyType="send"
                    onSubmitEditing={handleSendMagicLink}
                  />
                </ThemedView>
                <AnimatedPressable
                  onPress={handleSendMagicLink}
                  disabled={busy || !email.trim()}
                  style={[styles.button, (busy || !email.trim()) && styles.buttonDisabled]}>
                  <View style={styles.emailButtonInner}>
                    {emailLoading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <ThemedText type="smallBold" style={styles.emailButtonLabel}>
                        Send magic link
                      </ThemedText>
                    )}
                  </View>
                </AnimatedPressable>
              </View>
            )}

            {error && (
              <ThemedText themeColor="textSecondary" style={styles.error}>
                {error}
              </ThemedText>
            )}
          </View>
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
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
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#F3E8FF',
    textAlign: 'center',
  },
  button: {
    borderRadius: Radius.card,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.card,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  emailForm: {
    gap: Spacing.three,
  },
  emailInputWrap: {
    borderRadius: Radius.card,
  },
  emailInput: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  emailButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: Brand.accent,
  },
  emailButtonLabel: {
    color: '#FFFFFF',
  },
  emailSentCard: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  useDifferentEmail: {
    textDecorationLine: 'underline',
  },
  error: {
    textAlign: 'center',
  },
});
