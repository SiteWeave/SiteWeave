import { View, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';
import { contentTopInset, scrollBottomPadding } from '../../utils/layoutInsets';

export {
  contentTopInset,
  scrollBottomPadding,
  fabBottomOffset,
  sheetBottomPadding,
  sheetScrollEndPadding,
  sheetListEndPadding,
} from '../../utils/layoutInsets';

export function Screen({
  children,
  style,
  scroll = false,
  contentContainerStyle,
  refreshControl,
  topExtra = spacing.sm,
}) {
  const insets = useSafeAreaInsets();
  const paddingTop = contentTopInset(insets, topExtra);
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
