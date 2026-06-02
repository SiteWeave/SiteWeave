import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

function UpdateNotification() {
  const { t } = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  const [newVersion, setNewVersion] = useState('');
  const listenersReadySent = useRef(false);

  useEffect(() => {
    const hasElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
    setIsElectron(hasElectron);
    if (!hasElectron || !window.electronAPI) return;

    window.electronAPI.onUpdateAvailable(() => {
      setUpdateAvailable(true);
      setCheckMessage(null);
      setUpdateError(null);
    });

    window.electronAPI.onUpdateDownloaded(() => {
      setUpdateDownloaded(true);
      setUpdateAvailable(false);
      setDownloadPercent(null);
      setCheckMessage(null);
      setUpdateError(null);
    });

    window.electronAPI.onUpdateError?.((err) => {
      setUpdateError(err);
      setDownloadPercent(null);
    });

    window.electronAPI.onUpdateDownloadProgress?.((p) => {
      if (p && p.percent != null) {
        setDownloadPercent(Math.round(p.percent));
        setUpdateError(null);
      }
    });

    if (!listenersReadySent.current) {
      listenersReadySent.current = true;
      window.electronAPI.notifyUpdateListenersReady?.();
    }
  }, []);

  const handleInstallUpdate = async () => {
    if (window.electronAPI?.installUpdate) {
      await window.electronAPI.installUpdate();
    }
  };

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    setChecking(true);
    setCheckMessage(null);
    setUpdateError(null);
    setDownloadPercent(null);
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result?.success) {
        if (result.updateInfo) {
          setUpdateAvailable(true);
          setNewVersion(result.updateInfo.version || '');
        } else {
          setCheckMessage(t('updates.latest_version'));
        }
      } else {
        const err = result?.error || t('updates.check_failed');
        setCheckMessage(err.length > 80 ? err.slice(0, 77) + '...' : err);
      }
    } finally {
      setChecking(false);
      setTimeout(() => setCheckMessage(null), 6000);
    }
  };

  const handleDismiss = () => {
    setUpdateAvailable(false);
    setUpdateDownloaded(false);
    setDownloadPercent(null);
    setUpdateError(null);
  };

  if (!isElectron) return null;

  // Update downloaded - ready to install
  if (updateDownloaded) {
    return (
      <div className="fixed bottom-4 right-4 max-w-md bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 z-50 animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <Icon
              path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              className="w-6 h-6 text-green-600"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-green-900 mb-1">
              {t('updates.update_ready_title')}{newVersion ? ` (v${newVersion})` : ''}
            </h3>
            <p className="text-sm text-green-700 mb-3">
              {t('updates.update_ready_desc')}
            </p>
            <div className="flex gap-2">
              <button type="button"
                onClick={handleInstallUpdate}
                className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
              >
                {t('updates.restart_install')}
              </button>
              <button type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 bg-white text-green-700 text-sm font-medium rounded border border-green-300 hover:bg-green-50 transition-colors"
              >
                {t('updates.later')}
              </button>
            </div>
          </div>
          <button type="button" onClick={handleDismiss} className="flex-shrink-0 text-green-400 hover:text-green-600 transition-colors">
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Update available - downloading
  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 max-w-md bg-blue-50 border border-blue-200 rounded-lg shadow-lg p-4 z-50 animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Icon
              path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              className="w-6 h-6 text-blue-600"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              {t('updates.update_available_title')}{newVersion ? ` (v${newVersion})` : ''}
            </h3>
            {updateError ? (
              <div>
                <p className="text-sm text-red-600 mb-2">{t('updates.download_failed', { error: updateError.length > 60 ? updateError.slice(0, 57) + '...' : updateError })}</p>
                <button type="button"
                  onClick={handleCheckForUpdates}
                  disabled={checking}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {checking ? t('updates.retrying') : t('updates.try_again')}
                </button>
              </div>
            ) : downloadPercent != null ? (
              <div>
                <p className="text-sm text-blue-700 mb-1">{t('updates.downloading', { percent: downloadPercent })}</p>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${downloadPercent}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-blue-700">{t('updates.downloading_background')}</p>
            )}
          </div>
          <button type="button" onClick={handleDismiss} className="flex-shrink-0 text-blue-400 hover:text-blue-600 transition-colors">
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Default: "Check for updates" button
  return (
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
            <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4 text-gray-500" />
            {t('updates.check_for_updates')}
          </>
        )}
      </button>
    </div>
  );
}

export default UpdateNotification;
