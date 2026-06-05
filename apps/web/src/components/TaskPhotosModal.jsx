import React from 'react';
import TaskPhotoManager from './TaskPhotoManager';

function TaskPhotosModal({
    task,
    onClose,
    onAddPhotos,
    onUpdatePhoto,
    onDeletePhoto,
    onMovePhoto,
    canManagePhotos = false,
    photoActionBusy = false,
    photoUploadProgress = null,
}) {
    if (!task) return null;

    const photoProps = {
        photos: task.task_photos || [],
        editable: canManagePhotos,
        isBusy: photoActionBusy,
        uploadProgress: photoUploadProgress,
        onAddFiles: (files) => onAddPhotos?.(task.id, files),
        onUpdatePhoto: onUpdatePhoto ? (photoId, updates) => onUpdatePhoto(task.id, photoId, updates) : undefined,
        onDeletePhoto: onDeletePhoto ? (photoId) => onDeletePhoto(task.id, photoId) : undefined,
        onMovePhoto: onMovePhoto ? (photoId, direction) => onMovePhoto(task.id, photoId, direction) : undefined,
        emptyMessage: 'No photos yet.',
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-photos-modal-title"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 mb-4">
                    <h2 id="task-photos-modal-title" className="text-lg font-bold text-gray-900 pr-2">
                        Task photos
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 text-gray-500 hover:text-gray-800 p-1 rounded-lg"
                        aria-label="Close"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <p className="text-sm text-gray-700 mb-3 line-clamp-2">{task.text}</p>
                <TaskPhotoManager {...photoProps} />
            </div>
        </div>
    );
}

export default TaskPhotosModal;
