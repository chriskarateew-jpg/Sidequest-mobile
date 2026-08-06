// Gumpa — interactive location picker: tap or drag the red pin to place
// it, use the slider below to size the radius circle. Native only
// (react-native-maps has no web renderer — see location-picker-map.web.tsx
// for the fallback used there; the RadiusSlider itself is shared by both).
//
// Radius used to be a second draggable "handle" marker at the circle's
// edge — dropped in favor of a dedicated slider (see radius-slider.tsx)
// because dragging a handle on the map competed with the map's own
// pan/zoom gesture recognizer, and the same pixel-drag distance meant a
// wildly different real-world radius depending on zoom level. Neither
// problem applies to a fixed linear control.
//
// The pin itself renders as an oversized custom circle (not the library's
// thin default pin marker) since that default's hit area is a small tip
// point, not the visually-larger head — harder to grab reliably.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, type LatLng, type MapPressEvent, type MarkerDragEvent, type MarkerDragStartEndEvent } from 'react-native-maps';

import { RadiusSlider } from '@/components/radius-slider';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { getCurrentPreciseLocation } from '@/lib/location';
import { DEFAULT_RADIUS_METERS, type LocationPickerMapProps } from '@/components/location-picker-map.types';

const FALLBACK_REGION = { latitude: 40.7128, longitude: -74.006 }; // NYC — only used if the device's own location is unavailable/denied
const MAP_HEIGHT = 240;
// 0.02 degrees is a comfortable "few blocks" zoom level for placing a pin —
// tight enough to be useful, loose enough to still see nearby landmarks.
const DEFAULT_LAT_LNG_DELTA = 0.02;

// Bigger, easier-to-grab circular touch target than the library's default
// pin. anchor={{x:0.5,y:0.5}} centers the view exactly on the coordinate
// instead of the pin-image default anchor at the bottom tip.
function DotMarker({ color, size }: { color: string; size: number }) {
  return <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />;
}

export function LocationPickerMap({ value, onChange }: LocationPickerMapProps) {
  const mapRef = useRef<MapView>(null);
  const [center, setCenter] = useState<LatLng | null>(value ? { latitude: value.lat, longitude: value.lng } : null);
  const [radiusMeters, setRadiusMeters] = useState(value?.radiusMeters ?? DEFAULT_RADIUS_METERS);
  const [initialCamera] = useState<LatLng>(center ?? FALLBACK_REGION);

  // Recenters the map imperatively (via animateToRegion) rather than a
  // controlled `region` prop — a controlled region re-applied on every
  // state change fights the user's own drag gesture (the map keeps trying
  // to recenter mid-drag). Imperative recentering only fires for
  // deliberate moments (initial load, "Use current location"), never
  // during a drag.
  useEffect(() => {
    if (center) return;
    getCurrentPreciseLocation().then((loc) => {
      if (loc.status === 'ok') {
        mapRef.current?.animateToRegion({ latitude: loc.lat, longitude: loc.lng, latitudeDelta: DEFAULT_LAT_LNG_DELTA, longitudeDelta: DEFAULT_LAT_LNG_DELTA }, 400);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (nextCenter: LatLng, nextRadius: number) => {
    setCenter(nextCenter);
    setRadiusMeters(nextRadius);
    onChange({ lat: nextCenter.latitude, lng: nextCenter.longitude, radiusMeters: nextRadius });
  };

  const handleMapPress = (e: MapPressEvent) => {
    commit(e.nativeEvent.coordinate, radiusMeters);
  };

  const handlePinDrag = (e: MarkerDragEvent) => {
    // Live-update while dragging (not committed to the parent yet — that
    // happens on release) so the circle visibly follows the pin instead of
    // only jumping to the new spot after letting go.
    setCenter(e.nativeEvent.coordinate);
  };

  const handlePinDragEnd = (e: MarkerDragStartEndEvent) => {
    commit(e.nativeEvent.coordinate, radiusMeters);
  };

  const handleRadiusChange = (meters: number) => {
    if (!center) {
      setRadiusMeters(meters);
      return;
    }
    commit(center, meters);
  };

  const handleUseCurrentLocation = async () => {
    const loc = await getCurrentPreciseLocation();
    if (loc.status !== 'ok') return;
    commit({ latitude: loc.lat, longitude: loc.lng }, radiusMeters);
    mapRef.current?.animateToRegion({ latitude: loc.lat, longitude: loc.lng, latitudeDelta: DEFAULT_LAT_LNG_DELTA, longitudeDelta: DEFAULT_LAT_LNG_DELTA }, 400);
  };

  const handleClear = () => {
    setCenter(null);
    onChange(null);
  };

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ ...initialCamera, latitudeDelta: DEFAULT_LAT_LNG_DELTA, longitudeDelta: DEFAULT_LAT_LNG_DELTA }}
        onPress={handleMapPress}>
        {center && (
          <>
            <Circle center={center} radius={radiusMeters} strokeColor={Colors.red} fillColor="rgba(255,59,48,0.15)" strokeWidth={2} />
            <Marker coordinate={center} draggable anchor={{ x: 0.5, y: 0.5 }} onDrag={handlePinDrag} onDragEnd={handlePinDragEnd}>
              <DotMarker color={Colors.red} size={28} />
            </Marker>
          </>
        )}
      </MapView>
      <Text style={styles.hint}>{center ? 'Drag the pin to move it.' : 'Tap the map to drop a pin, or use your current location.'}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={handleUseCurrentLocation}>
          <Text style={styles.actionBtnText}>Use current location</Text>
        </Pressable>
        {center && (
          <Pressable style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearBtnText}>Remove location</Text>
          </Pressable>
        )}
      </View>
      <RadiusSlider radiusMeters={radiusMeters} onChange={handleRadiusChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  map: { height: MAP_HEIGHT, borderRadius: Radius.sm, overflow: 'hidden' },
  dot: { borderWidth: 3, borderColor: '#fff', ...Shadow },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: 2 },
  actionBtn: { backgroundColor: Colors.accentSoft, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  actionBtnText: { color: Colors.accent, fontWeight: '800', fontSize: 12.5 },
  clearBtn: {},
  clearBtnText: { color: Colors.red, fontWeight: '800', fontSize: 12.5 },
});
