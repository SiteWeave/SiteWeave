import { Text as RNText, StyleSheet } from 'react-native';
import { colors, typography } from '../../theme';

const variants = {
  screenTitle: typography.screenTitle,
  section: typography.sectionTitle,
  body: typography.body,
  bodyMedium: typography.bodyMedium,
  caption: typography.caption,
};

export function Text({ variant = 'body', style, children, ...props }) {
  return (
    <RNText style={[variants[variant] || variants.body, style]} {...props}>
      {children}
    </RNText>
  );
}

export default Text;
