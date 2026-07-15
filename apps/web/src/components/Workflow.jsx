import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';

const Workflow = ({ projectId }) => {
    const { i18n } = useTranslation();
    const { state } = useAppContext();
    const { addToast } = useToast();
    const [workflows, setWorkflows] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [expandedWorkflow, setExpandedWorkflow] = useState(null);

    const contacts = state.contacts || [];

    // Get project team members
    const projectTeamMembers = contacts.filter(contact => {
        const hasProjectAccess = contact.project_contacts?.some(pc => 
            pc.project_id === projectId || 
            pc.project_id === String(projectId) || 
            String(pc.project_id) === String(projectId)
        );
        return hasProjectAccess && contact.type === 'Team';
    });

    // Form state for creating new workflow
    const [newWorkflow, setNewWorkflow] = useState({
        title: '',
        description: ''
    });
    const [workflowSteps, setWorkflowSteps] = useState([
        { step_order: 1, description: '', assigned_to_contact_id: '', assigned_to_name: '', assigned_to_role: '' }
    ]);

    // Fetch workflows (tasks with workflow_steps)
    useEffect(() => {
        if (!projectId) return;
        fetchWorkflows();
    }, [projectId]);

    const fetchWorkflows = async () => {
        if (!projectId) return;
        
        try {
            setIsLoading(true);
            const { data, error } = await supabaseClient
                .from('tasks')
                .select('*')
                .eq('project_id', projectId)
                .not('workflow_steps', 'is', null);

            if (error) {
                console.error('Error fetching workflows:', error);
                addToast('Error loading workflows', 'error');
                return;
            }

            // Filter tasks that have workflow steps
            const workflowsWithSteps = (data || []).filter(task => {
                try {
                    const steps = typeof task.workflow_steps === 'string' 
                        ? JSON.parse(task.workflow_steps) 
                        : task.workflow_steps;
                    return steps && Array.isArray(steps) && steps.length > 0;
                } catch {
                    return false;
                }
            });

            setWorkflows(workflowsWithSteps);
        } catch (error) {
            console.error('Error fetching workflows:', error);
            addToast('Error loading workflows', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateWorkflow = async () => {
        if (!newWorkflow.title.trim()) {
            addToast('Please enter a workflow title', 'error');
            return;
        }

        if (workflowSteps.some(step => !step.description.trim())) {
            addToast('Please complete all workflow steps', 'error');
            return;
        }

        setIsCreating(true);
        try {
            // Create a task with workflow steps
            const workflowStepsJson = JSON.stringify(workflowSteps.map(step => ({
                step_order: step.step_order,
                description: step.description,
                assigned_to_contact_id: step.assigned_to_contact_id,
                assigned_to_name: step.assigned_to_name,
                assigned_to_role: step.assigned_to_role
            })));

            const { error: taskError } = await supabaseClient
                .from('tasks')
                .insert({
                    project_id: projectId,
                    text: newWorkflow.title,
                    workflow_steps: workflowStepsJson,
                    current_workflow_step: 1,
                    completed: false
                });

            if (taskError) {
                throw taskError;
            }

            addToast('Workflow created successfully!', 'success');
            setShowCreateModal(false);
            setNewWorkflow({ title: '', description: '' });
            setWorkflowSteps([{ step_order: 1, description: '', assigned_to_contact_id: '', assigned_to_name: '', assigned_to_role: '' }]);
            
            await fetchWorkflows();
        } catch (error) {
            addToast('Error creating workflow: ' + error.message, 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleStepComplete = async (workflowId, stepIndex) => {
        try {
            const workflow = workflows.find(w => w.id === workflowId);
            if (!workflow) return;

            let workflowSteps = [];
            try {
                workflowSteps = typeof workflow.workflow_steps === 'string' 
                    ? JSON.parse(workflow.workflow_steps) 
                    : workflow.workflow_steps;
            } catch (e) {
                console.error('Error parsing workflow steps:', e);
                return;
            }

            const currentStep = workflow.current_workflow_step || 1;
            if (stepIndex + 1 !== currentStep) {
                addToast('Please complete steps in order', 'warning');
                return;
            }

            const nextStep = currentStep + 1;
            const isComplete = nextStep > workflowSteps.length;

            const { error } = await supabaseClient
                .from('tasks')
                .update({
                    current_workflow_step: isComplete ? workflowSteps.length + 1 : nextStep,
                    completed: isComplete
                })
                .eq('id', workflowId);

            if (error) {
                throw error;
            }

            addToast(isComplete ? 'Workflow completed!' : 'Step completed!', 'success');
            await fetchWorkflows();
        } catch (error) {
            addToast('Error completing step: ' + error.message, 'error');
        }
    };

    const addWorkflowStep = () => {
        setWorkflowSteps([...workflowSteps, { 
            step_order: workflowSteps.length + 1, 
            description: '', 
            assigned_to_contact_id: '', 
            assigned_to_name: '', 
            assigned_to_role: '' 
        }]);
    };

    const removeWorkflowStep = (index) => {
        if (workflowSteps.length > 1) {
            const newSteps = workflowSteps.filter((_, i) => i !== index);
            const reorderedSteps = newSteps.map((step, i) => ({ ...step, step_order: i + 1 }));
            setWorkflowSteps(reorderedSteps);
        }
    };

    const updateWorkflowStep = (index, field, value) => {
        const newSteps = [...workflowSteps];
        if (field === 'assigned_to_contact_id') {
            const selectedContact = projectTeamMembers.find(c => c.id === value);
            newSteps[index] = { 
                ...newSteps[index], 
                assigned_to_contact_id: value,
                assigned_to_name: selectedContact?.name || '',
                assigned_to_role: selectedContact?.role || ''
            };
        } else {
            newSteps[index] = { ...newSteps[index], [field]: value };
        }
        setWorkflowSteps(newSteps);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-xs border border-gray-200">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Workflows ({workflows.length})</h2>
                <button type="button" 
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-xs hover:bg-blue-700"
                >
                    + Create Workflow
                </button>
            </div>

            {isLoading ? (
                <div className="text-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading workflows...</p>
                </div>
            ) : workflows.length > 0 ? (
                <div className="space-y-2">
                    {workflows.map((workflow) => {
                        let workflowSteps = [];
                        try {
                            workflowSteps = typeof workflow.workflow_steps === 'string' 
                                ? JSON.parse(workflow.workflow_steps) 
                                : workflow.workflow_steps;
                        } catch (e) {
                            console.error('Error parsing workflow steps:', e);
                        }
                        const currentStep = workflow.current_workflow_step || 1;
                        const isComplete = workflow.completed || currentStep > workflowSteps.length;
                        const completedStepsCount = isComplete ? workflowSteps.length : Math.max(0, currentStep - 1);
                        
                        return (
                            <div key={workflow.id} className={`border rounded-lg overflow-hidden transition-all ${
                                isComplete ? 'border-green-300 bg-green-50/30' : 'border-gray-200 bg-white'
                            }`}>
                                <div 
                                    onClick={() => setExpandedWorkflow(expandedWorkflow === workflow.id ? null : workflow.id)}
                                    className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className={`font-semibold ${
                                                    isComplete ? 'text-green-800' : 'text-gray-900'
                                                }`}>
                                                    {workflow.text}
                                                </h3>
                                                {isComplete && (
                                                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-600 text-white flex items-center gap-1">
                                                        <Icon path="M5 13l4 4L19 7" className="w-3 h-3" />
                                                        Complete
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                                <span>Created: {formatDate(workflow.created_at)}</span>
                                                <span className={isComplete ? 'text-green-600 font-semibold' : ''}>
                                                    {isComplete 
                                                        ? `All ${workflowSteps.length} steps completed` 
                                                        : `Step ${currentStep} of ${workflowSteps.length}`
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <Icon 
                                                path={expandedWorkflow === workflow.id ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"} 
                                                className="w-4 h-4 text-gray-400" 
                                            />
                                        </div>
                                    </div>

                                    {/* Workflow Progress Tracker */}
                                    <div className="mt-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs font-medium text-gray-600">Progress:</span>
                                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all ${
                                                        isComplete ? 'bg-green-600' : 'bg-blue-600'
                                                    }`}
                                                    style={{ width: `${(completedStepsCount / workflowSteps.length) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-semibold text-gray-700">
                                                {completedStepsCount}/{workflowSteps.length}
                                            </span>
                                        </div>
                                        <div className="mt-4 px-6">
                                            <div className="flex items-start gap-6">
                                                {workflowSteps.map((step, index) => {
                                                    const stepNumber = index + 1;
                                                    const stepIsCompleted = isComplete || stepNumber < currentStep;
                                                    const stepIsCurrent = stepNumber === currentStep && !isComplete;
                                                    
                                                    return (
                                                        <React.Fragment key={index}>
                                                            <div className="flex flex-col items-center flex-shrink-0">
                                                                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all ${
                                                                    stepIsCompleted
                                                                        ? 'bg-green-600 text-white shadow-md' 
                                                                        : stepIsCurrent
                                                                        ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                                                                        : 'bg-gray-200 text-gray-500'
                                                                }`}>
                                                                    {stepIsCompleted ? (
                                                                        <Icon path="M5 13l4 4L19 7" className="w-4 h-4" />
                                                                    ) : (
                                                                        <span>{stepNumber}</span>
                                                                    )}
                                                                </div>
                                                                <span className={`mt-2 text-xs font-medium text-center max-w-[100px] ${
                                                                    stepIsCompleted
                                                                        ? 'text-green-700' 
                                                                        : stepIsCurrent
                                                                        ? 'text-blue-700 font-semibold'
                                                                        : 'text-gray-500'
                                                                }`}>
                                                                    {step.description.length > 12 ? step.description.substring(0, 12) + '...' : step.description}
                                                                </span>
                                                            </div>
                                                            {index < workflowSteps.length - 1 && (
                                                                <div className={`flex-1 h-0.5 transition-all ${
                                                                    stepIsCompleted ? 'bg-green-600' : 'bg-gray-200'
                                                                }`} style={{ marginTop: '16px' }} />
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Action Panel */}
                                {expandedWorkflow === workflow.id && (
                                    <div className={`border-t p-4 ${
                                        isComplete ? 'bg-green-50/50 border-green-200' : 'bg-gray-50 border-gray-200'
                                    }`}>
                                        <div className="mb-3">
                                            <h4 className="text-sm font-semibold text-gray-700 mb-1">Workflow Steps</h4>
                                            <p className="text-xs text-gray-500">
                                                {isComplete 
                                                    ? 'All steps have been completed successfully.' 
                                                    : `Complete steps in order. Currently on step ${currentStep} of ${workflowSteps.length}.`
                                                }
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            {workflowSteps.map((step, index) => {
                                                const stepNumber = index + 1;
                                                const isCurrentStep = stepNumber === currentStep && !isComplete;
                                                const isCompleted = isComplete || stepNumber < currentStep;
                                                const isPending = !isComplete && stepNumber > currentStep;

                                                return (
                                                    <div 
                                                        key={index} 
                                                        className={`p-3 rounded-lg border transition-all ${
                                                            isCompleted
                                                                ? 'bg-green-50 border-green-200'
                                                                : isCurrentStep
                                                                ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                                                                : 'bg-white border-gray-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold flex-shrink-0 ${
                                                                isCompleted
                                                                    ? 'bg-green-600 text-white' 
                                                                    : isCurrentStep
                                                                    ? 'bg-blue-600 text-white'
                                                                    : 'bg-gray-200 text-gray-500'
                                                            }`}>
                                                                {isCompleted ? (
                                                                    <Icon path="M5 13l4 4L19 7" className="w-4 h-4" />
                                                                ) : (
                                                                    <span>{stepNumber}</span>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1">
                                                                        <p className={`text-sm font-medium ${
                                                                            isCompleted
                                                                                ? 'text-green-800'
                                                                                : isCurrentStep
                                                                                ? 'text-blue-800'
                                                                                : 'text-gray-600'
                                                                        }`}>
                                                                            {step.description}
                                                                        </p>
                                                                        {step.assigned_to_name && (
                                                                            <p className="text-xs text-gray-500 mt-1">
                                                                                Assigned to: <span className="font-medium">{step.assigned_to_name}</span>
                                                                                {step.assigned_to_role && (
                                                                                    <span className="text-gray-400"> ({step.assigned_to_role})</span>
                                                                                )}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    {isCompleted && (
                                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 flex-shrink-0">
                                                                            Done
                                                                        </span>
                                                                    )}
                                                                    {isCurrentStep && (
                                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 flex-shrink-0">
                                                                            Current
                                                                        </span>
                                                                    )}
                                                                    {isPending && (
                                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                                                                            Pending
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isCurrentStep && (
                                                                    <button type="button"
                                                                        onClick={() => handleStepComplete(workflow.id, index)}
                                                                        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors shadow-xs"
                                                                    >
                                                                        {stepNumber === workflowSteps.length 
                                                                            ? '✓ Complete Final Step' 
                                                                            : '✓ Mark Step Complete'
                                                                        }
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {isComplete && (
                                            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <Icon path="M5 13l4 4L19 7" className="w-5 h-5 text-green-700" />
                                                    <p className="text-sm font-semibold text-green-800">
                                                        Workflow Completed Successfully!
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No workflows yet</h3>
                    <p className="text-gray-500 mb-4">Create workflows to track multi-step processes and task progress.</p>
                    <button type="button" 
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        Create Your First Workflow
                    </button>
                </div>
            )}

            {/* Create Workflow Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-start justify-center overflow-y-auto py-8 z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[min(90dvh,90vh)] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold">Create New Workflow</h3>
                                <button type="button" 
                                    onClick={() => setShowCreateModal(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Workflow Details */}
                            <div className="space-y-4">
                                <h4 className="text-lg font-semibold text-gray-900">Workflow Details</h4>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Workflow Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={newWorkflow.title}
                                        onChange={(e) => setNewWorkflow({...newWorkflow, title: e.target.value})}
                                        placeholder="e.g., Design Approval Process"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Description
                                    </label>
                                    <textarea
                                        value={newWorkflow.description}
                                        onChange={(e) => setNewWorkflow({...newWorkflow, description: e.target.value})}
                                        placeholder="Optional description of the workflow..."
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            {/* Workflow Steps */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-lg font-semibold text-gray-900">Workflow Steps</h4>
                                    <button
                                        type="button"
                                        onClick={addWorkflowStep}
                                        className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                                    >
                                        + Add Step
                                    </button>
                                </div>

                                {projectTeamMembers.length === 0 && (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                        <div className="flex items-center">
                                            <Icon path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" className="w-5 h-5 text-yellow-600 mr-2" />
                                            <div>
                                                <h5 className="text-sm font-medium text-yellow-800">No Team Members Available</h5>
                                                <p className="text-sm text-yellow-700 mt-1">
                                                    Add team members to this project in the Contacts section before assigning workflow steps.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {workflowSteps.map((step, index) => (
                                    <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-gray-700">Step {step.step_order}</span>
                                            {workflowSteps.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeWorkflowStep(index)}
                                                    className="text-red-600 hover:text-red-800"
                                                >
                                                    <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Task Description *
                                            </label>
                                            <input
                                                type="text"
                                                value={step.description}
                                                onChange={(e) => updateWorkflowStep(index, 'description', e.target.value)}
                                                placeholder="e.g., Review and approve design"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Assign to Team Member
                                                </label>
                                                <select
                                                    value={step.assigned_to_contact_id || ''}
                                                    onChange={(e) => updateWorkflowStep(index, 'assigned_to_contact_id', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="">Unassigned</option>
                                                    {projectTeamMembers.map(contact => (
                                                        <option key={contact.id} value={contact.id}>
                                                            {contact.name} ({contact.role})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Selected Member Info
                                                </label>
                                                <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                                                    {step.assigned_to_name ? (
                                                        <div>
                                                            <div className="font-medium">{step.assigned_to_name}</div>
                                                            <div className="text-xs text-gray-500">{step.assigned_to_role}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400">No member selected</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button type="button"
                                onClick={handleCreateWorkflow}
                                disabled={isCreating}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {isCreating ? 'Creating...' : 'Create Workflow'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Workflow;

