import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableWithFade from '../PressableWithFade';
import { colors, shadows, touch, spacing } from '../../theme';
import { useBranding } from '../../context/BrandingContext';
import { useHaptics } from '../../hooks/useHaptics';

/** Space reserved above the floating tab bar (content + FABs) */
export const TAB_BAR_CLEARANCE = 96;

/** ScrollView contentContainerStyle bottom inset (tab bar + home indicator). */
export function scrollBottomPadding(insets, extra = 0) {
  return TAB_BAR_CLEARANCE + Math.max(insets?.bottom ?? 0, spacing.md) + extra;
}

const TAB_CONFIG = [
  { name: 'index', titleKey: 'mobile.tab_home', icon: 'home', iconOutline: 'home-outline' },
  { name: 'projects', titleKey: 'mobile.tab_projects', icon: 'folder', iconOutline: 'folder-outline' },
  { name: 'calendar', titleKey: 'mobile.tab_calendar', icon: 'calendar', iconOutline: 'calendar-outline' },
  { name: 'more', titleKey: 'mobile.tab_more', icon: 'ellipsis-horizontal', iconOutline: 'ellipsis-horizontal' },
];

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { primaryColor } = useBranding();
  const haptics = useHaptics();
  const { t } = useTranslation();

  const currentRoute = state.routes[state.index]?.name;

  const onTabPress = (routeName) => {
    haptics.selection();
    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes.find((r) => r.name === routeName)?.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} pointerEvents="box-none">
      <View style={styles.pill}>
        {TAB_CONFIG.map((tab) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
          if (routeIndex < 0) return null;
          const isFocused = currentRoute === tab.name;
          const label = t(tab.titleKey);

          return (
            <PressableWithFade
              key={tab.name}
              style={styles.tab}
              onPress={() => onTabPress(tab.name)}
              testID={`tab-${tab.name}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isFocused }}
            >
              <View style={[styles.iconWrap, isFocused && { backgroundColor: colors.primaryLight }]}>
                <Ionicons
                  name={isFocused ? tab.icon : tab.iconOutline}
                  size={22}
                  color={isFocused ? primaryColor : colors.textMuted}
                />
              </View>
            </PressableWithFade>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: 32,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    ...shadows.floatingNav,
  },
  tab: { flex: 1, alignItems: 'center' },
  iconWrap: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
