import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const SheetFocusContext = createContext(null);

export function SheetFocusProvider({
  children,
  onInputFocus,
  contentSized = false,
  footerHeight = 0,
  keyboardOpen = false,
}) {
  const scrollRef = useRef(null);
  const [focusedKey, setFocusedKey] = useState(null);

  const registerFocus = useCallback(
    (key) => {
      setFocusedKey(key);
      onInputFocus?.();
      // After expand-on-focus / layout settles, re-ask KASV to reveal the caret.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scroll = scrollRef.current;
          if (scroll && typeof scroll.scrollToFocusedInput === 'function') {
            try {
              scroll.scrollToFocusedInput();
            } catch {
              // optional API; ignore if unavailable
            }
          }
        });
      });
    },
    [onInputFocus],
  );

  const value = useMemo(
    () => ({
      scrollRef,
      registerFocus,
      focusedKey,
      contentSized,
      footerHeight,
      keyboardOpen,
    }),
    [registerFocus, focusedKey, contentSized, footerHeight, keyboardOpen],
  );

  return <SheetFocusContext.Provider value={value}>{children}</SheetFocusContext.Provider>;
}

export function useSheetFocus() {
  return useContext(SheetFocusContext);
}
