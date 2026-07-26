// Sidequest — simple white line-art marks for the nav rail. Each one reads
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

export function ProfileIcon({ size = 20, color = '#fff' }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx="12" cy="8.2" r="3.4" stroke={color} strokeWidth={2} />
      <Path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
