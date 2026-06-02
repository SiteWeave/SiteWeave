import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

function GlobalSearch({ isOpen, onClose }) {
    const { state, dispatch } = useAppContext();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const projects = state.projects || [];
    const tasks = state.tasks || [];
    const contacts = state.contacts || [];

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const searchQuery = query.toLowerCase();
        const searchResults = [];

        // Search projects
        projects.forEach(project => {
            if (project.name.toLowerCase().includes(searchQuery) || 
                project.address?.toLowerCase().includes(searchQuery)) {
                searchResults.push({
                    type: 'project',
                    id: project.id,
                    title: project.name,
                    subtitle: project.address || 'No address',
                    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
                });
            }
        });

        // Search tasks
        tasks.forEach(task => {
            if (task.text.toLowerCase().includes(searchQuery)) {
                const project = projects.find(p => p.id === task.project_id);
                searchResults.push({
                    type: 'task',
                    id: task.id,
                    title: task.text,
                    subtitle: project ? `Project: ${project.name}` : 'No project',
                    icon: 'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'
                });
            }
        });

        // Search contacts
        contacts.forEach(contact => {
            if (contact.name.toLowerCase().includes(searchQuery) || 
                contact.company?.toLowerCase().includes(searchQuery)) {
                searchResults.push({
                    type: 'contact',
                    id: contact.id,
                    title: contact.name,
                    subtitle: contact.company || contact.role || 'No company',
                    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                });
            }
        });

        setResults(searchResults.slice(0, 10)); // Limit to 10 results
        setSelectedIndex(0);
    }, [query, projects, tasks, contacts]);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            handleSelectResult(results[selectedIndex]);
        }
    };

    const handleSelectResult = (result) => {
        if (result.type === 'project') {
            dispatch({ type: 'SET_PROJECT', payload: result.id });
            dispatch({ type: 'SET_VIEW', payload: 'Projects' });
        } else if (result.type === 'task') {
            const task = tasks.find(t => t.id === result.id);
            if (task) {
                dispatch({ type: 'SET_PROJECT', payload: task.project_id });
                dispatch({ type: 'SET_VIEW', payload: 'Projects' });
            }
        } else if (result.type === 'contact') {
            dispatch({ type: 'SET_VIEW', payload: 'Contacts' });
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-start justify-center pt-20 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
                <div className="p-4 border-b">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search projects, tasks, contacts..."
                        className="w-full text-lg px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        autoFocus
                    />
                </div>
                
                {results.length > 0 ? (
                    <div className="max-h-96 overflow-y-auto">
                        {results.map((result, index) => (
                            <button type="button"
                                key={`${result.type}-${result.id}`}
                                onClick={() => handleSelectResult(result)}
                                className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 ${
                                    index === selectedIndex ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                                }`}
                            >
                                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={result.icon} />
                                </svg>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 truncate">{result.title}</p>
                                    <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
                                </div>
                                <span className="text-xs text-gray-400 uppercase">{result.type}</span>
                            </button>
                        ))}
                    </div>
                ) : query.trim() ? (
                    <div className="p-8 text-center text-gray-500">
                        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p>No results found for "{query}"</p>
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-500">
                        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p>Start typing to search...</p>
                    </div>
                )}
                
                <div className="p-3 border-t bg-gray-50 text-xs text-gray-500">
                    <div className="flex justify-between">
                        <span>↑↓ Navigate • Enter Select • Esc Close</span>
                        <span>Ctrl+F to open search</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default GlobalSearch;
