// Gumpa — web fallback for the location picker. react-native-maps has no
// web renderer at all, so this is plain numeric inputs instead of an
// interactive map — same onChange contract as location-picker-map.native.tsx,
// used only if the dev panel is ever opened in a desktop browser (the real
// map only exists in the native app build).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RadiusSlider } from '@/components/radius-slider';
import { Colors, Radius } from '@/constants/theme';
import { DEFAULT_RADIUS_METERS, type LocationPickerMapProps } from '@/components/location-picker-map.types';

export function LocationPickerMap({ value, onChange }: LocationPickerMapProps) {
  const [lat, setLat] = useState(value ? String(value.lat) : '');
  const [lng, setLng] = useState(value ? String(value.lng) : '');
  const [radiusMeters, setRadiusMeters] = useState(value?.radiusMeters ?? DEFAULT_RADIUS_METERS);

  const commit = (nextLat: string, nextLng: string, nextRadius: number) => {
    const latNum = Number(nextLat);
    const lngNum = Number(nextLng);
    if (!nextLat || !nextLng || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
    onChange({ lat: latNum, lng: lngNum, radiusMeters: nextRadius });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Map editing only works in the native app build (react-native-maps has no web renderer). Enter coordinates directly here for
        testing.
      </Text>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>Latitude</Text>
          <TextInput
            style={styles.input}
            value={lat}
            onChangeText={(v) => {
              setLat(v);
              commit(v, lng, radiusMeters);
            }}
            placeholder="40.7128"
            placeholderTextColor={Colors.muted}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Longitude</Text>
          <TextInput
            style={styles.input}
            value={lng}
            onChangeText={(v) => {
              setLng(v);
              commit(lat, v, radiusMeters);
            }}
            placeholder="-74.0060"
            placeholderTextColor={Colors.muted}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      <RadiusSlider
        radiusMeters={radiusMeters}
        onChange={(meters) => {
          setRadiusMeters(meters);
          commit(lat, lng, meters);
        }}
      />
      {value && (
        <Pressable
          style={styles.clearBtn}
          onPress={() => {
            setLat('');
            setLng('');
            setRadiusMeters(DEFAULT_RADIUS_METERS);
            onChange(null);
          }}>
          <Text style={styles.clearBtnText}>Remove location</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 17, fontStyle: 'italic' },
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1 },
  label: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4, marginTop: 6 },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    padding: 12,
    fontSize: 14.5,
    color: Colors.ink,
  },
  clearBtn: { alignSelf: 'flex-start', marginTop: 4 },
  clearBtnText: { color: Colors.red, fontWeight: '800', fontSize: 12.5 },
});
