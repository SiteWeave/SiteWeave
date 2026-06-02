import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

function TaskBulkActions({ selectedTasks, onBulkComplete, onBulkDelete, onClearSelection }) {
    const { t } = useTranslation();
    if (selectedTasks.length === 0) return null;

    return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-blue-800">
                        {t(selectedTasks.length === 1 ? 'tasks.bulk_selected_one' : 'tasks.bulk_selected_other', { count: selectedTasks.length })}
                    </span>
                    <div className="flex gap-2">
                        <button type="button"
                            onClick={() => onBulkComplete(selectedTasks)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center gap-1"
                        >
                            <Icon path="M4.5 12.75l6 6 9-13.5" className="w-4 h-4" />
                            {t('tasks.complete_all')}
                        </button>
                        <button type="button"
                            onClick={() => onBulkDelete(selectedTasks)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1"
                        >
                            <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4" />
                            {t('tasks.delete_all')}
                        </button>
                    </div>
                </div>
                <button type="button"
                    onClick={onClearSelection}
                    className="text-blue-600 hover:text-blue-800"
                    title={t('tasks.clear_selection')}
                >
                    <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}

export default TaskBulkActions;
