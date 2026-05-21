import React from 'react';

function ViewSwitcher({ currentView, onViewChange, compact = false }) {
    const views = [
        { id: 'card', label: 'Card', icon: 'grid' },
        { id: 'list', label: 'List', icon: 'list' },
        { id: 'board', label: 'Board', icon: 'columns' }
    ];

    const getIcon = (iconType) => {
        switch (iconType) {
            case 'grid':
                return (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                );
            case 'list':
                return (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                );
            case 'columns':
                return (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {views.map((view) => (
                <button
                    key={view.id}
                    onClick={() => onViewChange(view.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        currentView === view.id
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title={`${view.label} View`}
                >
                    {getIcon(view.icon)}
                    {!compact && <span className="hidden sm:inline">{view.label}</span>}
                </button>
            ))}
        </div>
    );
}

export default ViewSwitcher;

