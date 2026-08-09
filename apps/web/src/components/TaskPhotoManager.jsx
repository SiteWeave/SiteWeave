import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

const ICON_ARROW_UP = 'M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18';
const ICON_ARROW_DOWN = 'M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3';
const ICON_TRASH =
  'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0';

function TaskPhotoManager({
  photos = [],
  editable = true,
  isBusy = false,
  /** `{ current, total }` while uploading multiple files (sequential uploads). */
  uploadProgress = null,
  onAddFiles,
  onUpdatePhoto,
  onDeletePhoto,
  onMovePhoto,
  emptyMessage = 'No task photos yet.',
  className = '',
}) {
  const { t } = useTranslation();
  const inputRef = useRef(null);

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0 && onAddFiles) {
      await onAddFiles(files);
    }
    event.target.value = '';
  };

  const openPicker = () => {
    if (!editable || isBusy) return;
    inputRef.current?.click();
  };

  const progressLabel =
    uploadProgress &&
    typeof uploadProgress.current === 'number' &&
    typeof uploadProgress.total === 'number'
      ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
      : null;

  return (
    <div className={`mt-3 rounded-lg border border-gray-200 bg-white/70 p-3 ${className}`.trim()}>
      {isBusy && uploadProgress && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">{progressLabel || 'Uploading…'}</p>
          <p className="mt-1 text-amber-800/90">
            Keep this window open on slow connections. Closing or locking the device may cancel the upload.
          </p>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Task Photos</p>
          {(photos.length > 0 || emptyMessage) && (
            <p className="text-xs text-gray-400">
              {photos.length > 0 ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : emptyMessage}
            </p>
          )}
        </div>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={isBusy}
            />
            <button
              type="button"
              onClick={openPicker}
              disabled={isBusy}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Photos
            </button>
          </>
        )}
      </div>

      {photos.length === 0 ? null : (
        <div className="space-y-3">
          {photos.map((photo, index) => {
            const key = photo.id || photo.local_id || `${photo.storage_path || 'photo'}-${index}`;
            const imageUrl = photo.thumbnail_url || photo.preview_url || photo.full_url;
            const fullUrl = photo.full_url || photo.thumbnail_url || photo.preview_url;

            return (
              <div key={key} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <a
                    href={fullUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className={`block h-24 w-full overflow-hidden rounded-md border border-gray-200 bg-white sm:w-24 ${fullUrl ? '' : 'pointer-events-none'}`}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt={photo.caption || 'Task photo'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">No preview</div>
                    )}
                  </a>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {photo.is_completion_photo && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Completion photo
                        </span>
                      )}
                      {photo.original_filename && (
                        <span className="text-xs text-gray-400">{photo.original_filename}</span>
                      )}
                    </div>

                    {photo.captured_at && (
                      <p className="text-[11px] text-gray-500">
                        Taken:{' '}
                        {new Date(photo.captured_at).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    )}

                    {editable ? (
                      <textarea
                        defaultValue={photo.caption || ''}
                        onBlur={(event) => {
                          if ((photo.caption || '') !== event.target.value) {
                            onUpdatePhoto?.(key, { caption: event.target.value });
                          }
                        }}
                        rows={2}
                        disabled={isBusy}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Add a caption"
                      />
                    ) : (
                      photo.caption && <p className="text-sm text-gray-600">{photo.caption}</p>
                    )}

                    {editable && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={Boolean(photo.is_completion_photo)}
                            onChange={(event) => onUpdatePhoto?.(key, { is_completion_photo: event.target.checked })}
                            disabled={isBusy}
                          />
                          Use as completion evidence
                        </label>
                        <button
                          type="button"
                          onClick={() => onMovePhoto?.(key, -1)}
                          disabled={isBusy || index === 0}
                          title={t('common.move_up', { defaultValue: 'Move up' })}
                          aria-label={t('common.move_up', { defaultValue: 'Move up' })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Icon path={ICON_ARROW_UP} className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMovePhoto?.(key, 1)}
                          disabled={isBusy || index === photos.length - 1}
                          title={t('common.move_down', { defaultValue: 'Move down' })}
                          aria-label={t('common.move_down', { defaultValue: 'Move down' })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Icon path={ICON_ARROW_DOWN} className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePhoto?.(key)}
                          disabled={isBusy}
                          title={t('common.remove_photo', { defaultValue: 'Remove photo' })}
                          aria-label={t('common.remove_photo', { defaultValue: 'Remove photo' })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Icon path={ICON_TRASH} className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TaskPhotoManager;
