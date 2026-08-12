// Gumpa — create/edit a developer-authored custom challenge. Reached only
// from the hidden /dev panel; server-side requireDeveloper is the actual
// gate (see server/src/dev-challenges.ts), this screen assumes it already
// got past that to even see the list it was launched from.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { LocationPickerMap } from '@/components/location-picker-map';
import type { LocationPickerValue } from '@/components/location-picker-map.types';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  createAdminChallenge,
  GUIDE_CHECKLIST_ITEMS,
  setAdminChallengeActive,
  updateAdminChallenge,
  type AdminChallenge,
  type GuideChecklist,
} from '@/lib/admin-api';
import type { Cadence, ProofType, VerifyMethod } from '@/lib/data';
import { useAuthStore } from '@/lib/auth';
import { useToastStore } from '@/lib/toast';

const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly'];
const VERIFY_METHODS: VerifyMethod[] = ['photo', 'streak'];
const PROOF_TYPES: ProofType[] = ['camera', 'screenshot', 'either'];

const EMPTY_CHECKLIST: GuideChecklist = {
  routineBreaking: false,
  named: false,
  photoProvable: false,
  cadenceAppropriate: false,
  noRedFlagVerbs: false,
};

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

export default function DevChallengeFormScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const params = useLocalSearchParams<{ challenge?: string }>();
  const existing: AdminChallenge | null = params.challenge ? JSON.parse(params.challenge) : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [desc, setDesc] = useState(existing?.desc ?? '');
  const [tokens, setTokens] = useState(existing ? String(existing.tokens) : '');
  const [cadence, setCadence] = useState<Cadence>(existing?.cadence ?? 'daily');
  const [verify, setVerify] = useState<VerifyMethod>(existing?.verify ?? 'photo');
  const [proofType, setProofType] = useState<ProofType>(existing?.proofType ?? 'camera');
  const [streakTarget, setStreakTarget] = useState(existing?.streakTarget ? String(existing.streakTarget) : '');
  const [location, setLocation] = useState<LocationPickerValue | null>(
    existing?.placeLat != null && existing?.placeLng != null && existing?.radiusMeters != null
      ? { lat: existing.placeLat, lng: existing.placeLng, radiusMeters: existing.radiusMeters }
      : null
  );
  const [proofAccept, setProofAccept] = useState(existing?.proofAccept ?? '');
  const [proofReject, setProofReject] = useState(existing?.proofReject ?? '');
  const [verifiabilityNotes, setVerifiabilityNotes] = useState(existing?.verifiabilityNotes ?? '');
  const [checklist, setChecklist] = useState<GuideChecklist>(existing?.guideChecklist ?? EMPTY_CHECKLIST);
  const [active, setActive] = useState(existing?.active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!token) return;
    const tokensNum = Number(tokens);
    if (!title.trim() || !desc.trim()) {
      show('Title and description are required.');
      return;
    }
    if (!Number.isInteger(tokensNum) || tokensNum <= 0) {
      show('Tokens must be a positive whole number.');
      return;
    }
    const streakTargetNum = verify === 'streak' ? Number(streakTarget) : undefined;
    if (verify === 'streak' && (!Number.isInteger(streakTargetNum) || (streakTargetNum ?? 0) <= 0)) {
      show('Streak target must be a positive whole number.');
      return;
    }

    setSaving(true);
    const input = {
      title: title.trim(),
      desc: desc.trim(),
      tokens: tokensNum,
      cadence,
      verify,
      proofType,
      streakTarget: streakTargetNum,
      ...(location ? { placeLat: location.lat, placeLng: location.lng, radiusMeters: location.radiusMeters } : {}),
      ...(proofAccept.trim() ? { proofAccept: proofAccept.trim() } : {}),
      ...(proofReject.trim() ? { proofReject: proofReject.trim() } : {}),
      ...(verifiabilityNotes.trim() ? { verifiabilityNotes: verifiabilityNotes.trim() } : {}),
      guideChecklist: checklist,
    };
    const result = existing ? await updateAdminChallenge(token, existing.id, input) : await createAdminChallenge(token, { ...input, active });
    if (!result.ok) {
      setSaving(false);
      show(result.message);
      return;
    }
    if (existing && existing.active !== active) {
      const activeResult = await setAdminChallengeActive(token, existing.id, active);
      if (!activeResult.ok) {
        setSaving(false);
        show(activeResult.message);
        return;
      }
    }
    setSaving(false);
    router.back();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}>
      <BackButton />
      <Text style={styles.pageTitle}>{existing ? 'Edit task' : 'New task'}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Do 20 push-ups" placeholderTextColor={Colors.muted} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={desc}
          onChangeText={setDesc}
          placeholder="Photograph yourself mid-set."
          placeholderTextColor={Colors.muted}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Token payout</Text>
        <TextInput style={styles.input} value={tokens} onChangeText={setTokens} placeholder="15" placeholderTextColor={Colors.muted} keyboardType="number-pad" />

        <Text style={styles.label}>Cadence</Text>
        <Segmented options={CADENCES} value={cadence} onChange={setCadence} />

        <Text style={styles.label}>Verify method</Text>
        <Segmented options={VERIFY_METHODS} value={verify} onChange={setVerify} labels={{ photo: 'Single photo', streak: 'Streak' }} />

        {verify === 'streak' && (
          <>
            <Text style={styles.label}>Streak target (check-ins)</Text>
            <TextInput style={styles.input} value={streakTarget} onChangeText={setStreakTarget} placeholder="5" placeholderTextColor={Colors.muted} keyboardType="number-pad" />
          </>
        )}

        <Text style={styles.label}>Proof type</Text>
        <Segmented options={PROOF_TYPES} value={proofType} onChange={setProofType} labels={{ camera: 'Camera', screenshot: 'Screenshot', either: 'Either' }} />

        <View style={styles.activeRow}>
          <Text style={styles.label}>Active (shows in rotation)</Text>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: Colors.accent, false: Colors.line }} />
        </View>
      </View>

      <Text style={styles.sectionHeader}>Location (optional)</Text>
      <Text style={styles.sectionSubtitle}>
        Pin a spot and set a radius to require the proof photo be taken there — the same GPS check real-venue tasks already get.
      </Text>
      <View style={styles.card}>
        <LocationPickerMap value={location} onChange={setLocation} />
      </View>

      <Text style={styles.sectionHeader}>Verification hints (optional)</Text>
      <Text style={styles.sectionSubtitle}>Short phrases merged into the /verify prompt Claude sees for this specific task.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Proof accept</Text>
        <TextInput
          style={styles.input}
          value={proofAccept}
          onChangeText={setProofAccept}
          placeholder="a visible street sign or landmark in frame"
          placeholderTextColor={Colors.muted}
          maxLength={200}
        />
        <Text style={styles.label}>Proof reject</Text>
        <TextInput
          style={styles.input}
          value={proofReject}
          onChangeText={setProofReject}
          placeholder="reject if no gym equipment visible"
          placeholderTextColor={Colors.muted}
          maxLength={200}
        />
      </View>

      <Text style={styles.sectionHeader}>Guide checklist (optional)</Text>
      <Text style={styles.sectionSubtitle}>
        A self-review aid, not a requirement — see docs/challenge-writing-guide.md. Checking these boxes has no effect on whether
        the task can be published.
      </Text>
      <View style={styles.card}>
        {GUIDE_CHECKLIST_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            style={styles.checklistRow}
            onPress={() => setChecklist((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}>
            <Switch
              value={checklist[item.key]}
              onValueChange={(v) => setChecklist((prev) => ({ ...prev, [item.key]: v }))}
              trackColor={{ true: Colors.accent, false: Colors.line }}
            />
            <Text style={styles.checklistLabel}>{item.label}</Text>
          </Pressable>
        ))}
        <Text style={[styles.label, { marginTop: 10 }]}>Verifiability notes (audit trail only, never shown to Claude or users)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={verifiabilityNotes}
          onChangeText={setVerifiabilityNotes}
          placeholderTextColor={Colors.muted}
          multiline
          textAlignVertical="top"
          maxLength={500}
        />
      </View>

      <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Create task'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.ink, marginBottom: Spacing.three },
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
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checklistLabel: { flex: 1, fontSize: 13, color: Colors.ink, lineHeight: 18 },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
