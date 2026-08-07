import React from 'react';
import TaskCommentsPanel from './TaskCommentsPanel';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

export default function TaskDiscussionModal({ task, project, onClose }) {
  if (!task || !project) return null;

  return (
    <ModalOverlay
      onClose={onClose}
      zIndexClass="z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-discussion-modal-title"
    >
      <div className={`bg-white rounded-xl shadow-2xl max-w-lg w-full ${MODAL_PANEL_MAX_H} overflow-y-auto p-5`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="task-discussion-modal-title" className="text-lg font-bold text-gray-900 pr-2">
            Task discussion
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
        <p className="text-sm text-gray-700 mb-4 line-clamp-2">{task.text}</p>
        <TaskCommentsPanel task={task} project={project} inModal />
      </div>
    </ModalOverlay>
  );
}
