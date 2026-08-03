import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGateway } from '@/components/auth-gateway';
import { AvatarOnboarding } from '@/components/avatar-onboarding';
import { LocationOnboarding } from '@/components/location-onboarding';
import { ToastHost } from '@/components/toast-host';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { useGumpaStore } from '@/lib/store';

export default function RootLayout() {
  const hydrate = useGumpaStore((s) => s.hydrate);
  const hydrated = useGumpaStore((s) => s.hydrated);
  const syncTokens = useGumpaStore((s) => s.syncTokens);
  const refreshLocalChallenges = useGumpaStore((s) => s.refreshLocalChallenges);
  const localChallengesFetchedAt = useGumpaStore((s) => s.localChallengesFetchedAt);
  const locationOptOut = useGumpaStore((s) => s.locationOptOut);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const justSignedUp = useAuthStore((s) => s.justSignedUp);

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
    const s = useGumpaStore.getState();
    if (s.localChallengesFetchedAt !== null && !s.locationOptOut) refreshLocalChallenges();
  }, [token, hydrated, refreshLocalChallenges]);

  if (!authHydrated) return null;

  // Onboarding order after a fresh signup: profile picture first (it's part
  // of account creation), then location — showLocationOnboarding waits on
  // !justSignedUp so the two modals never stack. A returning login never
  // sets justSignedUp, so this has no effect outside a brand-new signup.
  const showAvatarOnboarding = !!token && hydrated && justSignedUp;
  const showLocationOnboarding = !!token && hydrated && !justSignedUp && localChallengesFetchedAt === null && !locationOptOut;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {token ? (
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            // Lets a right-swipe (of any speed, from anywhere on screen —
            // not just the left edge) pop back to the previous screen, on
            // top of the platform's own edge-swipe default. Native-stack's
            // gesture handling is backed by react-native-screens' native
            // pop gesture (UIKit/Fragment transitions), not gesture-handler
            // pan responders, so no extra GestureHandlerRootView wiring is
            // needed for this.
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            fullScreenGestureEnabled: true,
          }}>
          <Stack.Screen name="index" options={{ animation: 'none', gestureEnabled: false }} />
          <Stack.Screen name="quests" />
          <Stack.Screen name="completed" />
          <Stack.Screen name="friends" />
          <Stack.Screen name="groups" />
          <Stack.Screen name="rewards" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="faq" />
          <Stack.Screen
            name="submit-review"
            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureDirection: 'vertical' }}
          />
        </Stack>
      ) : (
        <AuthGateway />
      )}
      <AvatarOnboarding visible={showAvatarOnboarding} />
      <LocationOnboarding visible={showLocationOnboarding} />
      <ToastHost />
    </SafeAreaProvider>
  );
}
