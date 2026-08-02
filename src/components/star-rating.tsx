// Gumpa — 1-5 star rating, editable (review screen) or read-only (Completed
// screen). Tapping the currently-set star again clears the rating, so an
// accidental tap is easy to undo without a separate "clear" control.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

const STAR_COUNT = 5;
const STARS = Array.from({ length: STAR_COUNT }, (_, i) => i + 1);

export function StarRating({ value, onChange, size = 26 }: { value: number; onChange?: (value: number) => void; size?: number }) {
  return (
    <View style={styles.row}>
      {STARS.map((star) => {
        const filled = star <= value;
        const glyph = (
          <Text style={[styles.star, { fontSize: size }, filled ? styles.starFilled : styles.starEmpty]}>{filled ? '★' : '☆'}</Text>
        );
        if (!onChange) return <View key={star}>{glyph}</View>;
        return (
          <Pressable key={star} testID={`star-${star}`} hitSlop={4} onPress={() => onChange(star === value ? 0 : star)}>
            {glyph}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  star: { fontWeight: '800' },
  starFilled: { color: Colors.gold },
  starEmpty: { color: Colors.line },
});
