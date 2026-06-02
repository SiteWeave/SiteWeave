import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getLocalizedEventCategoryName } from '@siteweave/i18n';

const DEFAULT_CATEGORY_SPECS = [
    { id: 'meeting', color: '#3B82F6' },
    { id: 'work', color: '#F59E0B' },
    { id: 'personal', color: '#10B981' },
    { id: 'deadline', color: '#EF4444' },
    { id: 'other', color: '#8B5CF6' },
];

function CategoryColorManager({ isOpen, onClose }) {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const defaultCategories = useMemo(
        () => DEFAULT_CATEGORY_SPECS.map((spec) => ({
            ...spec,
            name: getLocalizedEventCategoryName(spec, t),
        })),
        [t]
    );
    const [categories, setCategories] = useState(defaultCategories);
    const [editingCategory, setEditingCategory] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadCategories();
        }
    }, [isOpen, t]);

    const loadCategories = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('event_categories')
                .select('*')
                .order('name');

            if (error) {
                console.error('Error loading categories:', error);
                setCategories(defaultCategories);
            } else {
                const dbCategoryIds = new Set((data || []).map((cat) => cat.id));
                const mergedCategories = [
                    ...(data || []),
                    ...defaultCategories.filter((cat) => !dbCategoryIds.has(cat.id)),
                ];
                setCategories(mergedCategories.length > 0 ? mergedCategories : defaultCategories);
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            setCategories(defaultCategories);
        }
    };

    const handleColorChange = async (categoryId, newColor) => {
        setIsLoading(true);
        try {
            const category = categories.find((cat) => cat.id === categoryId);
            if (!category) return;

            const { data: existingCategory } = await supabaseClient
                .from('event_categories')
                .select('id')
                .eq('id', categoryId)
                .maybeSingle();

            let error;
            let success = false;
            if (existingCategory) {
                const { data: updatedData, error: updateError } = await supabaseClient
                    .from('event_categories')
                    .update({ color: newColor, updated_at: new Date().toISOString() })
                    .eq('id', categoryId)
                    .select();

                error = updateError;
                if (!error && updatedData && updatedData.length > 0) {
                    success = true;
                } else if (!error && (!updatedData || updatedData.length === 0)) {
                    error = {
                        message: 'Update was blocked. Only administrators can update categories.',
                        code: 'PGRST406',
                    };
                }
            } else {
                const { data: insertedData, error: insertError } = await supabaseClient
                    .from('event_categories')
                    .insert({ id: categoryId, name: category.name, color: newColor })
                    .select()
                    .maybeSingle();
                error = insertError;
                success = !error && insertedData;
            }

            if (error) {
                console.error('Error updating category color:', error);
                const isRLSError = error.code === 'PGRST406'
                    || error.status === 406
                    || error.statusCode === 406
                    || error.message?.includes('row-level security')
                    || error.message?.includes('RLS')
                    || error.message?.includes('blocked')
                    || error.message?.includes('Not Acceptable');
                if (isRLSError) {
                    addToast(t('calendar.admin_only_update'), 'error');
                } else {
                    addToast(t('calendar.color_update_error', { message: error.message || t('common.error') }), 'error');
                }
            } else if (success) {
                await loadCategories();
                addToast(t('calendar.color_updated'), 'success');
            } else {
                await loadCategories();
                addToast(t('calendar.color_updated'), 'success');
            }
        } catch (error) {
            addToast(t('calendar.color_update_error', { message: error.message }), 'error');
        }
        setIsLoading(false);
    };

    const handleNameChange = async (categoryId, newName) => {
        if (!newName.trim()) return;

        setIsLoading(true);
        try {
            const category = categories.find((cat) => cat.id === categoryId);
            if (!category) return;

            const { data: existingCategory } = await supabaseClient
                .from('event_categories')
                .select('id')
                .eq('id', categoryId)
                .maybeSingle();

            let error;
            let success = false;
            if (existingCategory) {
                const { data: updatedData, error: updateError } = await supabaseClient
                    .from('event_categories')
                    .update({ name: newName.trim(), updated_at: new Date().toISOString() })
                    .eq('id', categoryId)
                    .select();

                error = updateError;
                if (!error && updatedData && updatedData.length > 0) {
                    success = true;
                } else if (!error && (!updatedData || updatedData.length === 0)) {
                    error = {
                        message: 'Update was blocked. Only administrators can update categories.',
                        code: 'PGRST406',
                    };
                }
            } else {
                const { data: insertedData, error: insertError } = await supabaseClient
                    .from('event_categories')
                    .insert({ id: categoryId, name: newName.trim(), color: category.color })
                    .select()
                    .maybeSingle();
                error = insertError;
                success = !error && insertedData;
            }

            if (error) {
                console.error('Error updating category name:', error);
                const isRLSError = error.code === 'PGRST406'
                    || error.status === 406
                    || error.statusCode === 406
                    || error.message?.includes('row-level security')
                    || error.message?.includes('RLS')
                    || error.message?.includes('blocked')
                    || error.message?.includes('Not Acceptable');
                if (isRLSError) {
                    addToast(t('calendar.admin_only_update'), 'error');
                } else {
                    addToast(t('calendar.name_update_error', { message: error.message || t('common.error') }), 'error');
                }
            } else if (success) {
                await loadCategories();
                addToast(t('calendar.name_updated'), 'success');
            } else {
                await loadCategories();
                addToast(t('calendar.name_updated'), 'success');
            }
        } catch (error) {
            addToast(t('calendar.name_update_error', { message: error.message }), 'error');
        }
        setIsLoading(false);
    };

    const handleAddCategory = async () => {
        const newCategory = {
            id: `category_${Date.now()}`,
            name: t('calendar.new_category'),
            color: '#6B7280',
        };

        setIsLoading(true);
        try {
            const { data, error } = await supabaseClient
                .from('event_categories')
                .insert(newCategory)
                .select()
                .single();

            if (error) {
                if (error.message?.includes('row-level security') || error.message?.includes('RLS')) {
                    addToast(t('calendar.admin_only_create'), 'error');
                } else {
                    addToast(t('calendar.add_category_error', { message: error.message }), 'error');
                }
            } else if (data) {
                await loadCategories();
                addToast(t('calendar.category_added'), 'success');
            }
        } catch (error) {
            if (error.message?.includes('row-level security') || error.message?.includes('RLS')) {
                addToast(t('calendar.admin_only_create'), 'error');
            } else {
                addToast(t('calendar.add_category_error', { message: error.message }), 'error');
            }
        }
        setIsLoading(false);
    };

    const handleDeleteCategory = async (categoryId) => {
        if (categories.length <= 1) {
            addToast(t('calendar.cannot_delete_last'), 'error');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabaseClient
                .from('event_categories')
                .delete()
                .eq('id', categoryId);

            if (error) {
                addToast(t('calendar.delete_category_error', { message: error.message }), 'error');
            } else {
                setCategories((prev) => prev.filter((cat) => cat.id !== categoryId));
                addToast(t('calendar.category_deleted'), 'success');
            }
        } catch (error) {
            addToast(t('calendar.delete_category_error', { message: error.message }), 'error');
        }
        setIsLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">{t('calendar.category_manager_title')}</h2>
                    <button type="button"
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                        aria-label={t('common.close')}
                    >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-2">
                        {categories.map((category) => (
                            <div key={category.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                                <div className="flex-shrink-0">
                                    <input
                                        type="color"
                                        value={category.color}
                                        onChange={(e) => handleColorChange(category.id, e.target.value)}
                                        className="w-8 h-8 rounded-lg border border-gray-300 cursor-pointer hover:scale-105 transition-transform"
                                        disabled={isLoading}
                                        title={t('calendar.change_color')}
                                    />
                                </div>

                                <div className="flex-1 min-w-0">
                                    {editingCategory === category.id ? (
                                        <input
                                            type="text"
                                            value={category.name}
                                            onChange={(e) => {
                                                const updatedCategories = categories.map((cat) =>
                                                    cat.id === category.id ? { ...cat, name: e.target.value } : cat
                                                );
                                                setCategories(updatedCategories);
                                            }}
                                            onBlur={() => {
                                                handleNameChange(category.id, category.name);
                                                setEditingCategory(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleNameChange(category.id, category.name);
                                                    setEditingCategory(null);
                                                }
                                                if (e.key === 'Escape') {
                                                    setEditingCategory(null);
                                                }
                                            }}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            autoFocus
                                        />
                                    ) : (
                                        <button type="button"
                                            onClick={() => setEditingCategory(category.id)}
                                            className="text-left w-full px-2 py-1 text-sm font-medium text-gray-900 hover:bg-gray-100 rounded transition-colors"
                                        >
                                            {getLocalizedEventCategoryName(category, t)}
                                        </button>
                                    )}
                                </div>

                                <div className="flex-shrink-0">
                                    <button type="button"
                                        onClick={() => handleDeleteCategory(category.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        disabled={isLoading || categories.length <= 1}
                                        title={t('calendar.delete_category')}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                    <button type="button"
                        onClick={handleAddCategory}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                        disabled={isLoading}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        {t('calendar.add_category')}
                    </button>
                    <button type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        {t('common.done')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CategoryColorManager;
