import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGateway } from '@/components/auth-gateway';
import { LocationOnboarding } from '@/components/location-onboarding';
import { ToastHost } from '@/components/toast-host';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { useSidequestStore } from '@/lib/store';

export default function RootLayout() {
  const hydrate = useSidequestStore((s) => s.hydrate);
  const hydrated = useSidequestStore((s) => s.hydrated);
  const syncTokens = useSidequestStore((s) => s.syncTokens);
  const refreshLocalChallenges = useSidequestStore((s) => s.refreshLocalChallenges);
  const localChallengesFetchedAt = useSidequestStore((s) => s.localChallengesFetchedAt);
  const locationOptOut = useSidequestStore((s) => s.locationOptOut);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    hydrate();
    hydrateAuth();
  }, [hydrate, hydrateAuth]);

  // Reconcile the local token mirror against the server's authoritative
  // balance whenever a session becomes active (login, or app relaunch with
  // a stored session) — local optimistic updates in between stay as-is.
  useEffect(() => {
    if (!token) return;
    apiFetch('/tokens/me', { token })
      .then((res) => res.json())
      .then((data: { tokens?: number }) => {
        if (typeof data.tokens === 'number') syncTokens(data.tokens);
      })
      .catch(() => {
        // best-effort — local balance just stays as the last-known value
      });
  }, [token, syncTokens]);

  // Silently re-sync local challenges once their TTL expires, for users who
  // already opted in — requestForegroundPermissionsAsync resolves instantly
  // with no dialog when permission was already granted, so this never
  // re-prompts. Users who never opted in (localChallengesFetchedAt is still
  // null) or explicitly opted out are left alone.
  useEffect(() => {
    if (!token || !hydrated) return;
    const s = useSidequestStore.getState();
    if (s.localChallengesFetchedAt !== null && !s.locationOptOut) refreshLocalChallenges();
  }, [token, hydrated, refreshLocalChallenges]);

  if (!authHydrated) return null;

  // First thing a brand-new session sees, on top of the feed — not something
  // that only surfaces if the user happens to scroll into the Tasks tab.
  const showLocationOnboarding = !!token && hydrated && localChallengesFetchedAt === null && !locationOptOut;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {token ? (
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="quests" />
          <Stack.Screen name="friends" />
          <Stack.Screen name="groups" />
          <Stack.Screen name="profile" />
        </Stack>
      ) : (
        <AuthGateway />
      )}
      <LocationOnboarding visible={showLocationOnboarding} />
      <ToastHost />
    </SafeAreaProvider>
  );
}
