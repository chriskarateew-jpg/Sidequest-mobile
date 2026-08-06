// Gumpa — radius control for the location picker, shared by both
// location-picker-map.native.tsx and .web.tsx (unlike the map itself,
// @react-native-community/slider works on web too, so this doesn't need a
// platform split). A dedicated slider instead of a drag-on-map handle: the
// map-handle approach fought the map's own pan/zoom gesture recognizer and
// meant the same pixel-drag distance was a wildly different real-world
// radius depending on zoom level — a fixed linear control has neither
// problem.

import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { MAX_RADIUS_METERS, MIN_RADIUS_METERS, formatRadius, quantizeRadius } from '@/components/location-picker-map.types';

export function RadiusSlider({ radiusMeters, onChange }: { radiusMeters: number; onChange: (meters: number) => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Radius</Text>
        <Text style={styles.value}>{formatRadius(radiusMeters)}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={MIN_RADIUS_METERS}
        maximumValue={MAX_RADIUS_METERS}
        value={radiusMeters}
        onValueChange={(v) => onChange(quantizeRadius(v))}
        minimumTrackTintColor={Colors.accent}
        maximumTrackTintColor={Colors.line}
        thumbTintColor={Colors.accent}
      />
      <View style={styles.rangeRow}>
        <Text style={styles.rangeLabel}>{formatRadius(MIN_RADIUS_METERS)}</Text>
        <Text style={styles.rangeLabel}>{formatRadius(MAX_RADIUS_METERS)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  label: { fontSize: 11, fontWeight: '800', color: Colors.muted, letterSpacing: 0.4 },
  value: { fontSize: 14, fontWeight: '800', color: Colors.accent },
  slider: { width: '100%', height: 36 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  rangeLabel: { fontSize: 10.5, color: Colors.muted },
});
