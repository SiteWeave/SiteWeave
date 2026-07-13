import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { useAuth } from './AuthContext';
import {
  evaluateStoreUpdate,
  getNativeApplicationVersion,
  getStoreUrl,
} from '../utils/appVersion';
import { fetchMobileReleaseConfig } from '../utils/fetchMobileReleaseConfig';

const AppUpdateContext = createContext({
  updatesSupported: false,
  nativeVersion: '0.0.0',
  isOtaDownloading: false,
  isOtaPending: false,
  storeUpdateRequired: false,
  storeUpdateSoft: false,
  storeUrl: null,
  applyUpdateNow: async () => {},
  openStore: async () => {},
  dismissSoftStoreUpdate: () => {},
  otaStatusLabelKey: 'mobile.update_up_to_date',
});

function isUpdatesSupported() {
  if (__DEV__) return false;
  if (Constants.executionEnvironment === 'storeClient') return false;
  return Updates.isEnabled;
}

export function AppUpdateProvider({ children }) {
  const { supabase } = useAuth();
  const updatesSupported = isUpdatesSupported();
  const nativeVersion = getNativeApplicationVersion();

  const [releaseConfig, setReleaseConfig] = useState(null);
  const [softStoreDismissed, setSoftStoreDismissed] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const checkInFlight = useRef(false);
  const fetchInFlight = useRef(false);
  const fetchedUpdate = useRef(false);
  const isCheckingRef = useRef(false);

  const {
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
    isChecking,
  } = Updates.useUpdates();

  useEffect(() => {
    isCheckingRef.current = isChecking;
  }, [isChecking]);

  const refreshReleaseConfig = useCallback(async () => {
    const config = await fetchMobileReleaseConfig(supabase);
    if (config) {
      setReleaseConfig(config);
    }
    return config;
  }, [supabase]);

  const checkForOtaUpdate = useCallback(async () => {
    if (!updatesSupported || isCheckingRef.current || checkInFlight.current) return;
    checkInFlight.current = true;
    try {
      await Updates.checkForUpdateAsync();
    } catch (error) {
      console.warn('[AppUpdate] OTA check failed:', error?.message || error);
    } finally {
      checkInFlight.current = false;
    }
  }, [updatesSupported]);

  useEffect(() => {
    refreshReleaseConfig();
    checkForOtaUpdate();
  }, [refreshReleaseConfig, checkForOtaUpdate]);

  useEffect(() => {
    if (!updatesSupported) return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshReleaseConfig();
        checkForOtaUpdate();
      }
    });

    return () => subscription.remove();
  }, [updatesSupported, refreshReleaseConfig, checkForOtaUpdate]);

  useEffect(() => {
    if (!isUpdateAvailable && !isUpdatePending) {
      fetchedUpdate.current = false;
    }
  }, [isUpdateAvailable, isUpdatePending]);

  useEffect(() => {
    if (
      !updatesSupported ||
      !isUpdateAvailable ||
      isUpdatePending ||
      isDownloading ||
      fetchInFlight.current ||
      fetchedUpdate.current
    ) {
      return;
    }

    fetchInFlight.current = true;

    Updates.fetchUpdateAsync()
      .then(() => {
        fetchedUpdate.current = true;
      })
      .catch((error) => {
        console.warn('[AppUpdate] OTA fetch failed:', error?.message || error);
      })
      .finally(() => {
        fetchInFlight.current = false;
      });
  }, [updatesSupported, isUpdateAvailable, isUpdatePending, isDownloading]);

  const storeEvaluation = useMemo(
    () => evaluateStoreUpdate(nativeVersion, releaseConfig),
    [nativeVersion, releaseConfig],
  );

  const storeUpdateRequired = storeEvaluation.required;
  const storeUpdateSoft = storeEvaluation.soft && !softStoreDismissed;
  const storeUrl = getStoreUrl(releaseConfig);

  const openStore = useCallback(async () => {
    if (!storeUrl) return;
    try {
      await Linking.openURL(storeUrl);
    } catch (error) {
      console.warn('[AppUpdate] failed to open store URL:', error?.message || error);
    }
  }, [storeUrl]);

  const applyUpdateNow = useCallback(async () => {
    if (!updatesSupported || !isUpdatePending || isApplyingUpdate) return;
    setIsApplyingUpdate(true);
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.warn('[AppUpdate] reload failed:', error?.message || error);
      setIsApplyingUpdate(false);
    }
  }, [updatesSupported, isUpdatePending, isApplyingUpdate]);

  const dismissSoftStoreUpdate = useCallback(() => {
    setSoftStoreDismissed(true);
  }, []);

  const otaStatusLabelKey = isUpdatePending
    ? 'mobile.update_ready_next_launch'
    : isDownloading
      ? 'mobile.update_downloading'
      : 'mobile.update_up_to_date';

  const value = useMemo(
    () => ({
      updatesSupported,
      nativeVersion,
      isOtaDownloading: isDownloading,
      isOtaPending: isUpdatePending,
      isApplyingUpdate,
      storeUpdateRequired,
      storeUpdateSoft,
      storeUrl,
      applyUpdateNow,
      openStore,
      dismissSoftStoreUpdate,
      otaStatusLabelKey,
    }),
    [
      updatesSupported,
      nativeVersion,
      isDownloading,
      isUpdatePending,
      isApplyingUpdate,
      storeUpdateRequired,
      storeUpdateSoft,
      storeUrl,
      applyUpdateNow,
      openStore,
      dismissSoftStoreUpdate,
      otaStatusLabelKey,
    ],
  );

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate() {
  return useContext(AppUpdateContext);
}
