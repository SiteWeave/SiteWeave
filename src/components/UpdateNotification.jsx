import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

const REMIND_LATER_KEY = 'siteweave.update.remindLaterUntil';
const PENDING_VERSION_KEY = 'siteweave.update.pendingVersion';

function UpdateNotification() {
  const { t } = useTranslation();
  const [isElectron, setIsElectron] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  const [newVersion, setNewVersion] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [installerUrl, setInstallerUrl] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | available | downloading | ready | install-failed
  const [modalDismissed, setModalDismissed] = useState(false);
  const listenersReadySent = useRef(false);
  const userInitiatedCheck = useRef(false);

  const isRemindLaterActive = () => {
    try {
      const until = Number(localStorage.getItem(REMIND_LATER_KEY) || 0);
      return until > Date.now();
    } catch {
      return false;
    }
  };

  const openStrongPrompt = (version) => {
    if (version) {
      try {
        localStorage.setItem(PENDING_VERSION_KEY, version);
      } catch {
        /* ignore */
      }
    }
    if (!isRemindLaterActive()) {
      setModalDismissed(false);
    }
  };

  useEffect(() => {
    const hasElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
    setIsElectron(hasElectron);
    if (!hasElectron || !window.electronAPI) return;

    window.electronAPI.getAppVersion?.().then((v) => {
      if (v) setCurrentVersion(String(v));
    }).catch(() => {});

    try {
      const pending = localStorage.getItem(PENDING_VERSION_KEY);
      if (pending && !isRemindLaterActive()) {
        setNewVersion(pending);
        setPhase((prev) => (prev === 'idle' ? 'available' : prev));
      }
    } catch {
      /* ignore */
    }

    window.electronAPI.onUpdateAvailable((payload) => {
      const nextVersion = typeof payload === 'string' ? payload : payload?.version;
      const installed = typeof payload === 'object' ? payload?.currentVersion : '';
      if (installed) setCurrentVersion(installed);
      if (nextVersion) setNewVersion(nextVersion);
      if (payload?.installerUrl) setInstallerUrl(payload.installerUrl);
      setPhase((prev) => (prev === 'ready' || prev === 'downloading' ? prev : 'available'));
      setCheckMessage(null);
      setUpdateError(null);
      openStrongPrompt(nextVersion);
    });

    window.electronAPI.onUpdateDownloaded((payload) => {
      const nextVersion = typeof payload === 'string' ? payload : payload?.version;
      if (nextVersion) setNewVersion(nextVersion);
      if (payload?.installerUrl) setInstallerUrl(payload.installerUrl);
      setPhase('ready');
      setDownloadPercent(null);
      setCheckMessage(null);
      setUpdateError(null);
      openStrongPrompt(nextVersion);
    });

    window.electronAPI.onUpdateNotAvailable?.((payload) => {
      if (payload?.currentVersion) setCurrentVersion(payload.currentVersion);
      if (payload?.latestVersion && userInitiatedCheck.current) {
        setCheckMessage(
          t('updates.latest_version_detail', {
            current: payload.currentVersion || '?',
            latest: payload.latestVersion,
          })
        );
      }
      setUpdateError(null);
    });

    window.electronAPI.onUpdateOffline?.((payload) => {
      if (userInitiatedCheck.current) {
        setCheckMessage(t('updates.offline'));
      }
      setUpdateError(null);
      if (payload?.currentVersion) setCurrentVersion(payload.currentVersion);
    });

    window.electronAPI.onUpdateCheckResult?.((payload) => {
      if (!payload) return;
      if (payload.currentVersion) setCurrentVersion(payload.currentVersion);
      if (payload.latestVersion) setNewVersion(payload.latestVersion);
      if (payload.installerUrl) setInstallerUrl(payload.installerUrl);

      if (payload.state === 'update-available' && payload.updateAvailable) {
        setPhase((prev) => (prev === 'ready' ? prev : 'available'));
        openStrongPrompt(payload.latestVersion);
        return;
      }
      if (payload.state === 'up-to-date' && userInitiatedCheck.current) {
        setCheckMessage(
          t('updates.latest_version_detail', {
            current: payload.currentVersion || '?',
            latest: payload.latestVersion || payload.currentVersion || '?',
          })
        );
        return;
      }
      if (payload.state === 'offline' && userInitiatedCheck.current) {
        setCheckMessage(t('updates.offline'));
        return;
      }
      if (
        (payload.state === 'error' || payload.state === 'updater-unavailable') &&
        userInitiatedCheck.current
      ) {
        const err = payload.error || t('updates.check_failed');
        setCheckMessage(err.length > 100 ? `${err.slice(0, 97)}...` : err);
        setUpdateError(err);
        if (payload.installerUrl) setInstallerUrl(payload.installerUrl);
      }
    });

    window.electronAPI.onUpdateInstallFailed?.((payload) => {
      if (payload?.expectedVersion) setNewVersion(payload.expectedVersion);
      if (payload?.currentVersion) setCurrentVersion(payload.currentVersion);
      if (payload?.installerUrl) setInstallerUrl(payload.installerUrl);
      setPhase('install-failed');
      setUpdateError(payload?.error || t('updates.install_failed_desc'));
      setModalDismissed(false);
    });

    window.electronAPI.onUpdateError?.((err) => {
      const message = typeof err === 'string' ? err : err?.message || t('updates.check_failed');
      const state = typeof err === 'object' ? err?.state : null;
      if (typeof err === 'object' && err?.installerUrl) setInstallerUrl(err.installerUrl);
      if (state === 'offline') {
        if (userInitiatedCheck.current) setCheckMessage(t('updates.offline'));
        return;
      }
      setUpdateError(message);
      setDownloadPercent(null);
    });

    window.electronAPI.onUpdateDownloadProgress?.((p) => {
      if (p && p.percent != null) {
        setPhase('downloading');
        setDownloadPercent(Math.round(p.percent));
        setUpdateError(null);
      }
    });

    if (!listenersReadySent.current) {
      listenersReadySent.current = true;
      window.electronAPI.notifyUpdateListenersReady?.();
    }
  }, [t]);

  const handleInstallUpdate = async () => {
    if (!window.electronAPI?.installUpdate) return;
    try {
      const result = await window.electronAPI.installUpdate();
      if (result && result.success === false) {
        setUpdateError(result.error || t('updates.install_failed_desc'));
        if (result.installerUrl) setInstallerUrl(result.installerUrl);
        setPhase('install-failed');
      }
    } catch (error) {
      setUpdateError(error?.message || t('updates.install_failed_desc'));
      setPhase('install-failed');
    }
  };

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    setChecking(true);
    setCheckMessage(null);
    setUpdateError(null);
    userInitiatedCheck.current = true;
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (!result) {
        setCheckMessage(t('updates.check_failed'));
        return;
      }
      if (result.currentVersion) setCurrentVersion(result.currentVersion);
      if (result.latestVersion) setNewVersion(result.latestVersion);
      if (result.installerUrl) setInstallerUrl(result.installerUrl);

      if (result.state === 'update-available' && result.updateAvailable) {
        setPhase((prev) => (prev === 'ready' ? prev : 'available'));
        openStrongPrompt(result.latestVersion);
        setCheckMessage(null);
      } else if (result.state === 'up-to-date') {
        setCheckMessage(
          t('updates.latest_version_detail', {
            current: result.currentVersion || '?',
            latest: result.latestVersion || result.currentVersion || '?',
          })
        );
      } else if (result.state === 'offline') {
        setCheckMessage(t('updates.offline'));
      } else if (result.state === 'development-disabled') {
        setCheckMessage(t('updates.dev_disabled'));
      } else {
        const err = result.error || t('updates.check_failed');
        setCheckMessage(err.length > 100 ? `${err.slice(0, 97)}...` : err);
        setUpdateError(err);
      }
    } catch (error) {
      setCheckMessage(error?.message || t('updates.check_failed'));
    } finally {
      setChecking(false);
      setTimeout(() => {
        setCheckMessage(null);
        userInitiatedCheck.current = false;
      }, 8000);
    }
  };

  const handleRetryDownload = async () => {
    setChecking(true);
    setUpdateError(null);
    try {
      if (window.electronAPI?.downloadUpdate) {
        const result = await window.electronAPI.downloadUpdate();
        if (result && result.success === false) {
          setUpdateError(result.error || t('updates.check_failed'));
          if (result.installerUrl) setInstallerUrl(result.installerUrl);
          if (result.state === 'offline') setCheckMessage(t('updates.offline'));
        } else {
          setPhase('downloading');
        }
      } else {
        await handleCheckForUpdates();
      }
    } catch (error) {
      setUpdateError(error?.message || t('updates.check_failed'));
    } finally {
      setChecking(false);
    }
  };

  const handleOpenInstaller = async () => {
    if (window.electronAPI?.openUpdateInstaller) {
      await window.electronAPI.openUpdateInstaller(newVersion || undefined);
      return;
    }
    if (installerUrl && window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(installerUrl);
    }
  };

  const handleRemindLater = () => {
    try {
      localStorage.setItem(REMIND_LATER_KEY, String(Date.now() + 4 * 60 * 60 * 1000));
    } catch {
      /* ignore */
    }
    setModalDismissed(true);
  };

  const handleDismissBanner = () => {
    setModalDismissed(true);
  };

  if (!isElectron) return null;

  const showStrongModal =
    !modalDismissed &&
    !isRemindLaterActive() &&
    (phase === 'ready' || phase === 'install-failed' || (phase === 'available' && updateError));

  const showPersistentBadge =
    phase === 'available' ||
    phase === 'downloading' ||
    phase === 'ready' ||
    phase === 'install-failed';

  return (
    <>
      {showStrongModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                <Icon
                  path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  className="h-6 w-6 text-amber-700"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900">
                  {phase === 'install-failed'
                    ? t('updates.install_failed_title')
                    : phase === 'ready'
                      ? t('updates.update_ready_title')
                      : t('updates.update_available_title')}
                  {newVersion ? ` (v${newVersion})` : ''}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {phase === 'install-failed'
                    ? t('updates.install_failed_desc')
                    : phase === 'ready'
                      ? t('updates.update_ready_desc')
                      : t('updates.update_available_desc')}
                </p>
                {(currentVersion || newVersion) && (
                  <p className="mt-2 text-xs text-gray-500">
                    {t('updates.version_compare', {
                      current: currentVersion || '?',
                      latest: newVersion || '?',
                    })}
                  </p>
                )}
                {updateError && (
                  <p className="mt-2 text-sm text-red-600">
                    {updateError.length > 160 ? `${updateError.slice(0, 157)}...` : updateError}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {phase === 'ready' && (
                <button
                  type="button"
                  onClick={handleInstallUpdate}
                  className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  {t('updates.restart_install')}
                </button>
              )}
              {(phase === 'install-failed' || updateError) && (
                <button
                  type="button"
                  onClick={handleRetryDownload}
                  disabled={checking}
                  className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {checking ? t('updates.retrying') : t('updates.try_again')}
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenInstaller}
                className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
              >
                {t('updates.download_installer')}
              </button>
              <button
                type="button"
                onClick={handleRemindLater}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                {t('updates.remind_later')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPersistentBadge && !showStrongModal && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-lg">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-950">
                  {phase === 'ready'
                    ? t('updates.update_ready_title')
                    : phase === 'downloading'
                      ? t('updates.downloading', { percent: downloadPercent ?? 0 })
                      : phase === 'install-failed'
                        ? t('updates.install_failed_title')
                        : t('updates.update_available_title')}
                  {newVersion ? ` (v${newVersion})` : ''}
                </p>
                {phase === 'downloading' && downloadPercent != null && (
                  <div className="mt-2 h-2 w-full rounded-full bg-amber-200">
                    <div
                      className="h-2 rounded-full bg-amber-600 transition-all"
                      style={{ width: `${downloadPercent}%` }}
                    />
                  </div>
                )}
                {phase === 'available' && downloadPercent == null && !updateError && (
                  <p className="mt-1 text-xs text-amber-800">{t('updates.preparing_download')}</p>
                )}
                {updateError && (
                  <p className="mt-1 text-xs text-red-600">
                    {updateError.length > 90 ? `${updateError.slice(0, 87)}...` : updateError}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {phase === 'ready' && (
                    <button
                      type="button"
                      onClick={() => setModalDismissed(false)}
                      className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      {t('updates.restart_install')}
                    </button>
                  )}
                  {(phase === 'install-failed' || updateError) && (
                    <button
                      type="button"
                      onClick={handleRetryDownload}
                      disabled={checking}
                      className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                    >
                      {checking ? t('updates.retrying') : t('updates.try_again')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalDismissed(false)}
                    className="rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900"
                  >
                    {t('updates.view_update')}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismissBanner}
                className="flex-shrink-0 text-amber-500 hover:text-amber-700"
                aria-label={t('updates.later')}
              >
                <Icon path="M6 18L18 6M6 6l12 12" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!showPersistentBadge && (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-1">
          {checkMessage && (
            <div className="max-w-xs rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
              {checkMessage}
            </div>
          )}
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={checking}
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60"
          >
            {checking ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                {t('updates.checking')}
              </>
            ) : (
              <>
                <Icon
                  path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  className="h-4 w-4 text-gray-500"
                />
                {t('updates.check_for_updates')}
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}

export default UpdateNotification;
