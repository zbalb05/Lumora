import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';

type Mode = 'login' | 'signup' | 'forgot';

// This screen intentionally ignores the app's light/dark theme setting and always renders the
// same dark, brand-gradient look — an auth screen's identity should be consistent regardless of
// system theme, matching the reference design it was built from.
const palette = {
  background: '#0B0A14',
  card: '#FFFFFF14',
  cardBorder: '#FFFFFF1F',
  text: '#FFFFFF',
  textSecondary: '#A8A4B8',
  placeholder: '#726D85',
};

export default function SignInScreen() {
  const { signInWithGoogle, signInWithPassword, signUpWithPassword, resetPassword, error } =
    useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const busy = googleLoading || submitting;

  const switchMode = (next: Mode) => {
    setMode(next);
    setFormError(null);
    setFullName('');
    setPassword('');
    setConfirmPassword('');
    setConfirmationSentTo(null);
    setResetSentTo(null);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Enter your email.');
      return;
    }

    if (mode === 'forgot') {
      setSubmitting(true);
      setFormError(null);
      try {
        const sent = await resetPassword(trimmedEmail);
        if (sent) setResetSentTo(trimmedEmail);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!password) {
      setFormError('Enter your password.');
      return;
    }
    const trimmedName = fullName.trim();
    if (mode === 'signup' && !trimmedName) {
      setFormError('Enter your name.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (mode === 'login') {
        await signInWithPassword(trimmedEmail, password);
      } else {
        const result = await signUpWithPassword(trimmedEmail, password, trimmedName);
        if (result.success && result.needsConfirmation) setConfirmationSentTo(trimmedEmail);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Welcome to Lumora' : 'Reset password';
  const subtitle =
    mode === 'forgot'
      ? "Enter your email and we'll send you a link to reset your password."
      : 'Sign in to sync your notes, flashcards, and quizzes across devices.';
  const submitLabel = mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : 'Send reset link';
  const pendingCard = mode === 'signup' ? confirmationSentTo : mode === 'forgot' ? resetSentTo : null;
  const shownError = formError ?? error;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <LinearGradient
              colors={Brand.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}>
              <View style={styles.heroIcon}>
                <Text style={styles.heroEmoji}>🎓</Text>
              </View>
              <Text style={styles.heroTitle}>{title}</Text>
              <Text style={styles.heroSubtitle}>{subtitle}</Text>
            </LinearGradient>

            {pendingCard ? (
              <View style={[styles.card, styles.pendingCard]}>
                <Text style={styles.cardTitle}>Check your inbox</Text>
                <Text style={styles.cardBody}>
                  {mode === 'signup'
                    ? `We sent a confirmation link to ${pendingCard}. Tap it to finish creating your account.`
                    : `We sent a password reset link to ${pendingCard}. Tap it on this device to set a new password.`}
                </Text>
                <Pressable onPress={() => switchMode('login')}>
                  <Text style={styles.linkText}>Back to login</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.form}>
                {mode === 'signup' && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Name</Text>
                    <View style={styles.inputRow}>
                      <Ionicons name="person-outline" size={18} color={palette.textSecondary} />
                      <TextInput
                        value={fullName}
                        onChangeText={setFullName}
                        placeholder="Your name"
                        placeholderTextColor={palette.placeholder}
                        style={styles.input}
                        autoCapitalize="words"
                        editable={!busy}
                        returnKeyType="next"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="mail-outline" size={18} color={palette.textSecondary} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={palette.placeholder}
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      editable={!busy}
                    />
                  </View>
                </View>

                {mode !== 'forgot' && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Password</Text>
                    <View style={styles.inputRow}>
                      <Ionicons name="lock-closed-outline" size={18} color={palette.textSecondary} />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor={palette.placeholder}
                        style={styles.input}
                        secureTextEntry={!showPassword}
                        editable={!busy}
                        returnKeyType={mode === 'signup' ? 'next' : 'send'}
                        onSubmitEditing={mode === 'signup' ? undefined : handleSubmit}
                      />
                      <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={palette.textSecondary}
                        />
                      </Pressable>
                    </View>
                  </View>
                )}

                {mode === 'signup' && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Confirm Password</Text>
                    <View style={styles.inputRow}>
                      <Ionicons name="lock-closed-outline" size={18} color={palette.textSecondary} />
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="••••••••"
                        placeholderTextColor={palette.placeholder}
                        style={styles.input}
                        secureTextEntry={!showPassword}
                        editable={!busy}
                        returnKeyType="send"
                        onSubmitEditing={handleSubmit}
                      />
                    </View>
                  </View>
                )}

                {mode === 'login' && (
                  <Pressable
                    onPress={() => switchMode('forgot')}
                    style={styles.forgotRow}
                    hitSlop={8}>
                    <Text style={styles.linkText}>Forgot Password?</Text>
                  </Pressable>
                )}

                {shownError && <Text style={styles.errorText}>{shownError}</Text>}

                <AnimatedPressable onPress={handleSubmit} disabled={busy}>
                  <LinearGradient
                    colors={Brand.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.submitButton, busy && styles.disabled]}>
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitLabel}>{submitLabel}</Text>
                    )}
                  </LinearGradient>
                </AnimatedPressable>

                {mode !== 'forgot' && (
                  <>
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>Or</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    <AnimatedPressable onPress={handleGoogle} disabled={busy}>
                      <View style={[styles.googleButton, busy && styles.disabled]}>
                        {googleLoading ? (
                          <ActivityIndicator color={palette.text} />
                        ) : (
                          <>
                            <Ionicons name="logo-google" size={18} color="#EA4335" />
                            <Text style={styles.googleLabel}>Google</Text>
                          </>
                        )}
                      </View>
                    </AnimatedPressable>
                  </>
                )}

                <Pressable
                  onPress={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
                  style={styles.switchRow}>
                  <Text style={styles.switchText}>
                    {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                    <Text style={styles.linkText}>
                      {mode === 'signup' ? 'Login' : 'Create an account'}
                    </Text>
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
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
  card: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  pendingCard: {
    backgroundColor: palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.cardBorder,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardBody: {
    color: palette.textSecondary,
    lineHeight: 20,
  },
  form: {
    gap: Spacing.three,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  fieldLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.cardBorder,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Platform.select({ ios: Spacing.three, default: Spacing.two }),
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  forgotRow: {
    alignSelf: 'flex-end',
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.cardBorder,
  },
  dividerText: {
    color: palette.textSecondary,
    fontSize: 13,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.cardBorder,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
  },
  googleLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  switchRow: {
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  switchText: {
    color: palette.textSecondary,
    fontSize: 14,
  },
  linkText: {
    color: '#C4B5FD',
    fontWeight: '700',
  },
});
