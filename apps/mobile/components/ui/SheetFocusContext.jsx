import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const SheetFocusContext = createContext(null);

export function SheetFocusProvider({ children, onInputFocus }) {
  const scrollRef = useRef(null);
  const [focusedKey, setFocusedKey] = useState(null);

  const registerFocus = useCallback(
    (key, nativeRef) => {
      setFocusedKey(key);
      onInputFocus?.();
      if (scrollRef.current && nativeRef?.measureLayout) {
        requestAnimationFrame(() => {
          try {
            nativeRef.measureLayout(
              scrollRef.current,
              (_x, y) => {
                scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
              },
              () => {},
            );
          } catch {
            // measureLayout may fail on some platforms
          }
        });
      }
    },
    [onInputFocus],
  );

  const value = useMemo(
    () => ({ scrollRef, registerFocus, focusedKey }),
    [registerFocus, focusedKey],
  );

  return <SheetFocusContext.Provider value={value}>{children}</SheetFocusContext.Provider>;
}

export function useSheetFocus() {
  return useContext(SheetFocusContext);
}
