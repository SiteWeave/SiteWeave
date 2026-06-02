import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';
import DateDropdown from './DateDropdown';
import { getFieldIssueDisplayStatus } from '../utils/fieldIssueStatus';

const FieldIssues = ({ projectId }) => {
    const { i18n } = useTranslation();
    const { state } = useAppContext();
    const { addToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [fieldIssues, setFieldIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all'); // all, open, closed
    const [editingIssue, setEditingIssue] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [issueToDelete, setIssueToDelete] = useState(null);

    const contacts = state.contacts || [];

    // Get project team members for dropdown
    const projectTeamMembers = contacts.filter(contact => {
        const hasProjectAccess = contact.project_contacts?.some(pc => 
            pc.project_id === projectId || 
            pc.project_id === String(projectId) || 
            String(pc.project_id) === String(projectId)
        );
        return hasProjectAccess && contact.type === 'Team';
    });

    // Debug logging
    console.log('Current projectId:', projectId);
    console.log('All contacts:', state.contacts);
    console.log('Project team members:', projectTeamMembers);
    console.log('Contact IDs:', projectTeamMembers.map(c => ({ id: c.id, name: c.name, idType: typeof c.id })));

    // Form state for creating new issues
    const [newIssue, setNewIssue] = useState({
        title: '',
        description: '',
        priority: 'Medium',
        dueDate: ''
    });

    // Fetch field issues from database
    useEffect(() => {
        const fetchFieldIssues = async () => {
            if (!projectId) return;
            
            try {
                setIsLoading(true);
                const { data, error } = await supabaseClient
                    .from('project_issues')
                    .select('*')
                    .eq('project_id', projectId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('Error fetching field issues:', error);
                    addToast('Error loading field issues', 'error');
                    return;
                }

                setFieldIssues(data || []);
            } catch (error) {
                console.error('Error fetching field issues:', error);
                addToast('Error loading field issues', 'error');
            } finally {
                setIsLoading(false);
            }
        };

        fetchFieldIssues();
    }, [projectId, addToast]);

    const getPriorityColor = (priority) => {
        switch (priority.toLowerCase()) {
            case 'critical':
                return 'bg-red-100 text-red-800 border-red-200';
            case 'high':
                return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'medium':
                return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'low':
                return 'bg-green-100 text-green-800 border-green-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    };


    const handleFileUpload = async (issueId, event) => {
        const file = event.target.files[0];
        if (!file) return;

        addToast('File upload feature has been disabled. Storage integration is no longer available.', 'info');
    };

    const handleCreateIssue = async () => {
        if (!newIssue.title.trim()) {
            addToast('Please enter an issue title', 'error');
            return;
        }

        setIsCreating(true);
        try {
            // Create the issue (without workflow)
            const { error: issueError } = await supabaseClient
                .from('project_issues')
                .insert({
                    project_id: projectId,
                    title: newIssue.title,
                    description: newIssue.description,
                    priority: newIssue.priority,
                    due_date: newIssue.dueDate || null,
                    created_by_user_id: state.user?.id,
                    status: 'open'
                });

            if (issueError) {
                throw issueError;
            }

            addToast('Issue created successfully!', 'success');
            setShowCreateModal(false);
            setNewIssue({ title: '', description: '', priority: 'Medium', dueDate: '' });
            
            // Refresh the field issues
            const { data, error } = await supabaseClient
                .from('project_issues')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            if (!error) {
                setFieldIssues(data || []);
            }
        } catch (error) {
            addToast('Error creating issue: ' + error.message, 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleToggleStatus = async (issue) => {
        const display = getFieldIssueDisplayStatus(issue);
        const newStatus = display === 'open' ? 'closed' : 'open';
        try {
            const { error } = await supabaseClient
                .from('project_issues')
                .update({ status: newStatus })
                .eq('id', issue.id);

            if (error) {
                throw error;
            }

            addToast(`Issue ${newStatus === 'open' ? 'reopened' : 'closed'} successfully!`, 'success');
            
            // Refresh issues
            const { data, error: fetchError } = await supabaseClient
                .from('project_issues')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            if (!fetchError) {
                setFieldIssues(data || []);
            }
        } catch (error) {
            addToast('Error updating issue status: ' + error.message, 'error');
        }
    };

    const handleEditIssue = (issue) => {
        setEditingIssue(issue);
        setNewIssue({
            title: issue.title,
            description: issue.description || '',
            priority: issue.priority || 'Medium',
            dueDate: issue.due_date || ''
        });
        setIsEditing(true);
        setShowCreateModal(true);
    };

    const handleUpdateIssue = async () => {
        if (!editingIssue || !newIssue.title.trim()) {
            addToast('Please enter an issue title', 'error');
            return;
        }

        setIsCreating(true);
        try {
            const { error } = await supabaseClient
                .from('project_issues')
                .update({
                    title: newIssue.title,
                    description: newIssue.description,
                    priority: newIssue.priority,
                    due_date: newIssue.dueDate || null
                })
                .eq('id', editingIssue.id);

            if (error) {
                throw error;
            }

            addToast('Issue updated successfully!', 'success');
            setShowCreateModal(false);
            setEditingIssue(null);
            setIsEditing(false);
            setNewIssue({ title: '', description: '', priority: 'Medium', dueDate: '' });
            
            // Refresh issues
            const { data, error: fetchError } = await supabaseClient
                .from('project_issues')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            if (!fetchError) {
                setFieldIssues(data || []);
            }
        } catch (error) {
            addToast('Error updating issue: ' + error.message, 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteIssue = async (issueId) => {
        setIssueToDelete(issueId);
    };

    const confirmDeleteIssue = async () => {
        if (!issueToDelete) return;

        setIsDeleting(true);
        try {
            const { error } = await supabaseClient
                .from('project_issues')
                .delete()
                .eq('id', issueToDelete);

            if (error) {
                throw error;
            }

            addToast('Issue deleted successfully!', 'success');
            setIssueToDelete(null);
            
            // Refresh issues
            const { data, error: fetchError } = await supabaseClient
                .from('project_issues')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            if (!fetchError) {
                setFieldIssues(data || []);
            }
        } catch (error) {
            addToast('Error deleting issue: ' + error.message, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    // Filter issues based on normalized status (matches badge; handles resolved, casing, resolved_at)
    const filteredIssues = fieldIssues.filter((issue) => {
        const display = getFieldIssueDisplayStatus(issue);
        if (statusFilter === 'open') return display === 'open';
        if (statusFilter === 'closed') return display === 'closed';
        return true;
    });

    const openCount = fieldIssues.filter((i) => getFieldIssueDisplayStatus(i) === 'open').length;
    const closedCount = fieldIssues.filter((i) => getFieldIssueDisplayStatus(i) === 'closed').length;

    return (
        <div className="p-6 bg-white rounded-xl shadow-xs border border-gray-200">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                    <h2 className="text-xl font-bold">Field Issues ({fieldIssues.length})</h2>
                    <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
                        {[
                            { key: 'all', label: `All (${fieldIssues.length})` },
                            { key: 'open', label: `Open (${openCount})` },
                            { key: 'closed', label: `Done (${closedCount})` },
                        ].map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => setStatusFilter(option.key)}
                                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                                    statusFilter === option.key
                                        ? 'bg-white text-gray-900 shadow-xs'
                                        : 'text-gray-500 hover:text-gray-800'
                                }`}
                                aria-pressed={statusFilter === option.key}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
                <button type="button" 
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-xs hover:bg-blue-700"
                >
                    + Create Issue
                </button>
            </div>

            {isLoading ? (
                <div className="text-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading field issues...</p>
                </div>
            ) : filteredIssues.length > 0 ? (
                <div className="space-y-4">
                    {filteredIssues.map((issue) => {
                        const displayStatus = getFieldIssueDisplayStatus(issue);
                        return (
                        <div key={issue.id} className={`border rounded-lg p-4 transition-colors ${
                            displayStatus === 'closed' 
                                ? 'bg-gray-50 border-gray-300 opacity-75' 
                                : 'border-gray-200 bg-white'
                        }`}>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className={`font-semibold ${
                                            displayStatus === 'closed' 
                                                ? 'text-gray-500 line-through' 
                                                : 'text-gray-900'
                                        }`}>
                                            {issue.title}
                                        </h3>
                                        <button type="button"
                                            onClick={() => handleToggleStatus(issue)}
                                            className={`px-2 py-1 text-xs font-semibold rounded-full border transition-colors ${
                                                displayStatus === 'open'
                                                    ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
                                                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                            }`}
                                            title={displayStatus === 'open' ? 'Mark as closed' : 'Mark as open'}
                                        >
                                            {displayStatus === 'open' ? 'Open' : 'Closed'}
                                        </button>
                                    </div>
                                    <p className={`text-sm mb-2 ${
                                        displayStatus === 'closed' 
                                            ? 'text-gray-400' 
                                            : 'text-gray-600'
                                    }`}>
                                        {issue.description}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span>Created: {formatDate(issue.created_at)}</span>
                                        {issue.due_date && <span>Due: {formatDate(issue.due_date)}</span>}
                                        {displayStatus === 'closed' && (
                                            <span className="text-green-600 font-medium">✓ Resolved</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getPriorityColor(issue.priority)}`}>
                                        {issue.priority}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button type="button"
                                            onClick={() => handleEditIssue(issue)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title="Edit issue"
                                        >
                                            <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                                        </button>
                                        <button type="button"
                                            onClick={() => handleDeleteIssue(issue.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Delete issue"
                                        >
                                            <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon path="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No field issues</h3>
                    <p className="text-gray-500 mb-4">Create issues to track and resolve project problems.</p>
                    <button type="button" 
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        Create Your First Issue
                    </button>
                </div>
            )}

            {/* Create Issue Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold">{isEditing ? 'Edit Issue' : 'Create New Issue'}</h3>
                                <button type="button" 
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setEditingIssue(null);
                                        setIsEditing(false);
                                        setNewIssue({ title: '', description: '', priority: 'Medium', dueDate: '' });
                                    }}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Issue Details */}
                            <div className="space-y-4">
                                <h4 className="text-lg font-semibold text-gray-900">Issue Details</h4>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Issue Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={newIssue.title}
                                        onChange={(e) => setNewIssue({...newIssue, title: e.target.value})}
                                        placeholder="e.g., Soil conflict in Sector C"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Description
                                    </label>
                                    <textarea
                                        value={newIssue.description}
                                        onChange={(e) => setNewIssue({...newIssue, description: e.target.value})}
                                        placeholder="e.g., Hit unexpected rock shelf at grid line B-4..."
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Priority
                                        </label>
                                        <select
                                            value={newIssue.priority}
                                            onChange={(e) => setNewIssue({...newIssue, priority: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                            <option value="Critical">Critical</option>
                                        </select>
                                    </div>
                                    <DateDropdown 
                                        value={newIssue.dueDate} 
                                        onChange={(value) => setNewIssue({...newIssue, dueDate: value})} 
                                        label="Due Date"
                                    />
                                </div>
                            </div>

                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button type="button"
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setEditingIssue(null);
                                    setIsEditing(false);
                                    setNewIssue({ title: '', description: '', priority: 'Medium', dueDate: '' });
                                }}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button type="button"
                                onClick={isEditing ? handleUpdateIssue : handleCreateIssue}
                                disabled={isCreating}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {isCreating 
                                    ? (isEditing ? 'Updating...' : 'Creating...') 
                                    : (isEditing ? 'Update Issue' : 'Create Issue')
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {issueToDelete && (
                <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Delete Issue</h3>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to delete this issue? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button type="button"
                                onClick={() => setIssueToDelete(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button type="button"
                                onClick={confirmDeleteIssue}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Issue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FieldIssues;