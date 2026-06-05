import React, { useRef } from 'react';

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
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Move Up
                        </button>
                        <button
                          type="button"
                          onClick={() => onMovePhoto?.(key, 1)}
                          disabled={isBusy || index === photos.length - 1}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Move Down
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePhoto?.(key)}
                          disabled={isBusy}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
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
