import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  Dimensions,
  AccessibilityInfo,
  Keyboard,
  PanResponder,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
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
const FOOTER_SCROLL_FALLBACK = touch.sheetButtonHeight + spacing.xl + spacing.md;

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
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const hideTabBarRef = useRef(hideTabBar);
  hideTabBarRef.current = hideTabBar;
  const dismissWithoutAnimationRef = useRef(dismissWithoutAnimation);
  dismissWithoutAnimationRef.current = dismissWithoutAnimation;
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
  const wasVisibleRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeSnap, setActiveSnap] = useState(snap);
  const [rendered, setRendered] = useState(visible);
  const [closing, setClosing] = useState(false);
  const [footerHeight, setFooterHeight] = useState(FOOTER_SCROLL_FALLBACK);
  const [contentHeight, setContentHeight] = useState(0);
  const renderedRef = useRef(visible);
  const closeTimerRef = useRef(null);
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
  const dragY = useRef(new Animated.Value(0)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(
    new Animated.Value(resolveBaseHeight(snap) || SCREEN_HEIGHT * 0.52),
  ).current;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    Keyboard.dismiss();
    onCloseRef.current?.();
  }, []);

  // ── reduce-motion ──────────────────────────────────────────────────────────
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // ── reset snap when opening / closing ──────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setActiveSnap(snap);
      return;
    }
    setActiveSnap(snap);
  }, [visible, snap]);

  // ── slide-in / slide-out + scrim ─────────────────────────────────────────
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;

    if (visible && !wasVisible) {
      wasVisibleRef.current = true;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      renderedRef.current = true;
      setClosing(false);
      setRendered(true);
      setContentHeight(0);
      setFooterHeight(FOOTER_SCROLL_FALLBACK);
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

      Keyboard.dismiss();
      // Stop eating touches immediately — do not wait for the exit animation.
      setClosing(true);

      const finishClose = () => {
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        if (!renderedRef.current) return;
        renderedRef.current = false;
        dragY.setValue(0);
        setClosing(false);
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

      // Mixed native/JS drivers in parallel can drop the completion callback on some
      // devices — always force-unmount on a timer so an invisible Modal cannot freeze the page.
      closeTimerRef.current = setTimeout(finishClose, 280);
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }).start();
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
    }

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [visible, reduceMotion, slideAnim, scrimOpacity, dragY, heightAnim, snap, maxSnap, sheetOverlay]);

  // ── height animation  (useNativeDriver: false) ────────────────────────────
  const targetHeight = useMemo(() => {
    return resolveBaseHeight(clampSnap(activeSnap, maxSnap));
  }, [activeSnap, maxSnap]);

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
    if (base) {
      setActiveSnap(snap);
      heightAnim.setValue(base);
    }
  }, [snap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── expand on input focus ──────────────────────────────────────────────────
  // `content` is outside SNAP_ORDER — allow it to grow into expandOnFocusSnap
  const handleInputFocus = useCallback(() => {
    if (!expandOnFocus) return;
    const target = clampSnap(expandOnFocusSnapRef.current, maxSnapRef.current);
    if (activeSnap !== 'content' && snapIndex(activeSnap) >= snapIndex(target)) return;
    // Seed height from measured content so content→fixed snap doesn't jump.
    if (activeSnap === 'content' && contentHeight > 0) {
      heightAnim.setValue(contentHeight);
    }
    setActiveSnap(target);
  }, [expandOnFocus, activeSnap, contentHeight, heightAnim]);

  const isContentSized = targetHeight == null;
  const stickyOffset = useMemo(
    () => ({
      closed: 0,
      // Sheet shell uses negative bottom inset; lift an extra inset when keyboard opens
      // so the sticky footer sits flush on the keyboard instead of overlapping it.
      opened: insets.bottom > 0 ? insets.bottom : 0,
    }),
    [insets.bottom],
  );
  const onFooterLayout = useCallback((event) => {
    const next = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    if (next > 0) setFooterHeight(next);
  }, []);
  const onBodyLayout = useCallback((event) => {
    if (!isContentSized) return;
    const next = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    if (next > 0) setContentHeight(next);
  }, [isContentSized]);

  // ── derived props ──────────────────────────────────────────────────────────
  const showHeaderPrimary =
    onPrimary && (primaryPlacement === 'header' || primaryPlacement === 'both');
  const showFooterPrimary =
    onPrimary && (stickyPrimary || primaryPlacement === 'footer');
  const isFullscreen = clampSnap(activeSnap, maxSnap) === 'fullscreen';

  const combinedTranslateY = Animated.add(slideAnim, dragY);
  const translatedY = yOffset ? Animated.add(combinedTranslateY, yOffset) : combinedTranslateY;
  const shellPaddingBottom = insets.bottom + spacing.lg;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          Keyboard.dismiss();
        },
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

  const footerNode = showFooterPrimary ? (
    <View
      style={[
        styles.footer,
        footerContent || onSecondary ? styles.footerSplit : styles.footerEnd,
        // Container uses negative bottom inset so the sheet can sit edge-to-edge;
        // footer must reclaim that safe area or the CTA sits on the home indicator.
        { paddingBottom: Math.max(spacing.md, insets.bottom) + spacing.sm },
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
        containerStyle={!(footerContent || onSecondary) ? styles.footerPrimarySolo : undefined}
        style={[
          styles.footerPrimary,
          !(footerContent || onSecondary) && styles.footerPrimaryFill,
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
    <View style={[styles.footer, { paddingBottom: Math.max(spacing.md, insets.bottom) + spacing.sm }]}>
      {footerContent}
    </View>
  ) : null;

  return (
    <Modal
      visible={rendered}
      animationType="none"
      transparent
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={requestClose}
      accessibilityViewIsModal
    >
      <View
        style={[styles.container, insets.bottom > 0 && { marginBottom: -insets.bottom }]}
      >
        <ModalScrim
          onPress={requestClose}
          animatedOpacity={scrimOpacity}
          pointerEvents={rendered && !closing ? 'auto' : 'none'}
        />

        <Animated.View
          pointerEvents={closing ? 'none' : 'box-none'}
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
              { paddingBottom: showFooterPrimary || footerContent ? spacing.sm : shellPaddingBottom },
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

            <SheetFocusProvider
              onInputFocus={handleInputFocus}
              contentSized={isContentSized}
              footerHeight={showFooterPrimary || footerContent ? footerHeight : 0}
              keyboardOpen={keyboardVisible}
            >
              <View
                style={[styles.body, isContentSized ? styles.bodyContent : styles.bodyFlex]}
                onLayout={onBodyLayout}
              >
                {children}
              </View>
            </SheetFocusProvider>

            {footerNode ? (
              <KeyboardStickyView offset={stickyOffset} enabled={rendered}>
                <View onLayout={onFooterLayout}>{footerNode}</View>
              </KeyboardStickyView>
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

function BottomSheetScroll({ children, contentContainerStyle, style, bottomOffset, ...props }) {
  const insets = useSheetInsets();
  const ctx = useSheetFocus();
  const contentSized = Boolean(ctx?.contentSized);
  const footerReserve = ctx?.footerHeight > 0 ? ctx.footerHeight : 0;
  const keyboardOpen = Boolean(ctx?.keyboardOpen);
  // When the sticky footer is present, reserve enough scroll room that focused inputs
  // (and inlined Save actions) can scroll above the keyboard.
  const resolvedBottomOffset =
    bottomOffset ??
    (footerReserve + spacing.md + (keyboardOpen ? spacing.lg : 0));
  return (
    <KeyboardAwareScrollView
      ref={ctx?.scrollRef}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      bottomOffset={resolvedBottomOffset}
      extraKeyboardSpace={Platform.OS === 'ios' ? spacing.lg : spacing.md}
      contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'never' : undefined}
      automaticallyAdjustKeyboardInsets={false}
      {...props}
      style={[contentSized ? styles.scrollContent : styles.scroll, style]}
      contentContainerStyle={[
        contentSized ? styles.scrollContentContainer : null,
        {
          paddingBottom:
            sheetScrollEndPadding(insets, contentSized ? -spacing.lg : 0) +
            (footerReserve > 0 && !contentSized ? spacing.md : spacing.sm),
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

BottomSheet.Scroll = BottomSheetScroll;
BottomSheet.Input = SheetInput;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
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
  // content snap: flex:1 collapses when the sheet has no fixed height
  scrollContent: {
    flexGrow: 0,
    flexShrink: 0,
  },
  scrollContentContainer: {
    flexGrow: 0,
  },
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
    justifyContent: 'stretch',
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
  footerPrimarySolo: {
    flex: 1,
  },
  footerPrimaryFill: {
    width: '100%',
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
