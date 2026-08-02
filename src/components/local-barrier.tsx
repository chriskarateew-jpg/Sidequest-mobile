// Gumpa — the animated highlight that marks a location-tied challenge
// card: a soft full ring plus a brighter arc that slowly orbits the card's
// border, in the app's own brand blues (accent/accent2), reading as "this
// card is being highlighted" rather than a caution-tape motif.
//
// Drives the rotation with a plain setInterval + state tick rather than
// react-native-svg's Pattern/Rect (third-party, web-rendered SVG
// primitives, not real RN host Views) supporting a driver's fast-path prop
// updates. Plain state goes through a normal React re-render every tick,
// which is guaranteed to reach the DOM/native prop regardless — and at the
// ~15fps this uses, a state-driven re-render costs nothing noticeable for
// the handful of local cards ever on screen at once.
//
// The <Svg>/<Rect> below take explicit pixel width/height from onLayout
// rather than percentage strings — confirmed the hard way that this
// actually matters: percentage dimensions on the SVG root resolve against
// the browser's rendered box on web (so this looked correct there), but
// react-native-svg's native (iOS/Android) renderer doesn't reliably resolve
// them the same way without an explicit width/height or viewBox on <Svg>
// itself, which is why an earlier version of this border only traced part
// of the card on a real device even though it verified fine on web.

import { useCallback, useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Rect, Svg } from 'react-native-svg';

import { Colors } from '@/constants/theme';

const TICK_MS = 45;
const ROTATE_MS = 15000; // one full lap around the border — "slowly rotating"
const HIGHLIGHT_FRACTION = 0.24; // portion of the perimeter that's lit at once

export function LocalBarrierBorder({ radius = 18, strokeWidth = 3 }: { radius?: number; strokeWidth?: number }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setElapsedMs((t) => t + TICK_MS), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  return (
    <View style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' }]} onLayout={onLayout}>
      {size &&
        (() => {
          const w = size.width - strokeWidth;
          const h = size.height - strokeWidth;
          // The stroked rect is inset by strokeWidth/2 on every side (so the
          // stroke itself isn't clipped at the edges) — on straight runs an
          // inset doesn't change anything, but at a rounded corner, reusing
          // the same `radius` as the card's own outer clip is NOT concentric
          // with it: same nominal radius, different arc center, so the
          // stroke's outer edge drifts away from the card's true corner
          // right at the curve (confirmed visually — the image's actual
          // rounded corner peeked out from behind the stroke). Subtracting
          // the inset from the radius here re-centers the arc so the
          // stroke's outer edge exactly retraces the card's own corner.
          const r = Math.max(0, Math.min(radius - strokeWidth / 2, w / 2, h / 2));
          // Perimeter of a rounded rect: two straight runs per side (each
          // shortened by the corner radius) plus the four corner arcs,
          // which together make one full circle of that radius.
          const perimeter = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
          const highlightLen = perimeter * HIGHLIGHT_FRACTION;
          const progress = (elapsedMs % ROTATE_MS) / ROTATE_MS;

          return (
            <Svg width={size.width} height={size.height}>
              {/* Soft full outline, always visible, so the border reads as
                  present even between highlight passes. */}
              <Rect
                x={strokeWidth / 2}
                y={strokeWidth / 2}
                width={w}
                height={h}
                rx={r}
                fill="none"
                stroke={Colors.accentSoft}
                strokeWidth={strokeWidth}
              />
              {/* Brighter arc orbiting the same outline. */}
              <Rect
                x={strokeWidth / 2}
                y={strokeWidth / 2}
                width={w}
                height={h}
                rx={r}
                fill="none"
                stroke={Colors.accent}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${highlightLen} ${perimeter - highlightLen}`}
                strokeDashoffset={-progress * perimeter}
              />
            </Svg>
          );
        })()}
    </View>
  );
}
