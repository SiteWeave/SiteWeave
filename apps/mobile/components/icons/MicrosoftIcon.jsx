import Svg, { Path } from 'react-native-svg';

/** Official multicolor Microsoft logo (same paths as web LoginForm). */
export default function MicrosoftIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image" accessibilityLabel="Microsoft">
      <Path fill="#f25022" d="M1 1h10v10H1z" />
      <Path fill="#00a4ef" d="M13 1h10v10H13z" />
      <Path fill="#7fba00" d="M1 13h10v10H1z" />
      <Path fill="#ffb900" d="M13 13h10v10H13z" />
    </Svg>
  );
}
