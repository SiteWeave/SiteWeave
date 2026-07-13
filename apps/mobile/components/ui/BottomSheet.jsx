import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
  AccessibilityInfo,
  Keyboard,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography, touch } from '../../theme';
import { sheetScrollEndPadding } from '../../utils/layoutInsets';
import PressableWithFade from '../PressableWithFade';
import ModalScrim from './ModalScrim';
import { SheetFocusProvider, useSheetFocus } from './SheetFocusContext';
import SheetInput from './SheetInput';
import { useSheetOverlay } from '../../context/SheetOverlayContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_DRAG = 120;
const DISMISS_VELOCITY = 0.85;
const EXPAND_DRAG = -80;
const EXPAND_VELOCITY = -1.2;
const COLLAPSE_DRAG = 60;

const SNAP_ORDER = ['medium', 'large', 'fullscreen'];

const SNAP_HEIGHTS = {
  content: null,
  medium: Math.round(SCREEN_HEIGHT * 0.52),
  large:  Math.round(SCREEN_HEIGHT * 0.92),
  fullscreen: SCREEN_HEIGHT,
};

function resolveBaseHeight(snap) {
  if (!snap || snap === 'content') return null;
  return SNAP_HEIGHTS[snap] ?? null;
}

function snapIndex(snap) {
  const idx = SNAP_ORDER.indexOf(snap);
  return idx === -1 ? SNAP_ORDER.length : idx;
}

function clampSnap(snap, maxSnap) {
  if (!snap || snap === 'content') return snap;
  if (!maxSnap || maxSnap === 'fullscreen') return snap;
  return snapIndex(snap) <= snapIndex(maxSnap) ? snap : maxSnap;
}

