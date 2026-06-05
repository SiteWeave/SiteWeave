import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { submitUserFeedback } from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';
import Icon from './Icon';
import packageJson from '../config/version.js';

async function resolveAppVersion() {
    if (window.electronAPI?.getAppVersion) {
        try {
            const version = await window.electronAPI.getAppVersion();
            if (version) return version;
        } catch {
            // fall through to package.json
        }
    }
    return packageJson.version;
}

function resolvePlatform() {
    return typeof window !== 'undefined' && window.electronAPI ? 'electron' : 'web';
}

function FeedbackModal({ isOpen, onClose }) {
    const { t } = useTranslation();
    const { state } = useAppContext();
    const { addToast } = useToast();
    const [feedbackType, setFeedbackType] = useState('bug');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!subject.trim() || !message.trim()) {
            addToast(t('settings.feedback_fill_required'), 'error');
            return;
        }

        setIsSubmitting(true);

        try {
            await submitUserFeedback(supabaseClient, {
                user: state.user,
                feedbackType,
                subject,
                message,
                appVersion: await resolveAppVersion(),
                platform: resolvePlatform(),
            });

            addToast(t('settings.feedback_thanks'), 'success');

            setSubject('');
            setMessage('');
            setFeedbackType('bug');
            onClose();
        } catch (error) {
            console.error('Error submitting feedback:', error);
            addToast(
                t('settings.feedback_submit_error', {
                    message: error.message || t('common.error'),
                }),
                'error'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setSubject('');
            setMessage('');
            setFeedbackType('bug');
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
        >
            <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 id="feedback-modal-title" className="text-2xl font-bold text-gray-900">
                        {t('settings.send_feedback')}
                    </h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        aria-label={t('common.close')}
                    >
                        <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
                    </button>
                </div>

                <p className="text-sm text-gray-600 mb-6">{t('settings.feedback_description')}</p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('settings.feedback_type_label')}
                        </label>
                        <div className="flex gap-4">
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="bug"
                                    checked={feedbackType === 'bug'}
                                    onChange={(e) => setFeedbackType(e.target.value)}
                                    className="mr-2"
                                    disabled={isSubmitting}
                                />
                                <span className="text-sm text-gray-700">{t('settings.feedback_type_bug')}</span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="feature"
                                    checked={feedbackType === 'feature'}
                                    onChange={(e) => setFeedbackType(e.target.value)}
                                    className="mr-2"
                                    disabled={isSubmitting}
                                />
                                <span className="text-sm text-gray-700">{t('settings.feedback_type_feature')}</span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="general"
                                    checked={feedbackType === 'general'}
                                    onChange={(e) => setFeedbackType(e.target.value)}
                                    className="mr-2"
                                    disabled={isSubmitting}
                                />
                                <span className="text-sm text-gray-700">{t('settings.feedback_type_general')}</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('settings.feedback_subject')} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder={t('settings.feedback_subject_placeholder')}
                            required
                            disabled={isSubmitting}
                            maxLength={200}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('settings.feedback_message')} <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder={t('settings.feedback_message_placeholder')}
                            rows={8}
                            required
                            disabled={isSubmitting}
                            maxLength={2000}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {t('settings.feedback_char_count', { count: message.length })}
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid="feedback-cancel"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !subject.trim() || !message.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            data-testid="feedback-submit"
                        >
                            {isSubmitting ? (
                                <>
                                    <LoadingSpinner size="sm" text="" />
                                    {t('settings.feedback_submitting')}
                                </>
                            ) : (
                                <>
                                    <Icon path="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" className="w-4 h-4" />
                                    {t('settings.send_feedback')}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default FeedbackModal;
