import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Click-to-edit text: label becomes an input in place. Enter/blur saves; Escape cancels.
 */
const InlineEditableText = forwardRef(function InlineEditableText(
    {
        value,
        onSave,
        canEdit = true,
        className = '',
        inputClassName = '',
        ariaLabel,
        placeholder = '',
        debounceMs = 0,
        as: Tag = 'span',
    },
    ref,
) {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value || '');
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        if (!editing) setDraft(value || '');
    }, [value, editing]);

    useImperativeHandle(ref, () => ({
        focusEdit() {
            if (canEdit) setEditing(true);
        },
    }));

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const commit = useCallback(
        (nextValue) => {
            const trimmed = String(nextValue ?? '').trim();
            if (!trimmed) {
                setDraft(value || '');
                setEditing(false);
                return;
            }
            if (trimmed !== String(value || '').trim()) {
                onSave?.(trimmed);
            }
            setEditing(false);
        },
        [onSave, value],
    );

    const scheduleSave = useCallback(
        (nextValue) => {
            if (debounceMs <= 0) return;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => commit(nextValue), debounceMs);
        },
        [commit, debounceMs],
    );

    useEffect(
        () => () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        },
        [],
    );

    if (editing && canEdit) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    scheduleSave(e.target.value);
                }}
                onBlur={() => commit(draft)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit(draft);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setDraft(value || '');
                        setEditing(false);
                    }
                }}
                onClick={(e) => e.stopPropagation()}
                className={`min-w-0 flex-1 px-1.5 py-0.5 text-sm font-semibold border border-gray-300 rounded focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 ${inputClassName}`}
                aria-label={ariaLabel}
                placeholder={placeholder}
            />
        );
    }

    return (
        <Tag
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={
                canEdit
                    ? (e) => {
                          e.stopPropagation();
                          setEditing(true);
                      }
                    : undefined
            }
            onKeyDown={
                canEdit
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditing(true);
                          }
                      }
                    : undefined
            }
            title={canEdit ? t('common.click_to_edit') : undefined}
            className={`min-w-0 flex-1 ui-ellipsis-1 ${canEdit ? 'cursor-text hover:underline underline-offset-2 decoration-gray-300' : ''} ${className}`}
        >
            {value || placeholder}
        </Tag>
    );
});

export default InlineEditableText;
