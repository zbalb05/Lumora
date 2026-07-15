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

const AuthContext = createContext<{
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}>({
  session: null,
  user: null,
  status: 'loading',
  error: null,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => false,
  signOut: async () => {},
});

// Supabase's redirect can carry the session tokens in either the query string or the URL
// fragment depending on flow — getQueryParams handles both, a hand-rolled parser wouldn't.
// Returns whether the URL actually contained a session (both Google and magic-link redirects
// route through here, but any other deep link into the app should just be ignored).
async function applySessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) return false;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return true;
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

  const applied = await applySessionFromUrl(result.url);
  if (!applied) throw new Error('Sign-in with Google did not return a session.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
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

  // Magic-link emails open the OS browser (not the in-app WebBrowser auth session used for
  // Google), so the redirect back into the app arrives as a plain deep link instead — catch it
  // both for a cold start (app was closed when the link was tapped) and while already running.
  useEffect(() => {
    const applyIfSession = (url: string | null) => {
      if (!url) return;
      applySessionFromUrl(url).catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
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

  const signInWithEmail = async (email: string) => {
    setError(null);
    const redirectTo = Linking.createURL('/');
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (otpError) {
      setError(otpError.message);
      return false;
    }
    return true;
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
        signInWithGoogle,
        signInWithEmail,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
