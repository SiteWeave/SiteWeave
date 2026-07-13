import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

let VoiceModule = null;

function isVoiceNativeModuleAvailable() {
  if (Platform.OS !== 'ios') return false;
  // @react-native-voice/voice creates NativeEventEmitter at import time and crashes in Expo Go.
  if (Constants.appOwnership === 'expo') return false;
  return Boolean(NativeModules.Voice);
}

function loadVoiceModule() {
  if (VoiceModule !== null) return VoiceModule || null;
  if (!isVoiceNativeModuleAvailable()) {
    VoiceModule = false;
    return null;
  }
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    VoiceModule = require('@react-native-voice/voice').default;
    return VoiceModule;
  } catch {
    VoiceModule = false;
    return null;
  }
}

/**
 * iOS-only speech-to-text via Apple Speech framework (@react-native-voice/voice).
 * Requires a dev/production build — unavailable in Expo Go and on Android.
 */
export function useVoiceDictation({ onResult, onError, locale } = {}) {
  const [listening, setListening] = useState(false);
  const [available, setAvailable] = useState(false);
  const baseTextRef = useRef('');

  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    let Voice;
    try {
      Voice = loadVoiceModule();
    } catch {
      setAvailable(false);
      return undefined;
    }

    if (!Voice) {
      setAvailable(false);
      return undefined;
    }

    Voice.isAvailable().then((ok) => setAvailable(Boolean(ok))).catch(() => setAvailable(false));

    Voice.onSpeechStart = () => setListening(true);
    Voice.onSpeechEnd = () => setListening(false);
    Voice.onSpeechResults = (event) => {
      const spoken = event?.value?.[0];
      if (!spoken) return;
      const merged = baseTextRef.current
        ? `${baseTextRef.current.trimEnd()} ${spoken}`.trim()
        : spoken;
      onResultRef.current?.(merged);
      setListening(false);
    };
    Voice.onSpeechError = (event) => {
      setListening(false);
      onErrorRef.current?.(event?.error?.message || 'Speech recognition failed');
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => {});
    };
  }, []);

  const start = useCallback(
    async (currentText = '') => {
      let Voice;
      try {
        Voice = loadVoiceModule();
      } catch {
        onErrorRef.current?.('Speech recognition is not available on this device.');
        return;
      }

      if (!Voice) {
        onErrorRef.current?.('Speech recognition is not available on this device.');
        return;
      }

      try {
        baseTextRef.current = String(currentText || '');
        await Voice.stop().catch(() => {});
        const lang = locale || 'en-US';
        await Voice.start(lang);
      } catch (err) {
        setListening(false);
        onErrorRef.current?.(err?.message || 'Could not start dictation');
      }
    },
    [locale],
  );

  const stop = useCallback(async () => {
    try {
      const Voice = loadVoiceModule();
      await Voice?.stop();
    } catch {
      /* ignore */
    } finally {
      setListening(false);
    }
  }, []);

  const toggle = useCallback(
    async (currentText = '') => {
      if (listening) {
        await stop();
      } else {
        await start(currentText);
      }
    },
    [listening, start, stop],
  );

  return { listening, available, start, stop, toggle };
}
