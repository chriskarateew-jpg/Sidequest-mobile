// Gumption — mandatory login/signup, shown in place of the whole app until
// there's a session. An account is required so quest proof can flow into a
// real social feed and friends can find each other.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';

type Mode = 'login' | 'signup' | 'reset';

export function AuthGateway() {
  const [mode, setMode] = useState<Mode>('login');

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <Text style={styles.appName}>Gumption</Text>
        <View style={styles.brandRule} />
        <Text style={styles.example}>“She had the gumption to ask for the raise herself.”</Text>
      </View>

      {mode === 'login' && <LoginForm onSwitch={() => setMode('signup')} onForgot={() => setMode('reset')} />}
      {mode === 'signup' && <SignupForm onSwitch={() => setMode('login')} />}
      {mode === 'reset' && <ResetRequestForm onBack={() => setMode('login')} />}
    </View>
  );
}

function LoginForm({ onSwitch, onForgot }: { onSwitch: () => void; onForgot: () => void }) {
  const login = useAuthStore((s) => s.login);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!identifier || !password) {
      setError('Enter your email/username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await login(identifier.trim(), password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Email or username"
        placeholderTextColor={Colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={identifier}
        onChangeText={setIdentifier}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={Colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.btn, busy && styles.btnDisabled]} disabled={busy} onPress={handleSubmit}>
        <Text style={styles.btnText}>{busy ? 'Logging in…' : 'Log in'}</Text>
      </Pressable>
      <Pressable onPress={onForgot}>
        <Text style={styles.link}>Forgot your password?</Text>
      </Pressable>
      <Pressable onPress={onSwitch}>
        <Text style={styles.link}>
          Don&apos;t have an account? <Text style={styles.linkStrong}>Sign up</Text>
        </Text>
      </Pressable>
    </View>
  );
}

function ResetRequestForm({ onBack }: { onBack: () => void }) {
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email) return;
    setBusy(true);
    await requestPasswordReset(email.trim());
    setBusy(false);
    setSent(true);
  };

  if (sent) {
    return (
      <View style={styles.form}>
        <Text style={styles.tagline}>
          If that email has a Gumption account, we&apos;ve sent a link to reset the password. Check your inbox.
        </Text>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>Back to log in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={Colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Pressable style={[styles.btn, busy && styles.btnDisabled]} disabled={busy} onPress={handleSubmit}>
        <Text style={styles.btnText}>{busy ? 'Sending…' : 'Send reset link'}</Text>
      </Pressable>
      <Pressable onPress={onBack}>
        <Text style={styles.link}>Back to log in</Text>
      </Pressable>
    </View>
  );
}

function SignupForm({ onSwitch }: { onSwitch: () => void }) {
  const signup = useAuthStore((s) => s.signup);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!username || !email || !password) {
      setError('Fill in all three fields.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await signup(username.trim(), email.trim(), password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor={Colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={Colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 8 characters)"
        placeholderTextColor={Colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.btn, busy && styles.btnDisabled]} disabled={busy} onPress={handleSubmit}>
        <Text style={styles.btnText}>{busy ? 'Creating account…' : 'Sign up'}</Text>
      </Pressable>
      <Pressable onPress={onSwitch}>
        <Text style={styles.link}>
          Already have an account? <Text style={styles.linkStrong}>Log in</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', padding: Spacing.four, gap: Spacing.five },
  brand: { alignItems: 'center', gap: 4, paddingHorizontal: Spacing.two },
  appName: { fontSize: 30, fontWeight: '800', color: Colors.accent, letterSpacing: 0.3 },
  brandRule: { width: 40, height: 3, borderRadius: 2, backgroundColor: Colors.accent2, marginTop: 8, marginBottom: 6 },
  example: {
    fontSize: 12.5,
    fontStyle: 'italic',
    color: Colors.muted,
    textAlign: 'center',
  },
  tagline: { fontSize: 13.5, color: Colors.muted },
  form: { gap: Spacing.two },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.ink,
  },
  error: { color: Colors.red, fontSize: 13, fontWeight: '700' },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { textAlign: 'center', color: Colors.muted, fontSize: 13.5, marginTop: Spacing.three },
  linkStrong: { color: Colors.ink, fontWeight: '800' },
});