export default function BottomSheet({
  visible,
  title,
  onClose,
  children,
  primaryLabel,
  onPrimary,
  onSecondary,
  secondaryLabel,
  primaryDisabled = false,
  primaryLoading = false,
  hideHeader = false,
  testID,
  minHeight,
  snap = 'content',
  expandOnFocus = false,
  stickyPrimary = false,
  primaryPlacement: primaryPlacementProp,
  footerContent = null,
  hideTabBar = false,
  dismissWithoutAnimation = false,
  onDismissed,
  allowExpand = true,
  maxSnap = 'fullscreen',
  expandOnFocusSnap = 'large',
  closeVariant = 'minimal',
  closePosition = 'right',
  expandDragThreshold = EXPAND_DRAG,
  expandVelocityThreshold = EXPAND_VELOCITY,
  yOffset = 0,
}) {
  const primaryPlacement =
    primaryPlacementProp ?? (stickyPrimary ? 'footer' : 'both');
  const insets = useSafeAreaInsets();
  const sheetOverlay = useSheetOverlay();
  const hideTabBarRef = useRef(hideTabBar);
  hideTabBarRef.current = hideTabBar;
  const dismissWithoutAnimationRef = useRef(dismissWithoutAnimation);
  dismissWithoutAnimationRef.current = dismissWithoutAnimation;
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
  const wasVisibleRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeSnap, setActiveSnap] = useState(snap);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [rendered, setRendered] = useState(visible);
  const renderedRef = useRef(visible);
  const activeSnapRef = useRef(snap);
  activeSnapRef.current = activeSnap;
  const targetHeightRef = useRef(null);
  const cappedActiveSnap = clampSnap(activeSnap, maxSnap);
  const canExpandSheet =
    allowExpand &&
    snap !== 'content' &&
    snapIndex(cappedActiveSnap) < snapIndex(maxSnap);
  const canCollapseSheet =
    allowExpand && snap !== 'content' && snapIndex(cappedActiveSnap) > snapIndex(snap);
  const canExpandRef = useRef(canExpandSheet);
  canExpandRef.current = canExpandSheet;
  const canCollapseRef = useRef(canCollapseSheet);
  canCollapseRef.current = canCollapseSheet;
  const maxSnapRef = useRef(maxSnap);
  maxSnapRef.current = maxSnap;
  const expandOnFocusSnapRef = useRef(expandOnFocusSnap);
  expandOnFocusSnapRef.current = expandOnFocusSnap;
  const expandDragThresholdRef = useRef(expandDragThreshold);
  expandDragThresholdRef.current = expandDragThreshold;
  const expandVelocityThresholdRef = useRef(expandVelocityThreshold);
  expandVelocityThresholdRef.current = expandVelocityThreshold;

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const kbOffsetAnim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(
    new Animated.Value(resolveBaseHeight(snap) || SCREEN_HEIGHT * 0.52),
  ).current;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  // ── reduce-motion ──────────────────────────────────────────────────────────
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // ── keyboard listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      setActiveSnap(snap);
      return;
    }
    setActiveSnap(snap);

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) =>
      setKeyboardHeight(e?.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));

    return () => { showSub.remove(); hideSub.remove(); };
  }, [visible, snap]);

  // ── slide-in / slide-out + scrim ─────────────────────────────────────────
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;

    if (visible && !wasVisible) {
      wasVisibleRef.current = true;
      renderedRef.current = true;
      setRendered(true);
      dragY.setValue(0);
      slideAnim.setValue(SCREEN_HEIGHT);
      scrimOpacity.setValue(0);
      const openHeight = resolveBaseHeight(clampSnap(snap, maxSnap));
      if (openHeight) {
        setActiveSnap(snap);
        heightAnim.setValue(openHeight);
      }
      sheetOverlay?.sheetOpened({ hideTabBar: hideTabBarRef.current, reduceMotion });

      if (reduceMotion) {
        slideAnim.setValue(0);
        scrimOpacity.setValue(1);
        return;
      }

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(scrimOpacity, {
            toValue: 1,
            duration: 280,
            useNativeDriver: false,
          }),
        ]).start();
      });
      return;
    }

    if (!visible && wasVisible) {
      wasVisibleRef.current = false;

      if (!renderedRef.current) return;

      const finishClose = () => {
        renderedRef.current = false;
        dragY.setValue(0);
        setRendered(false);
        sheetOverlay?.sheetClosed({ hideTabBar: hideTabBarRef.current, reduceMotion });
        onDismissedRef.current?.();
      };

      if (reduceMotion || dismissWithoutAnimationRef.current) {
        slideAnim.setValue(SCREEN_HEIGHT);
        scrimOpacity.setValue(0);
        finishClose();
        return;
      }

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start(finishClose);
    }
  }, [visible, reduceMotion, slideAnim, scrimOpacity, dragY, heightAnim, snap, maxSnap, sheetOverlay]);

  // ── keyboard Y-offset  (useNativeDriver: true) ────────────────────────────
  // Move the sheet up by keyboardHeight so it sits above the keyboard.
  useEffect(() => {
    const target = keyboardHeight > 0 ? -keyboardHeight : 0;
    if (reduceMotion) { kbOffsetAnim.setValue(target); return; }
    Animated.timing(kbOffsetAnim, {
      toValue: target,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [keyboardHeight, kbOffsetAnim, reduceMotion]);

  // ── height animation  (useNativeDriver: false) ────────────────────────────
  // When keyboard is visible, clamp the snap height to the available space
  // above it so the sheet never extends off-screen.
  const targetHeight = useMemo(() => {
    const base = resolveBaseHeight(clampSnap(activeSnap, maxSnap));
    if (!base) return null; // content-sized; no explicit height
    if (keyboardHeight > 0) {
      const above = SCREEN_HEIGHT - keyboardHeight - insets.top - spacing.xs;
      return Math.min(base, Math.max(320, above));
    }
    return base;
  }, [activeSnap, maxSnap, keyboardHeight, insets.top]);

  targetHeightRef.current = targetHeight;

  const getNextExpandedSnap = useCallback((current) => {
    const capped = clampSnap(current, maxSnapRef.current);
    const idx = snapIndex(capped);
    const maxIdx = snapIndex(maxSnapRef.current);
    if (idx >= maxIdx) return capped;
    return SNAP_ORDER[idx + 1];
  }, []);

  const getPreviousSnap = useCallback((current) => {
    const idx = snapIndex(current);
    if (idx <= snapIndex(snap)) return snap;
    return SNAP_ORDER[idx - 1];
  }, [snap]);

  const animateHeightTo = useCallback(
    (height, duration = 260) => {
      if (height == null) return;
      if (reduceMotion) {
        heightAnim.setValue(height);
        return;
      }
      Animated.timing(heightAnim, {
        toValue: height,
        duration,
        useNativeDriver: false,
      }).start();
    },
    [heightAnim, reduceMotion],
  );

  useEffect(() => {
    if (targetHeight === null) return;
    if (reduceMotion) { heightAnim.setValue(targetHeight); return; }
    Animated.timing(heightAnim, {
      toValue: targetHeight,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [targetHeight, heightAnim, reduceMotion]);

  // Seed heightAnim when the snap prop itself changes between renders
  useEffect(() => {
    const base = resolveBaseHeight(snap);
    if (base && keyboardHeight === 0) {
      setActiveSnap(snap);
      heightAnim.setValue(base);
    }
  }, [snap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── expand on input focus ──────────────────────────────────────────────────
  const handleInputFocus = useCallback(() => {
    if (!expandOnFocus) return;
    const target = clampSnap(expandOnFocusSnapRef.current, maxSnapRef.current);
    if (snapIndex(activeSnap) >= snapIndex(target)) return;
    setActiveSnap(target);
  }, [expandOnFocus, activeSnap]);

  // ── derived props ──────────────────────────────────────────────────────────
  const showHeaderPrimary =
    onPrimary && (primaryPlacement === 'header' || primaryPlacement === 'both');
  const showFooterPrimary =
    onPrimary && (stickyPrimary || primaryPlacement === 'footer');
  const isFullscreen = clampSnap(activeSnap, maxSnap) === 'fullscreen';

  const combinedTranslateY = Animated.add(Animated.add(slideAnim, kbOffsetAnim), dragY);
  const translatedY = yOffset ? Animated.add(combinedTranslateY, yOffset) : combinedTranslateY;
  const shellPaddingBottom = insets.bottom + spacing.lg;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) {
            dragY.setValue(gestureState.dy);
            scrimOpacity.setValue(
              Math.max(0, 1 - gestureState.dy / (SCREEN_HEIGHT * 0.45)),
            );
            return;
          }

          // Rubber-band preview only — commit snap on release
          if (!canExpandRef.current || targetHeightRef.current == null) return;
          const expandDrag = expandDragThresholdRef.current;
          const previewDy = Math.max(gestureState.dy, expandDrag * 1.5);
          const maxHeight = SCREEN_HEIGHT - insets.top - spacing.sm;
          const expandedHeight = Math.min(
            maxHeight,
            targetHeightRef.current - previewDy * 0.35,
          );
          heightAnim.setValue(expandedHeight);
          dragY.setValue(0);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > DISMISS_DRAG || gestureState.vy > DISMISS_VELOCITY) {
            requestClose();
            return;
          }

          const wantsExpand =
            canExpandRef.current &&
            (gestureState.dy < expandDragThresholdRef.current ||
              gestureState.vy < expandVelocityThresholdRef.current);
          if (wantsExpand) {
            const nextSnap = getNextExpandedSnap(activeSnapRef.current);
            if (nextSnap !== activeSnapRef.current) {
              setActiveSnap(nextSnap);
              dragY.setValue(0);
              scrimOpacity.setValue(1);
              return;
            }
          }

          const wantsCollapse =
            canCollapseRef.current &&
            gestureState.dy > COLLAPSE_DRAG &&
            gestureState.vy > 0.3;
          if (wantsCollapse) {
            const prevSnap = getPreviousSnap(activeSnapRef.current);
            if (prevSnap !== activeSnapRef.current) {
              setActiveSnap(prevSnap);
              dragY.setValue(0);
              scrimOpacity.setValue(1);
              return;
            }
          }

          if (targetHeightRef.current != null) {
            animateHeightTo(targetHeightRef.current, 200);
          }

          Animated.parallel([
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
              speed: 20,
            }),
            Animated.timing(scrimOpacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: false,
            }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          if (targetHeightRef.current != null) {
            animateHeightTo(targetHeightRef.current, 200);
          }
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          scrimOpacity.setValue(1);
        },
      }),
    [dragY, scrimOpacity, requestClose, heightAnim, insets.top, getNextExpandedSnap, getPreviousSnap, animateHeightTo],
  );

  return (
    <Modal
      visible={rendered}
      animationType="none"
      transparent
      onRequestClose={requestClose}
      accessibilityViewIsModal
    >
      <View style={[styles.container, insets.bottom > 0 && { marginBottom: -insets.bottom }]}>
        <ModalScrim onPress={requestClose} animatedOpacity={scrimOpacity} />

        <Animated.View
          style={[
            styles.outerWrapper,
            styles.sheetShell,
            { transform: [{ translateY: translatedY }] },
          ]}
        >
          <Animated.View
            style={[
              styles.sheet,
              isFullscreen && [styles.sheetFullscreen, { paddingTop: insets.top + spacing.sm }],
              { paddingBottom: shellPaddingBottom },
              targetHeight
                ? { height: heightAnim, minHeight: targetHeight }
                : [styles.sheetContent, { maxHeight: '90%' }, minHeight ? { minHeight } : null],
            ]}
          >
            <View {...panResponder.panHandlers}>
              <View
                style={styles.handleWrap}
                accessibilityRole="adjustable"
                accessibilityLabel="Drag to resize sheet"
              >
                <View style={styles.handle} />
              </View>

              {hideHeader ? null : closePosition === 'right' ? (
                <View style={styles.headerRightClose}>
                  <Text style={styles.titleLeading} numberOfLines={1}>
                    {title}
                  </Text>
                  <PressableWithFade
                    onPress={requestClose}
                    style={closeVariant === 'minimal' ? styles.closeBtnMinimal : styles.closeBtn}
                    hitSlop={touch.hitSlop}
                    testID={testID ? `${testID}-close` : undefined}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text
                      style={closeVariant === 'minimal' ? styles.closeTextMinimal : styles.closeText}
                    >
                      ✕
                    </Text>
                  </PressableWithFade>
                </View>
              ) : (
                <View style={styles.header}>
                  <PressableWithFade
                    onPress={requestClose}
                    style={closeVariant === 'minimal' ? styles.closeBtnMinimal : styles.closeBtn}
                    hitSlop={touch.hitSlop}
                    testID={testID ? `${testID}-close` : undefined}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text
                      style={closeVariant === 'minimal' ? styles.closeTextMinimal : styles.closeText}
                    >
                      ✕
                    </Text>
                  </PressableWithFade>
                  {title
                    ? <Text style={styles.title}>{title}</Text>
                    : <View style={styles.titleSpacer} />}
                  {showHeaderPrimary ? (
                    <PressableWithFade
                      onPress={onPrimary}
                      disabled={primaryDisabled || primaryLoading}
                      style={[
                        styles.saveBtn,
                        (primaryDisabled || primaryLoading) && styles.saveDisabled,
                      ]}
                      testID={testID ? `${testID}-save` : undefined}
                      accessibilityRole="button"
                      accessibilityLabel={primaryLabel || 'Save'}
                    >
                      <Text
                        style={[
                          styles.saveText,
                          (primaryDisabled || primaryLoading) && styles.saveTextDisabled,
                        ]}
                      >
                        {primaryLoading ? '…' : primaryLabel || 'Save'}
                      </Text>
                    </PressableWithFade>
                  ) : (
                    <View style={styles.headerSpacer} />
                  )}
                </View>
              )}
            </View>

            <SheetFocusProvider onInputFocus={handleInputFocus}>
              <View style={[styles.body, targetHeight == null ? styles.bodyContent : styles.bodyFlex]}>
                {children}
              </View>
            </SheetFocusProvider>

            {showFooterPrimary ? (
              <View
                style={[
                  styles.footer,
                  footerContent || onSecondary ? styles.footerSplit : styles.footerEnd,
                ]}
              >
                {footerContent || onSecondary ? (
                  <View style={styles.footerLeading}>
                    {onSecondary && secondaryLabel ? (
                      <PressableWithFade
                        onPress={onSecondary}
                        style={styles.footerSecondary}
                        testID={testID ? `${testID}-secondary` : undefined}
                      >
                        <Text style={styles.footerSecondaryText}>{secondaryLabel}</Text>
                      </PressableWithFade>
                    ) : (
                      footerContent
                    )}
                  </View>
                ) : null}
                <PressableWithFade
                  onPress={onPrimary}
                  disabled={primaryDisabled || primaryLoading}
                  style={[
                    styles.footerPrimary,
                    (primaryDisabled || primaryLoading) && styles.footerPrimaryDisabled,
                  ]}
                  testID={testID ? `${testID}-footer-save` : undefined}
                >
                  <Text
                    style={[
                      styles.footerPrimaryText,
                      (primaryDisabled || primaryLoading) && styles.footerPrimaryTextDisabled,
                    ]}
                  >
                    {primaryLoading ? '…' : primaryLabel || 'Save'}
                  </Text>
                </PressableWithFade>
              </View>
            ) : footerContent ? (
              <View style={styles.footer}>{footerContent}</View>
            ) : null}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function useSheetInsets() {
  return useSafeAreaInsets();
}

function BottomSheetScroll({ children, contentContainerStyle, style, ...props }) {
  const insets = useSheetInsets();
  const ctx = useSheetFocus();
  return (
    <ScrollView
      ref={ctx?.scrollRef}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
      {...props}
      style={[styles.scroll, style]}
      contentContainerStyle={[
        { paddingBottom: sheetScrollEndPadding(insets) },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

BottomSheet.Scroll = BottomSheetScroll;
BottomSheet.Input = SheetInput;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Sits at the bottom; translateY lifts it off-screen or to keyboard-aware position
  outerWrapper: {
    width: '100%',
  },
  sheetShell: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  sheet: {
    paddingTop: spacing.sm,
    flexDirection: 'column',
  },
  sheetContent: {
    flexShrink: 0,
  },
  sheetFullscreen: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleWrap: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  headerRightClose: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  titleLeading: {
    flex: 1,
    ...typography.sectionTitle,
    fontSize: 20,
    lineHeight: 26,
  },
  closeBtn: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnMinimal: {
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  closeText: { fontSize: 18, color: colors.textMuted, fontWeight: '600' },
  closeTextMinimal: { fontSize: 16, color: colors.textSubtle, fontWeight: '500' },
  titleSpacer: { flex: 1 },
  title: {
    flex: 1,
    textAlign: 'center',
    ...typography.sectionTitle,
    fontSize: 20,
    lineHeight: 26,
  },
  headerSpacer: { width: touch.minSize },
  saveBtn: {
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { fontSize: 17, fontWeight: '700', color: colors.primary },
  saveTextDisabled: { color: colors.textMuted },
  body: {
    paddingHorizontal: spacing.lg,
  },
  bodyFlex: {
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
  },
  bodyContent: {
    flexShrink: 0,
  },
  scroll: { flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    zIndex: 2,
  },
  footerSplit: {
    justifyContent: 'space-between',
  },
  footerEnd: {
    justifyContent: 'flex-end',
  },
  footerLeading: {
    flexShrink: 1,
    minWidth: 0,
  },
  footerSecondary: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surfaceMuted,
  },
  footerSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  footerPrimary: {
    minHeight: touch.sheetButtonHeight,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexShrink: 0,
  },
  footerPrimaryDisabled: { opacity: 0.45 },
  footerPrimaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    paddingHorizontal: spacing.xs,
  },
  footerPrimaryTextDisabled: { color: colors.white },
});
