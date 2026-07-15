import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ROUTE_PATHS } from '../config/routes';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

function GlobalSearch({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { state } = useAppContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const projects = state.projects || [];
  const tasks = state.tasks || [];
  const contacts = state.contacts || [];

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchQuery = query.toLowerCase();
    const searchResults = [];

    projects.forEach((project) => {
      if (
        project.name?.toLowerCase().includes(searchQuery)
        || project.address?.toLowerCase().includes(searchQuery)
      ) {
        searchResults.push({
          type: 'project',
          id: project.id,
          title: project.name,
          subtitle: project.address || 'No address',
        });
      }
    });

    tasks.forEach((task) => {
      if (task.text?.toLowerCase().includes(searchQuery)) {
        const project = projects.find((p) => p.id === task.project_id);
        searchResults.push({
          type: 'task',
          id: task.id,
          projectId: task.project_id,
          title: task.text,
          subtitle: project ? `Project: ${project.name}` : 'No project',
        });
      }
    });

    contacts.forEach((contact) => {
      if (
        contact.name?.toLowerCase().includes(searchQuery)
        || contact.company?.toLowerCase().includes(searchQuery)
      ) {
        searchResults.push({
          type: 'contact',
          id: contact.id,
          title: contact.name,
          subtitle: contact.company || contact.role || 'No company',
        });
      }
    });

    setResults(searchResults.slice(0, 12));
    setSelectedIndex(0);
  }, [query, projects, tasks, contacts]);

  const handleSelectResult = (result) => {
    if (result.type === 'project') {
      navigate(ROUTE_PATHS.projectTasks.replace(':id', result.id));
    } else if (result.type === 'task' && result.projectId) {
      navigate(ROUTE_PATHS.projectTasks.replace(':id', result.projectId));
    } else if (result.type === 'contact') {
      navigate(ROUTE_PATHS.tradePartners);
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelectResult(results[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose} align="start">
      <div className={`bg-white rounded-lg shadow-xl w-full max-w-2xl ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
        <div className="p-4 border-b">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, tasks, contacts..."
            className="w-full text-lg px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
            data-testid="global-search-input"
          />
        </div>

        {results.length > 0 ? (
          <div className="max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <button
                type="button"
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelectResult(result)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between gap-3 ${
                  index === selectedIndex ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{result.title}</p>
                  <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
                </div>
                <span className="text-xs text-gray-400 uppercase shrink-0">{result.type}</span>
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          <div className="p-8 text-center text-gray-500">No results found</div>
        ) : (
          <div className="p-8 text-center text-gray-500">Start typing to search…</div>
        )}

        <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 flex justify-between">
          <span>↑↓ Navigate · Enter Select · Esc Close</span>
          <span>Ctrl+K</span>
        </div>
      </div>
    </ModalOverlay>
  );
}

export default GlobalSearch;
