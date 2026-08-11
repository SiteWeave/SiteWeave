import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  pickAndUploadTaskPhoto,
  resolveTaskOrganizationId,
  uploadTaskPhotoFromUri,
} from '../utils/pickAndUploadTaskPhoto';
import { alertPhotoUploadFailed } from '../utils/photoUploadFeedback';
import {
  runAfterInteractionsAsync,
  useAfterSheetDismiss,
} from '../utils/runAfterSheetDismiss';

/**
 * Task photo attach flow that dismisses the RN Modal sheet before launching
 * the native camera/library picker — stacking those freezes the UI on some devices.
 *
 * Confidence UX: local URI is reported immediately; upload retries once; failures
 * offer Retry / Retake instead of a hanging spinner.
 */
export function useTaskPhotoAttach({
  supabase,
  userId,
  resolveOrganizationId,
  onSuccess,
  onError,
  onLocalReady,
}) {
  const { t } = useTranslation();
  const { scheduleAfterDismiss, handleDismissed, clearPending } = useAfterSheetDismiss();
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [photoTask, setPhotoTask] = useState(null);
  const [photoUploadTaskId, setPhotoUploadTaskId] = useState(null);
  const [photoStatusByTaskId, setPhotoStatusByTaskId] = useState({});
  const [pendingCompletionPhoto, setPendingCompletionPhoto] = useState(false);
  const [picking, setPicking] = useState(false);
  const pendingCompletionRef = useRef(false);
  const lastLocalByTaskRef = useRef({});
  const retryUploadRef = useRef(async () => {});

  const setTaskPhotoStatus = useCallback((taskId, patch) => {
    if (!taskId) return;
    setPhotoStatusByTaskId((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), ...patch },
    }));
  }, []);

  const clearTaskPhotoStatus = useCallback((taskId) => {
    if (!taskId) return;
    setPhotoStatusByTaskId((prev) => {
      if (!prev[taskId]) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const openPhotoSheet = useCallback((task, { isCompletionPhoto = false } = {}) => {
    if (!task) return;
    clearPending();
    pendingCompletionRef.current = Boolean(isCompletionPhoto);
    setPendingCompletionPhoto(Boolean(isCompletionPhoto));
    setPicking(false);
    setPhotoTask(task);
    setShowPhotoSheet(true);
  }, [clearPending]);

  const clearPhotoSheet = useCallback(() => {
    clearPending();
    pendingCompletionRef.current = false;
    setPicking(false);
    setShowPhotoSheet(false);
    setPhotoTask(null);
    setPendingCompletionPhoto(false);
  }, [clearPending]);

  const resolveOrg = useCallback(
    (task) =>
      typeof resolveOrganizationId === 'function'
        ? resolveOrganizationId(task)
        : resolveTaskOrganizationId(task),
    [resolveOrganizationId],
  );

  const finishSuccess = useCallback(
    async (task) => {
      setTaskPhotoStatus(task.id, { status: 'saved' });
      await onSuccess?.({ task, isCompletionPhoto: pendingCompletionRef.current });
      setTimeout(() => clearTaskPhotoStatus(task.id), 1800);
      pendingCompletionRef.current = false;
      setPendingCompletionPhoto(false);
      setPhotoTask(null);
    },
    [onSuccess, setTaskPhotoStatus, clearTaskPhotoStatus],
  );

  const presentFailure = useCallback(
    (task, error) => {
      setTaskPhotoStatus(task.id, {
        status: 'failed',
        localUri: lastLocalByTaskRef.current[task.id] || null,
      });
      const retry = () => {
        void retryUploadRef.current(task);
      };
      const retake = () => {
        clearTaskPhotoStatus(task.id);
        openPhotoSheet(task, { isCompletionPhoto: pendingCompletionRef.current });
      };
      if (onError) {
        onError(error, { task, retry, retake });
        return;
      }
      alertPhotoUploadFailed({
        t,
        message: error?.message,
        onRetry: retry,
        onRetake: retake,
      });
    },
    [t, onError, openPhotoSheet, setTaskPhotoStatus, clearTaskPhotoStatus],
  );

  const retryUpload = useCallback(
    async (task) => {
      const localUri = lastLocalByTaskRef.current[task?.id];
      if (!task || !localUri) {
        openPhotoSheet(task, { isCompletionPhoto: pendingCompletionRef.current });
        return;
      }
      const orgId = resolveOrg(task);
      if (!orgId) {
        presentFailure(
          task,
          new Error(
            t('mobile.task_photo_missing_org', {
              defaultValue: 'Could not resolve organization for this task.',
            }),
          ),
        );
        return;
      }
      setPhotoUploadTaskId(task.id);
      setTaskPhotoStatus(task.id, { status: 'uploading', localUri });
      try {
        await uploadTaskPhotoFromUri({
          supabase,
          task,
          organizationId: orgId,
          userId,
          localUri,
          isCompletionPhoto: pendingCompletionRef.current,
        });
        await finishSuccess(task);
      } catch (error) {
        console.error('Error retrying task photo upload:', error);
        presentFailure(task, error);
      } finally {
        setPhotoUploadTaskId(null);
      }
    },
    [
      supabase,
      userId,
      resolveOrg,
      t,
      openPhotoSheet,
      setTaskPhotoStatus,
      finishSuccess,
      presentFailure,
    ],
  );

  retryUploadRef.current = retryUpload;

  const runUpload = useCallback(
    async (mode, task) => {
      if (!task) {
        setPicking(false);
        return;
      }
      const orgId = resolveOrg(task);

      if (!orgId) {
        alertPhotoUploadFailed({
          t,
          message: t('mobile.task_photo_missing_org', {
            defaultValue: 'Could not resolve organization for this task.',
          }),
          onRetake: () => setShowPhotoSheet(true),
        });
        setPicking(false);
        setShowPhotoSheet(true);
        return;
      }

      let shouldReopen = false;
      let didUpload = false;
      let gotLocal = false;
      try {
        const uploaded = await pickAndUploadTaskPhoto({
          supabase,
          task,
          organizationId: orgId,
          userId,
          mode,
          isCompletionPhoto: pendingCompletionRef.current,
          t,
          onLocalReady: (uri) => {
            gotLocal = true;
            lastLocalByTaskRef.current[task.id] = uri;
            setPhotoUploadTaskId(task.id);
            setTaskPhotoStatus(task.id, { status: 'uploading', localUri: uri });
            onLocalReady?.({ task, localUri: uri });
          },
        });
        if (uploaded) {
          didUpload = true;
          await finishSuccess(task);
        } else {
          shouldReopen = true;
          if (!gotLocal) clearTaskPhotoStatus(task.id);
        }
      } catch (error) {
        shouldReopen = !didUpload && !gotLocal;
        console.error('Error uploading task photo:', error);
        if (gotLocal) {
          presentFailure(task, error);
        } else if (onError) {
          onError(error);
        } else {
          alertPhotoUploadFailed({
            t,
            message: error?.message,
            onRetake: () => setShowPhotoSheet(true),
          });
          shouldReopen = true;
        }
      } finally {
        setPhotoUploadTaskId(null);
        setPicking(false);
        if (shouldReopen) {
          await runAfterInteractionsAsync(() => setShowPhotoSheet(true));
        }
      }
    },
    [
      supabase,
      userId,
      resolveOrg,
      onLocalReady,
      onError,
      t,
      setTaskPhotoStatus,
      clearTaskPhotoStatus,
      finishSuccess,
      presentFailure,
    ],
  );

  const requestPick = useCallback(
    (mode) => {
      const task = photoTask;
      if (!task || photoUploadTaskId || picking) return;
      scheduleAfterDismiss(
        () => runUpload(mode, task),
        () => {
          setPicking(true);
          setShowPhotoSheet(false);
        },
      );
    },
    [photoTask, photoUploadTaskId, picking, runUpload, scheduleAfterDismiss],
  );

  return {
    showPhotoSheet,
    photoTask,
    photoUploadTaskId,
    photoStatusByTaskId,
    pendingCompletionPhoto,
    openPhotoSheet,
    clearPhotoSheet,
    requestPick,
    retryUpload,
    handleDismissed,
    photoSheetProps: {
      visible: showPhotoSheet,
      onClose: clearPhotoSheet,
      onDismissed: handleDismissed,
      dismissWithoutAnimation: picking,
      uploading: !!photoUploadTaskId || picking,
      onCamera: () => requestPick('camera'),
      onLibrary: () => requestPick('library'),
    },
  };
}
