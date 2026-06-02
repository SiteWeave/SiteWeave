import { View, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';

/** Tab screens: safe area + padding above floating tab bar */
export { TAB_BAR_CLEARANCE, scrollBottomPadding } from './FloatingTabBar';

export function Screen({ children, style, scroll = false, contentContainerStyle, refreshControl }) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + spacing.sm;
  const paddingBottom = scrollBottomPadding(insets, spacing.lg);

  if (scroll) {
    return (
      <View style={[styles.root, style]}>
        <ScrollView
          contentContainerStyle={[
            { paddingTop, paddingBottom, paddingHorizontal: spacing.lg },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop, paddingBottom, paddingHorizontal: spacing.lg }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default Screen;
