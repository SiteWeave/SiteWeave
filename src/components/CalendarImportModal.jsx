import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';
import { startGoogleCalendarOAuth, startOutlookCalendarOAuth, prepareCalendarEventsForInsert, filterNewCalendarImports } from '../utils/calendarIntegration';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

const CalendarImportModal = ({ onClose, importType = 'file' }) => {
    const { t, i18n } = useTranslation();
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();
    const [isImporting, setIsImporting] = useState(false);
    const [importedEvents, setImportedEvents] = useState([]);
    const [showPreview, setShowPreview] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const text = await file.text();
            const events = parseICSFile(text);
            setImportedEvents(events);
            setShowPreview(true);
            addToast(t('calendar.import_found_events', { count: events.length }), 'success');
        } catch (error) {
            console.error('Error parsing file:', error);
            addToast(t('calendar.import_parse_error'), 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const parseICSFile = (icsContent) => {
        const events = [];
        const lines = icsContent.split('\n');
        let currentEvent = {};
        let inEvent = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line === 'BEGIN:VEVENT') {
                inEvent = true;
                currentEvent = {};
            } else if (line === 'END:VEVENT' && inEvent) {
                if (currentEvent.title && currentEvent.start) {
                    events.push({
                        title: currentEvent.title,
                        description: currentEvent.description || '',
                        start_time: currentEvent.start,
                        end_time: currentEvent.end || currentEvent.start,
                        location: currentEvent.location || '',
                        attendees: currentEvent.attendees || '',
                        category: 'other',
                        color: '#6B7280',
                        is_all_day: currentEvent.isAllDay || false
                    });
                }
                inEvent = false;
            } else if (inEvent) {
                const [key, ...valueParts] = line.split(':');
                const value = valueParts.join(':');
                
                switch (key) {
                    case 'SUMMARY':
                        currentEvent.title = value;
                        break;
                    case 'DESCRIPTION':
                        currentEvent.description = value;
                        break;
                    case 'DTSTART':
                        currentEvent.start = parseICSDate(value);
                        currentEvent.isAllDay = value.length === 8; // YYYYMMDD format
                        break;
                    case 'DTEND':
                        currentEvent.end = parseICSDate(value);
                        break;
                    case 'LOCATION':
                        currentEvent.location = value;
                        break;
                    case 'ATTENDEE':
                        if (!currentEvent.attendees) currentEvent.attendees = '';
                        currentEvent.attendees += (currentEvent.attendees ? ', ' : '') + value;
                        break;
                }
            }
        }

        return events;
    };

    const parseICSDate = (dateString) => {
        // Handle both YYYYMMDD and YYYYMMDDTHHMMSSZ formats
        if (dateString.length === 8) {
            // All-day event: YYYYMMDD
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            return `${year}-${month}-${day}T09:00:00`;
        } else if (dateString.length >= 15) {
            // Timed event: YYYYMMDDTHHMMSSZ
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            const hour = dateString.substring(9, 11);
            const minute = dateString.substring(11, 13);
            const second = dateString.substring(13, 15);
            return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        }
        return new Date().toISOString();
    };

    const handleGoogleCalendarImport = async () => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

        if (!clientId) {
            addToast(t('calendar.import_failed', { message: 'Google Calendar integration not configured. Please contact administrator.' }), 'error');
            return;
        }

        // Desktop: use loopback OAuth (same as Outlook) so redirect does not open a separate browser
        // context at localhost without the app's Supabase session.
        if (window.electronAPI?.isElectron) {
            const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
            if (!clientSecret) {
                addToast(t('calendar.import_failed', {
                    message: 'Google Calendar desktop import requires VITE_GOOGLE_CLIENT_SECRET. Add it to your .env and register http://127.0.0.1:5000/google-callback in Google Cloud Console.',
                }), 'error');
                return;
            }
            setIsImporting(true);
            try {
                const events = await startGoogleCalendarOAuth();
                if (!state?.user?.id) {
                    addToast(t('calendar.import_failed', { message: 'Please sign in before importing Google events.' }), 'error');
                    return;
                }
                if (events && events.length > 0) {
                    const newEvents = await filterNewCalendarImports(supabaseClient, events, state.user.id);
                    if (!newEvents.length) {
                        addToast(t('calendar.no_events_to_import'), 'info');
                        onClose();
                        return;
                    }
                    const prepared = prepareCalendarEventsForInsert(newEvents, state.user.id);
                    const { data, error } = await supabaseClient
                        .from('calendar_events')
                        .insert(prepared)
                        .select();

                    if (error) throw error;

                    data.forEach((event) => {
                        dispatch({ type: 'ADD_EVENT', payload: event });
                    });

                    addToast(t('calendar.import_success', { count: data.length }), 'success');
                    onClose();
                } else {
                    addToast(t('calendar.no_events_to_import'), 'info');
                }
            } catch (e) {
                console.error('Google import failed:', e);
                addToast(t('calendar.import_failed', { message: e.message }), 'error');
            } finally {
                setIsImporting(false);
            }
            return;
        }

        localStorage.setItem('oauth_state', 'google');

        const scope = 'https://www.googleapis.com/auth/calendar.readonly';
        const redirectUri = window.location.origin + '/calendar';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&access_type=offline&prompt=consent`;

        window.open(authUrl, '_blank', 'width=500,height=600');
        addToast(t('calendar.import_error', { message: 'Please complete the Google Calendar authorization in the popup window.' }), 'info');
    };

    const handleOutlookCalendarImport = async () => {
        // If running in Electron, use loopback OAuth and import directly
        if (window.electronAPI?.isElectron) {
            setIsImporting(true);
            try {
                const events = await startOutlookCalendarOAuth();
                if (!state?.user?.id) {
                    addToast(t('calendar.import_failed', { message: 'Please sign in before importing Outlook events.' }), 'error');
                    setIsImporting(false);
                    return;
                }

                if (events && events.length > 0) {
                    const prepared = prepareCalendarEventsForInsert(events, state.user.id);
                    const { data, error } = await supabaseClient
                        .from('calendar_events')
                        .insert(prepared)
                        .select();

                    if (error) throw error;

                    data.forEach(event => {
                        dispatch({ type: 'ADD_EVENT', payload: event });
                    });

                    addToast(t('calendar.import_success', { count: data.length }), 'success');
                    onClose();
                } else {
                    addToast(t('calendar.no_events_to_import'), 'info');
                }
            } catch (e) {
                console.error('Outlook import failed:', e);
                addToast(t('calendar.import_failed', { message: e.message }), 'error');
            } finally {
                setIsImporting(false);
            }
            return;
        }

        // Browser fallback: redirect to web OAuth flow (Calendar route)
        const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
        if (!clientId) {
            addToast(t('calendar.import_failed', { message: 'Outlook integration not configured. Missing VITE_MICROSOFT_CLIENT_ID.' }), 'error');
            return;
        }

        localStorage.setItem('oauth_state', 'outlook');
        const scope = 'https://graph.microsoft.com/Calendars.Read';
        const redirectUri = window.location.origin + '/calendar';
        const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_mode=query&prompt=consent`;
        window.location.href = authUrl;
    };

    const handleImportEvents = async () => {
        if (importedEvents.length === 0) return;

        setIsImporting(true);
        try {
            const { data, error } = await supabaseClient
                .from('calendar_events')
                .insert(importedEvents)
                .select();

            if (error) {
                throw error;
            }

            // Add events to context
            data.forEach(event => {
                dispatch({ type: 'ADD_EVENT', payload: event });
            });

            addToast(t('calendar.import_success', { count: data.length }), 'success');
            onClose();
        } catch (error) {
            console.error('Error importing events:', error);
            addToast(t('calendar.import_failed', { message: error.message }), 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleCancelPreview = () => {
        setShowPreview(false);
        setImportedEvents([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className={`bg-white rounded-lg shadow-2xl p-8 w-full max-w-2xl ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">
                        {importType === 'google' ? t('calendar.import_google') : 
                         importType === 'outlook' ? t('calendar.import_outlook') : 
                         t('calendar.import_file_title')}
                    </h2>
                    <button type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                        ×
                    </button>
                </div>

                {!showPreview ? (
                    <div className="space-y-6">
                        {importType === 'file' && (
                            <div>
                                <h3 className="text-lg font-semibold mb-4">{t('calendar.import_file_title')}</h3>
                                <div className="space-y-4">
                                    {/* File Import */}
                                    <div className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-semibold">{t('calendar.import_select_file')}</h4>
                                                <p className="text-sm text-gray-600">{t('calendar.import_select_file')}</p>
                                            </div>
                                            <button type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isImporting}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {t('calendar.import_select_file')}
                                            </button>
                                        </div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".ics,.csv"
                                            onChange={handleFileImport}
                                            className="hidden"
                                        />
                                    </div>

                                    {/* Google Calendar */}
                                    <div className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-semibold">{t('calendar.import_google')}</h4>
                                                <p className="text-sm text-gray-600">{t('calendar.import_connect_google')}</p>
                                            </div>
                                            <button type="button"
                                                onClick={handleGoogleCalendarImport}
                                                disabled={isImporting}
                                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                            >
                                                {t('calendar.import_connect_google')}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Outlook Calendar */}
                                    <div className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-semibold">{t('calendar.import_outlook')}</h4>
                                                <p className="text-sm text-gray-600">{t('calendar.import_connect_outlook')}</p>
                                            </div>
                                            <button type="button"
                                                onClick={handleOutlookCalendarImport}
                                                disabled={isImporting}
                                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                                            >
                                                {t('calendar.import_connect_outlook')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {importType === 'google' && (
                            <div className="text-center py-8">
                                <div className="mb-6">
                                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                        </svg>
                                    </div>
                                    <h3 className="text-xl font-semibold mb-2">{t('calendar.import_connect_google')}</h3>
                                    <p className="text-gray-600 mb-6">
                                        {t('calendar.import_google')}
                                    </p>
                                </div>
                                <button type="button"
                                    onClick={handleGoogleCalendarImport}
                                    disabled={isImporting}
                                    className="px-8 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-lg font-semibold"
                                >
                                    {isImporting ? t('calendar.importing') : t('calendar.import_connect_google')}
                                </button>
                            </div>
                        )}

                        {importType === 'outlook' && (
                            <div className="text-center py-8">
                                <div className="mb-6">
                                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 9h-5.5v12H22V9z"/>
                                        </svg>
                                    </div>
                                    <h3 className="text-xl font-semibold mb-2">{t('calendar.import_connect_outlook')}</h3>
                                    <p className="text-gray-600 mb-6">
                                        {t('calendar.import_outlook')}
                                    </p>
                                    
                                </div>
                                <button type="button"
                                    onClick={handleOutlookCalendarImport}
                                    disabled={isImporting}
                                    className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-lg font-semibold"
                                >
                                    {isImporting ? t('calendar.importing') : t('calendar.import_connect_outlook')}
                                </button>
                            </div>
                        )}

                        {isImporting && (
                            <div className="flex items-center justify-center py-8">
                                <LoadingSpinner size="lg" text={t('calendar.importing')} />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold mb-4">{t('calendar.import_preview_title')} ({importedEvents.length})</h3>
                            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                                {importedEvents.map((event, index) => (
                                    <div key={index} className="p-3 border-b border-gray-100 last:border-b-0">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-sm">{event.title}</h4>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    {new Date(event.start_time).toLocaleDateString(i18n.language)} - {new Date(event.end_time).toLocaleDateString(i18n.language)}
                                                </p>
                                                {event.location && (
                                                    <p className="text-xs text-gray-500 mt-1">📍 {event.location}</p>
                                                )}
                                            </div>
                                            <div 
                                                className="w-3 h-3 rounded-full mt-1"
                                                style={{ backgroundColor: event.color }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-4 pt-4 border-t">
                            <button type="button"
                                onClick={handleCancelPreview}
                                disabled={isImporting}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                            >
                                {t('common.cancel')}
                            </button>
                            <button type="button"
                                onClick={handleImportEvents}
                                disabled={isImporting}
                                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isImporting ? (
                                    <>
                                        <LoadingSpinner size="sm" text="" />
                                        {t('calendar.importing')}
                                    </>
                                ) : (
                                    t('calendar.import_confirm', { count: importedEvents.length })
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </ModalOverlay>
    );
};

export default CalendarImportModal;
