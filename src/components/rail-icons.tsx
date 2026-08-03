// Gumpa — simple white line-art marks for the nav rail. Each one reads
// at a glance as "where this button takes you," no emoji required.

import { Circle, Path, Rect, Svg } from 'react-native-svg';

type IconProps = { size?: number; color?: string };

export function TasksIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path d="M4 6h5M4 12h5M4 18h5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M14 6.2l1.4 1.4L18 5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 12.2l1.4 1.4L18 11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 18.2l1.4 1.4L18 17" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function FeedIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Rect x="4" y="4" width="13" height="13" rx="2.5" stroke={color} strokeWidth={2} />
      <Path d="M8 20h10a1 1 0 0 0 1-1V9" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function FriendsIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx="9" cy="8" r="3" stroke={color} strokeWidth={2} />
      <Path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="17.5" cy="9" r="2.3" stroke={color} strokeWidth={2} />
      <Path d="M15.8 19c.2-2.2 1.9-3.8 4.2-3.8" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function GroupsIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path d="M12 4l8 15H4L12 4Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M9.5 19L12 12l2.5 7" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function RewardsIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Rect x="3.5" y="8.5" width="17" height="4" rx="1" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Rect x="4.5" y="12.5" width="15" height="8" rx="1" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M12 8.5v12" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M12 8.5c-1-3-3-4.5-4.5-4.5A2 2 0 0 0 5.5 6c0 1.6 1.6 2.5 3 2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 8.5c1-3 3-4.5 4.5-4.5A2 2 0 0 1 18.5 6c0 1.6-1.6 2.5-3 2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LockIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Rect x="5" y="11" width="14" height="9" rx="2" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M8 11V7.5a4 4 0 0 1 8 0V11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="15.2" r="1.4" fill={color} />
    </Svg>
  );
}

export function ProfileIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx="12" cy="8.2" r="3.4" stroke={color} strokeWidth={2} />
      <Path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckBadgeIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={2} />
      <Path d="M8.3 12.3l2.6 2.6 4.8-5.4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CameraIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path d="M9 6.5l1-1.8h4l1 1.8h2.5A1.5 1.5 0 0 1 19 8v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17V8a1.5 1.5 0 0 1 1.5-1.5H9Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx="12" cy="12.2" r="3.1" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function ScreenshotIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Rect x="4" y="5" width="16" height="14" rx="2" stroke={color} strokeWidth={2} />
      <Path d="M4 15.5l4-4 3 3 4.5-4.5L20 14" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="8.3" cy="9" r="1.3" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function CommentIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H10.8L6 19v-4H6.5A2.5 2.5 0 0 1 4 12.5v-6Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// The "cheer" mark — an outline heart that fills solid in the active state,
// with the fill/no-fill swap driven entirely by the caller (see PostCard in
// src/app/index.tsx, which also runs a scale pop via reanimated on tap).
export function CheerIcon({ size = 20, color = '#fff', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

export function CoinIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="4.6" stroke={color} strokeWidth={1.5} />
      <Path d="M12 9.4v5.2M10.4 12h3.2" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// Marks a day streak — used on Profile in place of the old 🔥 emoji.
export function StreakIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path
        d="M12 3c2 3-1 4-1 7a3 3 0 0 0 6 0c0-.8-.2-1.4-.5-2 1.5 1.3 2.5 3.2 2.5 5.2A6.8 6.8 0 0 1 12 20a6.8 6.8 0 0 1-6.8-6.8c0-2.9 1.6-5 3.3-6.6-.2 1.6.3 2.9 1.3 3.6.4-2.8 1-4.7 2.2-7.2Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Marks the level stat — used on Profile in place of the old ⭐ emoji.
export function LevelIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path
        d="M12 3.5l2.47 5.01 5.53.8-4 3.9.94 5.5L12 16.9l-4.94 2.6.94-5.5-4-3.9 5.53-.8L12 3.5Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// Gear mark — links to the Settings screen from Profile.
export function SettingsIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={2} />
      <Path
        d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M17.66 6.34l-1.49 1.49M7.83 16.17l-1.49 1.49M17.66 17.66l-1.49-1.49M7.83 7.83L6.34 6.34"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// A simple question mark in a circle — links FAQ rows from Settings.
export function QuestionIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={2} />
      <Path
        d="M9.6 9.6a2.4 2.4 0 1 1 3.55 2.1c-.66.38-1.15.86-1.15 1.6v.4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="16.9" r="1.05" fill={color} />
    </Svg>
  );
}

// Chevron used to hint a row is expandable/navigable in Settings/FAQ lists.
export function ChevronRightIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Chevron used for expand/collapse state on an accordion row (rotated via
// the caller's transform, not baked into the path).
export function ChevronDownIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path d="M5 9l7 7 7-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Lightbulb mark — the "have a recommendation?" prompt in Settings.
export function BulbIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path
        d="M12 3.5a5.8 5.8 0 0 0-3.3 10.56c.5.35.8.9.8 1.5v.44h5v-.44c0-.6.3-1.15.8-1.5A5.8 5.8 0 0 0 12 3.5Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M9.5 19h5M10.3 21.5h3.4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
