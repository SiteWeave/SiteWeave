import React from 'react';
import { View, Text, StyleSheet, Platform, Animated } from 'react-native';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableWithFade from '../PressableWithFade';
import { colors, shadows, touch, spacing } from '../../theme';
import { useBranding } from '../../context/BrandingContext';
import { useHaptics } from '../../hooks/useHaptics';
import { useCreateAction } from '../../context/CreateActionContext';
import { useSheetOverlay } from '../../context/SheetOverlayContext';

const TAB_ROW_HEIGHT = 56;
const CREATE_SIZE = 52;
const CREATE_LIFT = 16;

const LEFT_TABS = [
  { name: 'index', titleKey: 'mobile.tab_home', icon: 'home', iconOutline: 'home-outline' },
  { name: 'projects', titleKey: 'mobile.tab_projects', icon: 'folder', iconOutline: 'folder-outline' },
];

const RIGHT_TABS = [
  { name: 'calendar', titleKey: 'mobile.tab_calendar', icon: 'calendar', iconOutline: 'calendar-outline' },
  { name: 'more', titleKey: 'mobile.tab_more', icon: 'ellipsis-horizontal', iconOutline: 'ellipsis-horizontal' },
];

function isTabFocused(tabName, navigationState) {
  const route = navigationState?.routes?.[navigationState.index];
  return route?.name === tabName;
}

function TabSlot({ tab, isFocused, label, primaryColor, onPress }) {
  return (
    <View style={styles.tabWrap}>
      <PressableWithFade
        style={styles.tab}
        onPress={onPress}
        static
        testID={`tab-${tab.name}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isFocused }}
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name={isFocused ? tab.icon : tab.iconOutline}
            size={22}
            color={isFocused ? primaryColor : colors.textMuted}
          />
        </View>
        <Text
          style={[
            styles.label,
            isFocused ? styles.labelActive : styles.labelInactive,
            isFocused && { color: primaryColor },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </PressableWithFade>
    </View>
  );
}

export default function FloatingTabBar({ state, navigation, insets }) {
  const onHeightChange = React.useContext(BottomTabBarHeightCallbackContext);
  const { primaryColor } = useBranding();
  const haptics = useHaptics();
  const { t } = useTranslation();
  const { openCreateMenu, showCreateButton } = useCreateAction();
  const sheetOverlay = useSheetOverlay();
  const tabBarOpacity = sheetOverlay?.tabBarOpacity ?? 1;
  const tabBarTranslateY = sheetOverlay?.tabBarTranslateY ?? 0;
  const tabBarPointerEvents = sheetOverlay?.tabBarHidden ? 'none' : 'box-none';

  const bottomInset = insets?.bottom ?? 0;
  const topPad = showCreateButton ? CREATE_LIFT : 0;

  const onTabPress = (routeName) => {
    haptics.selection();
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const renderTab = (tab) => {
    const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
    if (routeIndex < 0) return <View key={tab.name} style={styles.tabWrap} />;
    const isFocused = isTabFocused(tab.name, state);
    const label = t(tab.titleKey);
    return (
      <TabSlot
        key={tab.name}
        tab={tab}
        isFocused={isFocused}
        label={label}
        primaryColor={primaryColor}
        onPress={() => onTabPress(tab.name)}
      />
    );
  };

  const allTabs = [...LEFT_TABS, ...RIGHT_TABS];

  return (
    <Animated.View
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[
        styles.shell,
        {
          paddingBottom: bottomInset + spacing.sm,
          paddingTop: topPad,
          opacity: tabBarOpacity,
          transform: [{ translateY: tabBarTranslateY }],
        },
      ]}
      pointerEvents={tabBarPointerEvents}
    >
      <View style={styles.row}>
        {showCreateButton ? (
          <>
            <View style={styles.side}>{LEFT_TABS.map(renderTab)}</View>
            <View style={styles.createSlot}>
              <PressableWithFade
                style={[
                  styles.createBtn,
                  { backgroundColor: primaryColor, marginTop: -CREATE_LIFT },
                ]}
                onPress={openCreateMenu}
                testID="tab-create"
                accessibilityRole="button"
                accessibilityLabel={t('mobile.create_menu_title')}
                hapticType="medium"
              >
                <Ionicons name="add" size={28} color={colors.white} />
              </PressableWithFade>
            </View>
            <View style={styles.side}>{RIGHT_TABS.map(renderTab)}</View>
          </>
        ) : (
          allTabs.map(renderTab)
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: TAB_ROW_HEIGHT,
    paddingHorizontal: spacing.xs,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
  },
  createSlot: {
    width: CREATE_SIZE + spacing.lg,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  createBtn: {
    width: CREATE_SIZE,
    height: CREATE_SIZE,
    borderRadius: CREATE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floatingNav,
  },
  tabWrap: {
    flex: 1,
  },
  tab: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.minSize,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  iconWrap: {
    width: 32,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    textAlign: 'center',
    includeFontPadding: false,
  },
  labelActive: {
    fontWeight: '600',
  },
  labelInactive: {
    fontWeight: '500',
    color: colors.textMuted,
  },
});
