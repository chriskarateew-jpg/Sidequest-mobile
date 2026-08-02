// Gumpa — account/session state. Local quest-tracking works with no
// account at all; logging in only unlocks the social feed and friends.

import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { apiFetch } from '@/lib/api';

const TOKEN_KEY = 'gumpa_auth_token';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  isPublic: boolean;
  emailVerified: boolean;
  avatarKey: string | null;
}

interface AuthState {
  hydrated: boolean;
  token: string | null;
  user: AuthUser | null;
  // True only for the remainder of the session in which signup() just
  // succeeded — never set by login()/hydrate() — so the profile-picture
  // prompt (see AvatarOnboarding) is a one-time part of account creation,
  // not something a returning user sees on every login.
  justSignedUp: boolean;
  clearJustSignedUp: () => void;
  hydrate: () => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<string | null>;
  login: (identifier: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  resendVerification: () => Promise<string | null>;
  requestPasswordReset: (email: string) => Promise<void>;
  setPrivacy: (isPublic: boolean) => Promise<string | null>;
  setAvatar: (base64: string, mediaType: string) => Promise<string | null>;
}

async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function setStoredToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // best-effort — session just won't survive a reload on this platform
  }
}

async function clearStoredToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  token: null,
  user: null,
  justSignedUp: false,

  clearJustSignedUp: () => set({ justSignedUp: false }),

  hydrate: async () => {
    const token = await getStoredToken();
    if (!token) {
      set({ hydrated: true });
      return;
    }
    try {
      const res = await apiFetch('/auth/me', { token });
      if (!res.ok) throw new Error('stale token');
      const data = (await res.json()) as { user: AuthUser };
      set({ token, user: data.user, hydrated: true });
    } catch {
      await clearStoredToken();
      set({ hydrated: true });
    }
  },

  signup: async (username, email, password) => {
    try {
      const res = await apiFetch('/auth/signup', { method: 'POST', body: { username, email, password } });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) return data.error ?? 'Something went wrong. Try again.';
      await setStoredToken(data.token);
      set({ token: data.token, user: data.user, justSignedUp: true });
      return null;
    } catch {
      return 'Could not reach the server. Check your connection.';
    }
  },

  login: async (identifier, password) => {
    try {
      const res = await apiFetch('/auth/login', { method: 'POST', body: { identifier, password } });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) return data.error ?? 'Something went wrong. Try again.';
      await setStoredToken(data.token);
      set({ token: data.token, user: data.user });
      return null;
    } catch {
      return 'Could not reach the server. Check your connection.';
    }
  },

  logout: async () => {
    await clearStoredToken();
    set({ token: null, user: null });
  },

  refreshUser: async () => {
    const { token } = get();
    if (!token) return;
    try {
      const res = await apiFetch('/auth/me', { token });
      if (!res.ok) return;
      const data = (await res.json()) as { user: AuthUser };
      set({ user: data.user });
    } catch {
      // leave existing state as-is
    }
  },

  resendVerification: async () => {
    const { token } = get();
    if (!token) return 'Not logged in.';
    try {
      const res = await apiFetch('/auth/resend-verification', { method: 'POST', token });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return data.error ?? 'Something went wrong. Try again.';
      return null;
    } catch {
      return 'Could not reach the server. Check your connection.';
    }
  },

  requestPasswordReset: async (email) => {
    try {
      await apiFetch('/auth/request-password-reset', { method: 'POST', body: { email } });
    } catch {
      // intentionally silent — the caller always shows the same generic confirmation
    }
  },

  setPrivacy: async (isPublic) => {
    const { token } = get();
    if (!token) return 'Not logged in.';
    try {
      const res = await apiFetch('/account/privacy', { method: 'POST', token, body: { isPublic } });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return data.error ?? 'Something went wrong. Try again.';
      set((s) => (s.user ? { user: { ...s.user, isPublic } } : s));
      return null;
    } catch {
      return 'Could not reach the server. Check your connection.';
    }
  },

  setAvatar: async (base64, mediaType) => {
    const { token } = get();
    if (!token) return 'Not logged in.';
    try {
      const res = await apiFetch('/account/avatar', { method: 'POST', token, body: { pictureBase64: base64, mediaType } });
      const data = (await res.json()) as { avatarKey?: string; error?: string };
      if (!res.ok || !data.avatarKey) return data.error ?? 'Something went wrong. Try again.';
      const avatarKey = data.avatarKey;
      set((s) => (s.user ? { user: { ...s.user, avatarKey } } : s));
      return null;
    } catch {
      return 'Could not reach the server. Check your connection.';
    }
  },
}));
