import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';

const CORNER_RADIUS = 20;
const NOTCH_RADIUS = 32;

/**
 * White tab bar background with a top-center semicircular notch for the raised Create FAB.
 */
export default function CurvedTabBarBackground({ width, height, fill = colors.surface, showNotch = true }) {
  if (!width || width <= 0) return null;

  const cx = width / 2;
  const left = 0;
  const right = width;
  const bottom = height;
  const top = 0;

  const path = showNotch
    ? [
        `M ${left + CORNER_RADIUS} ${top}`,
        `L ${cx - NOTCH_RADIUS} ${top}`,
        `Q ${cx} ${-NOTCH_RADIUS} ${cx + NOTCH_RADIUS} ${top}`,
        `L ${right - CORNER_RADIUS} ${top}`,
        `Q ${right} ${top} ${right} ${top + CORNER_RADIUS}`,
        `L ${right} ${bottom}`,
        `L ${left} ${bottom}`,
        `L ${left} ${top + CORNER_RADIUS}`,
        `Q ${left} ${top} ${left + CORNER_RADIUS} ${top}`,
        'Z',
      ].join(' ')
    : [
        `M ${left + CORNER_RADIUS} ${top}`,
        `L ${right - CORNER_RADIUS} ${top}`,
        `Q ${right} ${top} ${right} ${top + CORNER_RADIUS}`,
        `L ${right} ${bottom}`,
        `L ${left} ${bottom}`,
        `L ${left} ${top + CORNER_RADIUS}`,
        `Q ${left} ${top} ${left + CORNER_RADIUS} ${top}`,
        'Z',
      ].join(' ');

  const viewHeight = showNotch ? height + NOTCH_RADIUS : height;
  const viewBoxY = showNotch ? -NOTCH_RADIUS : 0;

  return (
    <Svg
      width={width}
      height={viewHeight}
      viewBox={`0 ${viewBoxY} ${width} ${viewHeight}`}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <Path d={path} fill={fill} />
    </Svg>
  );
}
