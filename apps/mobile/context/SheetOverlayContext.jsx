import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';

const ANIM_MS = 280;

const SheetOverlayContext = createContext(null);

export function SheetOverlayProvider({ children }) {
  const tabBarHideCountRef = useRef(0);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const tabBarOpacity = useRef(new Animated.Value(1)).current;
  const tabBarTranslateY = useRef(new Animated.Value(0)).current;

  const animateTabBarHide = useCallback(
    (reduceMotion = false) => {
      if (reduceMotion) {
        tabBarOpacity.setValue(0);
        tabBarTranslateY.setValue(24);
        return;
      }
      Animated.parallel([
        Animated.timing(tabBarOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(tabBarTranslateY, {
          toValue: 24,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [tabBarOpacity, tabBarTranslateY],
  );

  const animateTabBarShow = useCallback(
    (reduceMotion = false) => {
      if (reduceMotion) {
        tabBarOpacity.setValue(1);
        tabBarTranslateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(tabBarOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(tabBarTranslateY, {
          toValue: 0,
          duration: ANIM_MS,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [tabBarOpacity, tabBarTranslateY],
  );

  const sheetOpened = useCallback(
    ({ hideTabBar = false, reduceMotion = false } = {}) => {
      if (!hideTabBar) return;
      tabBarHideCountRef.current += 1;
      if (tabBarHideCountRef.current === 1) {
        setTabBarHidden(true);
        animateTabBarHide(reduceMotion);
      }
    },
    [animateTabBarHide],
  );

  const sheetClosed = useCallback(
    ({ hideTabBar = false, reduceMotion = false } = {}) => {
      if (!hideTabBar) return;
      tabBarHideCountRef.current = Math.max(0, tabBarHideCountRef.current - 1);
      if (tabBarHideCountRef.current === 0) {
        setTabBarHidden(false);
        animateTabBarShow(reduceMotion);
      }
    },
    [animateTabBarShow],
  );

  const value = useMemo(
    () => ({
      tabBarOpacity,
      tabBarTranslateY,
      tabBarHidden,
      sheetOpened,
      sheetClosed,
    }),
    [tabBarOpacity, tabBarTranslateY, tabBarHidden, sheetOpened, sheetClosed],
  );

  return <SheetOverlayContext.Provider value={value}>{children}</SheetOverlayContext.Provider>;
}

export function useSheetOverlay() {
  return useContext(SheetOverlayContext);
}
