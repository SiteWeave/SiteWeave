import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Searchable dependency picker with tag-style selected items (replaces native multi-select).
 */
function TaskDependencyCombobox({
  allTasks = [],
  selectedIds,
  onChange,
  label = 'Dependencies (Finish-to-Start)',
  helperText = 'Selected tasks must finish before this new task can start.',
  inputClassName = '',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const taskById = useMemo(() => {
    const m = new Map();
    allTasks.forEach((t) => m.set(t.id, t));
    return m;
  }, [allTasks]);

  const selectedTasks = useMemo(
    () => selectedIds.map((id) => taskById.get(id)).filter(Boolean),
    [selectedIds, taskById],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTasks
      .filter((t) => !selectedIds.includes(t.id) && (!q || String(t.text).toLowerCase().includes(q)))
      .slice(0, 40);
  }, [allTasks, selectedIds, query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const add = (id) => {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
    }
    setQuery('');
    setOpen(false);
  };

  const remove = (id) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div ref={rootRef} className="relative">
      {label ? (
        <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      ) : null}
      <input
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={allTasks.length ? 'Search tasks to add…' : 'No tasks available yet'}
        disabled={!allTasks.length}
        className={inputClassName}
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((t) => (
            <li key={t.id} role="option">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(t.id)}
                className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              >
                {t.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && allTasks.length > 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
          No matching tasks
        </p>
      )}
      {selectedTasks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedTasks.map((t) => (
            <span
              key={t.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-100 bg-blue-50 pl-2.5 pr-1 py-0.5 text-xs text-blue-900"
            >
              <span className="min-w-0 truncate">{t.text}</span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="shrink-0 rounded-full p-0.5 text-blue-700 hover:bg-blue-100"
                aria-label={`Remove ${t.text}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {helperText ? <p className="mt-1.5 text-xs text-gray-500">{helperText}</p> : null}
    </div>
  );
}

export default TaskDependencyCombobox;
