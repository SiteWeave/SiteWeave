import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function PhaseQuickAdd({ onAdd, isMutating = false }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
    }, [open]);

    const submit = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const ok = await onAdd(trimmed);
        if (ok !== false) {
            setName('');
            setOpen(false);
        }
    };

    const cancel = () => {
        setName('');
        setOpen(false);
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={isMutating}
                className="w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/30 transition-colors disabled:opacity-50"
            >
                {t('projectDetail.quick_add_phase_label')}
            </button>
        );
    }

    return (
        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/20 p-3 flex flex-wrap items-center gap-2">
            <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        submit();
                    } else if (e.key === 'Escape') {
                        cancel();
                    }
                }}
                placeholder={t('projectDetail.quick_add_phase_placeholder')}
                className="flex-1 min-w-[12rem] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isMutating}
            />
            <button
                type="button"
                onClick={submit}
                disabled={isMutating || !name.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
                {t('common.add')}
            </button>
            <button
                type="button"
                onClick={cancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
                {t('common.cancel')}
            </button>
        </div>
    );
}

export default PhaseQuickAdd;
