import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/services/supabase';
import { pullRemoteChanges } from '@/services/sync';
import type { Session, User } from '@supabase/supabase-js';

WebBrowser.maybeCompleteAuthSession();

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export type SignUpResult = { success: boolean; needsConfirmation: boolean };

const AuthContext = createContext<{
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  error: string | null;
  /** True once the user has followed a password-reset email link — takes priority over `status`
   * to force the reset-password screen even though Supabase has already issued a real session. */
  passwordRecovery: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
  resetPassword: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}>({
  session: null,
  user: null,
  status: 'loading',
  error: null,
  passwordRecovery: false,
  signInWithGoogle: async () => {},
  signInWithPassword: async () => false,
  signUpWithPassword: async () => ({ success: false, needsConfirmation: false }),
  resetPassword: async () => false,
  updatePassword: async () => false,
  signOut: async () => {},
});

// Supabase's redirect can carry the session tokens in either the query string or the URL
// fragment depending on flow — getQueryParams handles both, a hand-rolled parser wouldn't.
// `recovery` distinguishes a password-reset link (type=recovery) from every other redirect
// (Google OAuth, signup email confirmation), all of which land here since they share this deep
// link handler.
async function applySessionFromUrl(url: string): Promise<{ applied: boolean; recovery: boolean }> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) return { applied: false, recovery: false };

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return { applied: true, recovery: params.type === 'recovery' };
}

async function performGoogleOAuth() {
  const redirectTo = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;

  const { applied } = await applySessionFromUrl(result.url);
  if (!applied) throw new Error('Sign-in with Google did not return a session.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? 'signed-in' : 'signed-out');
      if (data.session) pullRemoteChanges();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'signed-in' : 'signed-out');
      if (nextSession) pullRemoteChanges();
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // Password-reset and signup-confirmation emails open the OS browser (not the in-app WebBrowser
  // auth session used for Google), so the redirect back into the app arrives as a plain deep link
  // instead — catch it both for a cold start (app was closed when the link was tapped) and while
  // already running.
  useEffect(() => {
    const applyIfSession = (url: string | null) => {
      if (!url) return;
      applySessionFromUrl(url)
        .then(({ recovery }) => {
          if (recovery) setPasswordRecovery(true);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    };
    Linking.getInitialURL().then(applyIfSession);
    const subscription = Linking.addEventListener('url', ({ url }) => applyIfSession(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        supabase.auth.startAutoRefresh();
        pullRemoteChanges();
      } else if (nextState.match(/inactive|background/)) {
        supabase.auth.stopAutoRefresh();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      await performGoogleOAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in with Google failed.');
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      return false;
    }
  };

  const signUpWithPassword = async (email: string, password: string): Promise<SignUpResult> => {
    setError(null);
    try {
      const redirectTo = Linking.createURL('/');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (signUpError) {
        setError(signUpError.message);
        return { success: false, needsConfirmation: false };
      }
      // If the project requires email confirmation, signUp() succeeds but returns no session yet —
      // the user only gets one once they tap the confirmation link (handled by the deep link effect
      // above, same as any other redirect).
      return { success: true, needsConfirmation: !data.session };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed.');
      return { success: false, needsConfirmation: false };
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    try {
      const redirectTo = Linking.createURL('/');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) {
        setError(resetError.message);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
      return false;
    }
  };

  const updatePassword = async (password: string) => {
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return false;
      }
      setPasswordRecovery(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
      return false;
    }
  };

  const signOut = async () => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        status,
        error,
        passwordRecovery,
        signInWithGoogle,
        signInWithPassword,
        signUpWithPassword,
        resetPassword,
        updatePassword,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
