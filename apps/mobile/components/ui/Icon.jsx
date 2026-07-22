/**
 * Mobile icon adapter — prefer Tabler for new UI; Ionicons still OK at call sites.
 * Tabler RN maps strokeWidth → SVG stroke width. Passing `stroke={1.75}` lands in
 * ...rest and overrides stroke *color*, which triggers: "1.75" is not a valid color.
 */
import { colors } from '../../theme';

export function Icon({
  icon: IconComponent,
  size = 22,
  color = colors.text,
  strokeWidth = 1.75,
  /** @deprecated Use strokeWidth — `stroke` is SVG stroke color in RN */
  stroke,
  style,
  ...rest
}) {
  if (!IconComponent) return null;
  const width = typeof strokeWidth === 'number' ? strokeWidth : typeof stroke === 'number' ? stroke : 1.75;
  return (
    <IconComponent
      size={size}
      color={color}
      strokeWidth={width}
      style={style}
      {...rest}
    />
  );
}

export default Icon;
