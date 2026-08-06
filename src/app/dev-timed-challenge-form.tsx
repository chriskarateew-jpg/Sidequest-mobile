// Gumpa — create/edit a time-boxed developer Challenge (distinct from the
// recurring cadence-based Task in dev-challenge-form.tsx). Reached only
// from the hidden /dev panel; server-side requireDeveloper is the actual
// gate (see server/src/timed-challenges.ts).

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { LocationPickerMap } from '@/components/location-picker-map';
import type { LocationPickerValue } from '@/components/location-picker-map.types';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  createAdminTimedChallenge,
  setAdminTimedChallengeActive,
  updateAdminTimedChallenge,
  type AdminTimedChallenge,
} from '@/lib/admin-api';
import { useAuthStore } from '@/lib/auth';
import type { ProofType } from '@/lib/data';
import { useToastStore } from '@/lib/toast';

const PROOF_TYPES: ProofType[] = ['camera', 'screenshot', 'either'];
const DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
];

function Segmented<T extends string>({ options, value, onChange, labels }: { options: T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <View style={styles.segmentRow}>
      {options.map((opt) => (
        <Pressable key={opt} style={[styles.segment, value === opt && styles.segmentActive]} onPress={() => onChange(opt)}>
          <Text style={[styles.segmentText, value === opt && styles.segmentTextActive]}>{labels?.[opt] ?? opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function DevTimedChallengeFormScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const params = useLocalSearchParams<{ challenge?: string }>();
  const existing: AdminTimedChallenge | null = params.challenge ? JSON.parse(params.challenge) : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [desc, setDesc] = useState(existing?.desc ?? '');
  const [tokens, setTokens] = useState(existing ? String(existing.tokens) : '');
  const [proofType, setProofType] = useState<ProofType>(existing?.proofType ?? 'camera');
  const [durationMinutes, setDurationMinutes] = useState(existing ? String(existing.durationMinutes) : '120');
  const [location, setLocation] = useState<LocationPickerValue | null>(
    existing?.placeLat != null && existing?.placeLng != null && existing?.radiusMeters != null
      ? { lat: existing.placeLat, lng: existing.placeLng, radiusMeters: existing.radiusMeters }
      : null
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!token) return;
    const tokensNum = Number(tokens);
    const durationNum = Number(durationMinutes);
    if (!title.trim() || !desc.trim()) {
      show('Title and description are required.');
      return;
    }
    if (!Number.isInteger(tokensNum) || tokensNum <= 0) {
      show('Tokens must be a positive whole number.');
      return;
    }
    if (!Number.isInteger(durationNum) || durationNum <= 0) {
      show('Duration must be a positive whole number of minutes.');
      return;
    }

    setSaving(true);
    const input = {
      title: title.trim(),
      desc: desc.trim(),
      tokens: tokensNum,
      proofType,
      durationMinutes: durationNum,
      ...(location ? { placeLat: location.lat, placeLng: location.lng, radiusMeters: location.radiusMeters } : {}),
    };
    const result = existing ? await updateAdminTimedChallenge(token, existing.id, input) : await createAdminTimedChallenge(token, input);
    if (!result.ok) {
      setSaving(false);
      show(result.message);
      return;
    }
    if (existing && existing.active !== active) {
      await setAdminTimedChallengeActive(token, existing.id, active);
    }
    setSaving(false);
    router.back();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <BackButton />
      <Text style={styles.pageTitle}>{existing ? 'Edit challenge' : 'New challenge'}</Text>
      {!existing && (
        <Text style={styles.pageSubtitle}>
          The deadline starts the moment you create this and is the same for every user — not a per-user countdown.
        </Text>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Go to the downtown fountain" placeholderTextColor={Colors.muted} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={desc}
          onChangeText={setDesc}
          placeholder="Photograph yourself there before time runs out."
          placeholderTextColor={Colors.muted}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Token payout</Text>
        <TextInput style={styles.input} value={tokens} onChangeText={setTokens} placeholder="50" placeholderTextColor={Colors.muted} keyboardType="number-pad" />

        <Text style={styles.label}>Proof type</Text>
        <Segmented options={PROOF_TYPES} value={proofType} onChange={setProofType} labels={{ camera: 'Camera', screenshot: 'Screenshot', either: 'Either' }} />

        <Text style={styles.label}>{existing ? 'Duration (from original creation)' : 'Duration'}</Text>
        <View style={styles.presetRow}>
          {DURATION_PRESETS.map((p) => (
            <Pressable key={p.label} style={styles.preset} onPress={() => setDurationMinutes(String(p.minutes))}>
              <Text style={styles.presetText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          placeholder="Minutes"
          placeholderTextColor={Colors.muted}
          keyboardType="number-pad"
        />

        {existing && (
          <View style={styles.activeRow}>
            <Text style={styles.label}>Active (ends it early if off)</Text>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: Colors.accent, false: Colors.line }} />
          </View>
        )}
      </View>

      <Text style={styles.sectionHeader}>Location (optional)</Text>
      <Text style={styles.sectionSubtitle}>
        Pin the spot and set a radius to require the proof photo be taken there — without this, "go to X" relies on the AI check alone.
      </Text>
      <View style={styles.card}>
        <LocationPickerMap value={location} onChange={setLocation} />
      </View>

      <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Start challenge'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.ink, marginBottom: 4 },
  pageSubtitle: { fontSize: 12.5, color: Colors.muted, marginBottom: Spacing.three, lineHeight: 18 },
  sectionHeader: { fontSize: 12, fontWeight: '800', color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  sectionSubtitle: { fontSize: 12.5, color: Colors.muted, lineHeight: 17, marginBottom: 8 },
  card: { backgroundColor: Colors.card, borderRadius: Radius.card, padding: Spacing.three, gap: 6, marginBottom: Spacing.four },
  label: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4, marginTop: 10 },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    padding: 12,
    fontSize: 14.5,
    color: Colors.ink,
  },
  inputMultiline: { minHeight: 70 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.line },
  segmentActive: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  segmentText: { fontSize: 12.5, fontWeight: '700', color: Colors.muted },
  segmentTextActive: { color: Colors.accent },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  preset: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.line },
  presetText: { fontSize: 12.5, fontWeight: '700', color: Colors.muted },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
