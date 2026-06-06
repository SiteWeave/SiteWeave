import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useAppContext, useLazyDataLoader, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { 
    parseOAuthCallback, 
    clearOAuthParams, 
    handleGoogleCalendarCallback, 
    handleOutlookCalendarCallback, 
    prepareCalendarEventsForInsert,
    filterNewCalendarImports,
    createGoogleCalendarEvent,
    createOutlookCalendarEvent,
    updateGoogleCalendarEvent,
    updateOutlookCalendarEvent,
    deleteGoogleCalendarEvent,
    deleteOutlookCalendarEvent,
    storeCalendarToken,
    getStoredCalendarToken
} from '../utils/calendarIntegration';
import { generateRecurringInstances } from '../utils/recurrenceService';
import { sendCalendarInvitationEmail } from '../utils/emailNotifications';
import EventModal from '../components/EventModal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import CalendarImportModal from '../components/CalendarImportModal';
import CategoryColorManager from '../components/CategoryColorManager';
import WeatherWidget from '../components/WeatherWidget';
import { getExtendedWeatherForecast, getWeatherIconUrl } from '../utils/weatherService';

const WEATHER_CITY_STORAGE_KEY = 'weather_location_preference';
const WEATHER_PREF_EVENT = 'weather-preference-changed';

const DEFAULT_CATEGORY_SPECS = [
    { id: 'meeting', color: '#3B82F6' },
    { id: 'work', color: '#F59E0B' },
    { id: 'personal', color: '#10B981' },
    { id: 'deadline', color: '#EF4444' },
    { id: 'other', color: '#8B5CF6' }
];

const CATEGORY_LABEL_KEYS = {
    meeting: 'calendar.category_meeting',
    work: 'calendar.category_work',
    personal: 'calendar.category_personal',
    deadline: 'calendar.category_deadline',
    other: 'calendar.category_other'
};

function localizeCategory(category, t) {
    const labelKey = CATEGORY_LABEL_KEYS[category?.id];
    return {
        ...category,
        name: labelKey ? t(labelKey) : category.name
    };
}

/** Recurring instances use composite FullCalendar ids; DB + clicks need the parent `calendar_events` id. */
function resolveCalendarDbEventId(fcEvent) {
    const ext = fcEvent.extendedProps || {};
    if (ext.parent_event_id != null && ext.parent_event_id !== '') {
        return ext.parent_event_id;
    }
    return fcEvent.id;
}

/** FullCalendar day navigation is most reliable with a local YYYY-MM-DD string. */
function formatLocalDateForCalendar(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


// --- Mini Calendar Component (Sidebar) ---
function MiniCalendar({ currentDate, setCurrentDate }) {
    const { i18n } = useTranslation();
    // Normalize today to midnight local time to avoid timezone issues
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        firstDayOfMonth.setHours(0, 0, 0, 0);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        lastDayOfMonth.setHours(0, 0, 0, 0);
        
        let days = [];
        // Add days from previous month to fill the first week
        for (let i = firstDayOfMonth.getDay(); i > 0; i--) {
            const day = new Date(year, month, 1 - i);
            day.setHours(0, 0, 0, 0);
            days.push(day);
        }
        // Add days of the current month
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const day = new Date(year, month, i);
            day.setHours(0, 0, 0, 0);
            days.push(day);
        }
        // Add days from next month to fill the grid
        while (days.length < 42) { // Ensure 6 rows
            const lastDay = days[days.length - 1];
            const nextDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
            nextDay.setHours(0, 0, 0, 0);
            days.push(nextDay);
        }
        return days;
    };

    const days = getDaysInMonth(currentDate);

    const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-4">
                <button type="button" onClick={handlePrevMonth} className="p-1 rounded-full hover:bg-gray-100">&lt;</button>
                <span className="font-semibold text-sm">{currentDate.toLocaleString(i18n.language, { month: 'long', year: 'numeric' })}</span>
                <button type="button" onClick={handleNextMonth} className="p-1 rounded-full hover:bg-gray-100">&gt;</button>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-gray-500 mb-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div key={`day-${index}`}>{day}</div>)}
            </div>
            <div className="grid grid-cols-7 text-center text-sm">
                {days.map((day, index) => {
                    // Normalize day to midnight for accurate comparison
                    const normalizedDay = new Date(day);
                    normalizedDay.setHours(0, 0, 0, 0);
                    const normalizedCurrentDate = new Date(currentDate);
                    normalizedCurrentDate.setHours(0, 0, 0, 0);
                    
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                    const isSelected = normalizedDay.getTime() === normalizedCurrentDate.getTime();
                    const isToday = normalizedDay.getTime() === today.getTime();
                    return (
                        <button type="button" 
                            key={index} 
                            onClick={() => setCurrentDate(day)}
                            className={`py-1 rounded-full ${isCurrentMonth ? 'text-gray-700' : 'text-gray-300'} ${
                                isSelected 
                                    ? 'bg-blue-100 text-blue-800 font-bold' 
                                    : isToday 
                                        ? 'bg-blue-200 text-blue-800 font-semibold' 
                                        : 'hover:bg-gray-100'
                            }`}
                        >
                            {day.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}


// --- Main Calendar View Component ---
function CalendarView() {
    const { t, i18n } = useTranslation();
    const { state, dispatch } = useAppContext();
    const { loadCalendarEventsIfNeeded } = useLazyDataLoader();
    const { addToast } = useToast();

    const calendarEvents = state.calendarEvents || [];
    const contacts = state.contacts || [];
    const projects = state.projects || [];

    const [showModal, setShowModal] = useState(false);
    const [modalDate, setModalDate] = useState(null);
    const [editingEvent, setEditingEvent] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isCreatingEvent, setIsCreatingEvent] = useState(false);
    const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);
    const [isDeletingEvent, setIsDeletingEvent] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [eventToDelete, setEventToDelete] = useState(null);
    const [showGoogleImportModal, setShowGoogleImportModal] = useState(false);
    const [showOutlookImportModal, setShowOutlookImportModal] = useState(false);
    const [currentView, setCurrentView] = useState('timeGridWeek');
    const calendarRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [categories, setCategories] = useState([]);
    const [visibleCategories, setVisibleCategories] = useState(new Set());
    const [weatherForecast, setWeatherForecast] = useState({});
    const [weatherCity, setWeatherCity] = useState(null);

    const displayCategories = useMemo(
        () => categories.map((category) => localizeCategory(category, t)),
        [categories, t]
    );

    useEffect(() => {
        loadCategories();
        loadCalendarEventsIfNeeded(currentDate);
    }, []);

    useEffect(() => {
        loadCalendarEventsIfNeeded(currentDate);
    }, [currentDate.getFullYear(), currentDate.getMonth()]);

    // Sync visible categories when categories list changes (e.g., after adding new categories)
    useEffect(() => {
        if (categories.length > 0) {
            setVisibleCategories(prev => {
                const newSet = new Set(prev);
                // Add any new categories that aren't in the visible set
                categories.forEach(cat => {
                    if (!newSet.has(cat.id)) {
                        newSet.add(cat.id);
                    }
                });
                // Remove any categories that no longer exist
                const categoryIds = new Set(categories.map(c => c.id));
                Array.from(newSet).forEach(id => {
                    if (!categoryIds.has(id)) {
                        newSet.delete(id);
                    }
                });
                return newSet;
            });
        }
    }, [categories]);

    // Load weather when view changes or date changes
    useEffect(() => {
        if (weatherCity) {
            loadWeatherForCalendar(weatherCity);
        }
    }, [currentView, currentDate]);

    // Listen for weather preference changes from WeatherWidget
    useEffect(() => {
        const handleWeatherPreferenceChange = (event) => {
            const nextCity = event?.detail?.city || null;
            const nextEnabled = event?.detail?.enabled;

            if (nextEnabled === false || !nextCity) {
                setWeatherCity(null);
                setWeatherForecast({});
                return;
            }

            if (nextCity !== weatherCity) {
                setWeatherCity(nextCity);
                loadWeatherForCalendar(nextCity);
            }
        };

        const handleStorageChange = (event) => {
            if (event.key && event.key !== WEATHER_CITY_STORAGE_KEY) {
                return;
            }
            const nextCity = localStorage.getItem(WEATHER_CITY_STORAGE_KEY);
            if (!nextCity) {
                setWeatherCity(null);
                setWeatherForecast({});
                return;
            }

            if (nextCity !== weatherCity) {
                setWeatherCity(nextCity);
                loadWeatherForCalendar(nextCity);
            }
        };

        window.addEventListener(WEATHER_PREF_EVENT, handleWeatherPreferenceChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener(WEATHER_PREF_EVENT, handleWeatherPreferenceChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [weatherCity]);

    const loadWeatherForCalendar = async (cityName) => {
        if (!cityName) {
            setWeatherCity(null);
            setWeatherForecast({});
            return;
        }

        try {
            const forecast = await getExtendedWeatherForecast(cityName, 14);
            setWeatherForecast(forecast || {});
        } catch (error) {
            console.error('Error loading weather for calendar:', error);
            setWeatherForecast({});
        }
    };

    const loadCategories = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('event_categories')
                .select('*')
                .order('name');

            if (error) {
                console.error('Error loading categories:', error);
                // Use default categories if table doesn't exist
                setCategories(DEFAULT_CATEGORY_SPECS);
                // Initialize all categories as visible
                setVisibleCategories(new Set(DEFAULT_CATEGORY_SPECS.map(c => c.id)));
            } else {
                const loadedCategories = data.length > 0 ? data : DEFAULT_CATEGORY_SPECS;
                setCategories(loadedCategories);
                // Initialize all categories as visible
                setVisibleCategories(new Set(loadedCategories.map(c => c.id)));
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            setCategories(DEFAULT_CATEGORY_SPECS);
            // Initialize all categories as visible
            setVisibleCategories(new Set(DEFAULT_CATEGORY_SPECS.map(c => c.id)));
        }
    };

    useEffect(() => {
        if (calendarRef.current) {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.gotoDate(formatLocalDateForCalendar(currentDate));
        }
    }, [currentDate]);

    // Handle OAuth callbacks
    useEffect(() => {
        const { code, error } = parseOAuthCallback();
        
        if (error) {
            addToast(t('calendar.oauth_error', { error }), 'error');
            clearOAuthParams();
            return;
        }

        if (code) {
            handleOAuthCallback(code);
        }
    }, []);

    const handleOAuthCallback = async (code) => {
        try {
            setIsImporting(true);
            let events = [];
            
            // Determine which service based on the current URL or stored state
            const oauthState = localStorage.getItem('oauth_state');
            
            if (oauthState === 'google') {
                events = await handleGoogleCalendarCallback(code);
            } else if (oauthState === 'outlook') {
                events = await handleOutlookCalendarCallback(code);
            } else {
                throw new Error('Unknown OAuth provider');
            }

            if (events.length > 0) {
                const userId = state.user?.id || null;
                const newEvents = userId
                    ? await filterNewCalendarImports(supabaseClient, events, userId)
                    : events;

                if (!newEvents.length) {
                    addToast(t('calendar.no_events_to_import'), 'info');
                    localStorage.removeItem('oauth_state');
                    clearOAuthParams();
                    return;
                }

                const prepared = prepareCalendarEventsForInsert(newEvents, userId);
                const { data, error } = await supabaseClient
                    .from('calendar_events')
                    .insert(prepared)
                    .select();

                if (error) {
                    throw error;
                }

                // Add events to context
                data.forEach(event => {
                    dispatch({ type: 'ADD_EVENT', payload: event });
                });

                addToast(t('calendar.imported_events', {
                    count: data.length,
                    provider: t(oauthState === 'google' ? 'calendar.provider_google' : 'calendar.provider_outlook')
                }), 'success');
            } else {
                addToast(t('calendar.no_events_to_import'), 'info');
            }

            // Clean up
            localStorage.removeItem('oauth_state');
            clearOAuthParams();
            
        } catch (error) {
            console.error('OAuth callback error:', error);
            addToast(t('calendar.import_error', { message: error.message }), 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const events = useMemo(() => {
        // Create category color map from loaded categories
        const categoryColors = categories.reduce((acc, category) => {
            acc[category.id] = category.color;
            return acc;
        }, {});

        // Recurring expansion window follows the calendar's focused month (sidebar / navigation), not only "today"
        const anchor = new Date(currentDate);
        const viewStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
        const viewEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 3, 0);

        const allEvents = [];

        calendarEvents.forEach(event => {
            // Determine event category (use existing or detect from title)
            let eventCategory = event.category || 'other';
            
            // Fallback to title-based category detection if no category
            if (!event.category) {
                const title = event.title.toLowerCase();
                if (title.includes('meeting') || title.includes('standup') || title.includes('call') || title.includes('team')) {
                    eventCategory = 'meeting';
                } else if (title.includes('deadline') || title.includes('due') || title.includes('urgent') || title.includes('review')) {
                    eventCategory = 'deadline';
                } else if (title.includes('personal') || title.includes('break') || title.includes('lunch') || title.includes('vacation')) {
                    eventCategory = 'personal';
                } else if (title.includes('work') || title.includes('project') || title.includes('task') || title.includes('planning')) {
                    eventCategory = 'work';
                }
            }
            
            // Filter: Skip events whose category is not visible
            if (!visibleCategories.has(eventCategory)) {
                return;
            }
            
            // Use category color, fallback to 'other' if category not found
            let eventColor = categoryColors[eventCategory] || categoryColors.other || '#8B5CF6';

            // Base event properties
            const baseEventProps = {
                id: event.id,
                title: event.title,
                backgroundColor: eventColor,
                borderColor: eventColor,
                allDay: event.is_all_day || false,
                className: `outlook-event`,
                extendedProps: {
                    project_id: event.project_id,
                    description: event.description,
                    category: event.category,
                    location: event.location,
                    attendees: event.attendees,
                    recurrence: event.recurrence,
                    color: eventColor
                }
            };

            // If recurring, generate instances
            if (event.recurrence) {
                try {
                    const instances = generateRecurringInstances(event, viewStart, viewEnd);
                    instances.forEach(instance => {
                        allEvents.push({
                            ...baseEventProps,
                            id: `${event.id}_${instance.start_time}`,
                            title: event.title,
                            start: instance.start_time,
                            end: instance.end_time,
                            editable: false,
                            extendedProps: {
                                ...baseEventProps.extendedProps,
                                is_recurring_instance: true,
                                parent_event_id: event.id
                            }
                        });
                    });
                } catch (error) {
                    console.error('Error generating recurring instances:', error);
                    // Fallback to single event if recurrence fails
                    allEvents.push({
                        ...baseEventProps,
                        start: event.start_time,
                        end: event.end_time
                    });
                }
            } else {
                // Non-recurring event
                allEvents.push({
                    ...baseEventProps,
                    start: event.start_time,
                    end: event.end_time
                });
            }
        });

        return allEvents;
    }, [calendarEvents, categories, visibleCategories, currentDate]);

    const handleDateClick = (arg) => {
        setModalDate(arg.date);
        setEditingEvent(null);
        setShowModal(true);
    };

    const handleEventClick = (arg) => {
        const dbId = resolveCalendarDbEventId(arg.event);
        const event = calendarEvents.find(e => String(e.id) === String(dbId));
        if (event) {
            setEditingEvent(event);
            setShowModal(true);
        }
    };

    const handleEventDrop = async (info) => {
        const eventId = resolveCalendarDbEventId(info.event);
        const newStart = info.event.start;
        const newEnd = info.event.end;
        
        try {
            const updateData = {
                start_time: newStart.toISOString(),
                end_time: newEnd ? newEnd.toISOString() : newStart.toISOString()
            };

            const { error } = await supabaseClient
                .from('calendar_events')
                .update(updateData)
                .eq('id', eventId);

            if (error) {
                throw error;
            }

            // Update local state
            const updatedEvent = calendarEvents.find(e => String(e.id) === String(eventId));
            if (updatedEvent) {
                const finalEvent = {
                    ...updatedEvent, 
                    start_time: updateData.start_time,
                    end_time: updateData.end_time
                };
                dispatch({ 
                    type: 'UPDATE_EVENT', 
                    payload: finalEvent
                });
                
                // Sync to external calendars if event is synced
                if (finalEvent.external_id) {
                    try {
                        if (finalEvent.external_source === 'google') {
                            const token = getStoredCalendarToken('google');
                            if (token) {
                                await updateGoogleCalendarEvent(finalEvent, finalEvent.external_id, token);
                            }
                        } else if (finalEvent.external_source === 'outlook') {
                            const token = getStoredCalendarToken('outlook');
                            if (token) {
                                await updateOutlookCalendarEvent(finalEvent, finalEvent.external_id, token);
                            }
                        }
                    } catch (syncError) {
                        console.error('Error syncing event drag to external calendar:', syncError);
                        // Don't show error toast for drag operations - just log it
                    }
                }
            }

            addToast(t('calendar.event_moved'), 'success');
        } catch (error) {
            addToast(t('calendar.event_move_error', { message: error.message }), 'error');
            // Revert the change
            info.revert();
        }
    };

    const handleEventResize = async (info) => {
        const eventId = resolveCalendarDbEventId(info.event);
        const newEnd = info.event.end;
        
        try {
            const updateData = {
                end_time: newEnd.toISOString()
            };

            const { error } = await supabaseClient
                .from('calendar_events')
                .update(updateData)
                .eq('id', eventId);

            if (error) {
                throw error;
            }

            // Update local state
            const updatedEvent = calendarEvents.find(e => String(e.id) === String(eventId));
            if (updatedEvent) {
                const finalEvent = {
                    ...updatedEvent, 
                    end_time: updateData.end_time
                };
                dispatch({ 
                    type: 'UPDATE_EVENT', 
                    payload: finalEvent
                });
                
                // Sync to external calendars if event is synced
                if (finalEvent.external_id) {
                    try {
                        if (finalEvent.external_source === 'google') {
                            const token = getStoredCalendarToken('google');
                            if (token) {
                                await updateGoogleCalendarEvent(finalEvent, finalEvent.external_id, token);
                            }
                        } else if (finalEvent.external_source === 'outlook') {
                            const token = getStoredCalendarToken('outlook');
                            if (token) {
                                await updateOutlookCalendarEvent(finalEvent, finalEvent.external_id, token);
                            }
                        }
                    } catch (syncError) {
                        console.error('Error syncing event resize to external calendar:', syncError);
                        // Don't show error toast for resize operations - just log it
                    }
                }
            }

            addToast(t('calendar.event_resized'), 'success');
        } catch (error) {
            addToast(t('calendar.event_resize_error', { message: error.message }), 'error');
            // Revert the change
            info.revert();
        }
    };

    const handleSaveEvent = async (eventData) => {
        const syncToGoogle = eventData.sync_to_google && getStoredCalendarToken('google');
        const syncToOutlook = eventData.sync_to_outlook && getStoredCalendarToken('outlook');
        
        // Get organizer name from user's contact
        const getUserName = async () => {
            if (!state.user) return t('calendar.team_member_fallback');
            
            // Try to find user's contact via profile
            try {
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('contact_id')
                    .eq('id', state.user?.id)
                    .maybeSingle();
                
                if (profile?.contact_id) {
                    const userContact = contacts.find(c => c.id === profile.contact_id);
                    if (userContact?.name) return userContact.name;
                }
            } catch (error) {
                console.warn('Error fetching user profile:', error);
            }
            
            // Fallback to email or default
            return state.user.email?.split('@')[0] || t('calendar.team_member_fallback');
        };
        const organizerName = await getUserName();
        
        if (editingEvent) {
            setIsUpdatingEvent(true);
            
            // Remove sync fields that don't exist in database schema
            const { sync_to_google, sync_to_outlook, ...dbEventData } = eventData;
            
            // Update in database first
            const { data: updatedEvent, error } = await supabaseClient
                .from('calendar_events')
                .update(dbEventData)
                .eq('id', eventData.id)
                .select()
                .single();
            
            if (error) {
                addToast(t('calendar.event_update_error', { message: error.message }), 'error');
                setIsUpdatingEvent(false);
                return;
            }
            
            // Sync to external calendars
            try {
                // Handle unsyncing (if user unchecks sync checkbox)
                if (!eventData.sync_to_google && updatedEvent.external_source === 'google') {
                    const token = getStoredCalendarToken('google');
                    if (token && updatedEvent.external_id) {
                        try {
                            await deleteGoogleCalendarEvent(updatedEvent.external_id, token);
                        } catch (delError) {
                            console.warn('Failed to delete from Google Calendar:', delError);
                        }
                    }
                    // Remove external sync info from database
                    const { data: unsynced } = await supabaseClient
                        .from('calendar_events')
                        .update({ external_id: null, external_source: null })
                        .eq('id', eventData.id)
                        .select()
                        .single();
                    if (unsynced) {
                        updatedEvent.external_id = null;
                        updatedEvent.external_source = null;
                    }
                }
                if (!eventData.sync_to_outlook && updatedEvent.external_source === 'outlook') {
                    const token = getStoredCalendarToken('outlook');
                    if (token && updatedEvent.external_id) {
                        try {
                            await deleteOutlookCalendarEvent(updatedEvent.external_id, token);
                        } catch (delError) {
                            console.warn('Failed to delete from Outlook Calendar:', delError);
                        }
                    }
                    // Remove external sync info from database
                    const { data: unsynced } = await supabaseClient
                        .from('calendar_events')
                        .update({ external_id: null, external_source: null })
                        .eq('id', eventData.id)
                        .select()
                        .single();
                    if (unsynced) {
                        updatedEvent.external_id = null;
                        updatedEvent.external_source = null;
                    }
                }

                // Update existing synced events
                if (syncToGoogle && updatedEvent.external_id && updatedEvent.external_source === 'google') {
                    const token = getStoredCalendarToken('google');
                    if (token) {
                        await updateGoogleCalendarEvent(eventData, updatedEvent.external_id, token);
                    }
                }
                if (syncToOutlook && updatedEvent.external_id && updatedEvent.external_source === 'outlook') {
                    const token = getStoredCalendarToken('outlook');
                    if (token) {
                        await updateOutlookCalendarEvent(eventData, updatedEvent.external_id, token);
                    }
                }
                
                // If enabling new sync, create in external calendar
                if (syncToGoogle && (!updatedEvent.external_id || updatedEvent.external_source !== 'google')) {
                    const token = getStoredCalendarToken('google');
                    if (!token) {
                        throw new Error('Google Calendar token not found. Please reconnect your calendar.');
                    }
                    const syncResult = await createGoogleCalendarEvent(eventData, token);
                    // Update event with external ID
                    const { error: updateError } = await supabaseClient
                        .from('calendar_events')
                        .update({ 
                            external_id: syncResult.external_id,
                            external_source: syncResult.external_source
                        })
                        .eq('id', eventData.id);
                    if (updateError) {
                        // Try to clean up external event if DB update fails
                        try {
                            await deleteGoogleCalendarEvent(syncResult.external_id, token);
                        } catch (cleanupError) {
                            console.error('Failed to clean up external event:', cleanupError);
                        }
                        throw new Error('Failed to save external calendar sync info: ' + updateError.message);
                    }
                    updatedEvent.external_id = syncResult.external_id;
                    updatedEvent.external_source = syncResult.external_source;
                }
                if (syncToOutlook && (!updatedEvent.external_id || updatedEvent.external_source !== 'outlook')) {
                    const token = getStoredCalendarToken('outlook');
                    if (!token) {
                        throw new Error('Outlook Calendar token not found. Please reconnect your calendar.');
                    }
                    const syncResult = await createOutlookCalendarEvent(eventData, token);
                    // Update event with external ID
                    const { error: updateError } = await supabaseClient
                        .from('calendar_events')
                        .update({ 
                            external_id: syncResult.external_id,
                            external_source: syncResult.external_source
                        })
                        .eq('id', eventData.id);
                    if (updateError) {
                        // Try to clean up external event if DB update fails
                        try {
                            await deleteOutlookCalendarEvent(syncResult.external_id, token);
                        } catch (cleanupError) {
                            console.error('Failed to clean up external event:', cleanupError);
                        }
                        throw new Error('Failed to save external calendar sync info: ' + updateError.message);
                    }
                    updatedEvent.external_id = syncResult.external_id;
                    updatedEvent.external_source = syncResult.external_source;
                }
            } catch (syncError) {
                console.error('Error syncing to external calendar:', syncError);
                addToast(t('calendar.event_saved_sync_failed', { message: syncError.message }), 'warning');
            }
            
            // Send invitation emails to attendees (only newly added ones for updates)
            if (eventData.attendees) {
                const newAttendeeEmails = eventData.attendees.split(',').map(e => e.trim()).filter(Boolean);
                const oldAttendeeEmails = editingEvent.attendees 
                    ? editingEvent.attendees.split(',').map(e => e.trim()).filter(Boolean)
                    : [];
                const newlyAddedAttendees = newAttendeeEmails.filter(email => !oldAttendeeEmails.includes(email));
                
                // Send emails to newly added attendees
                if (newlyAddedAttendees.length > 0) {
                    const emailPromises = newlyAddedAttendees.map(email => 
                        sendCalendarInvitationEmail(email, updatedEvent, organizerName)
                    );
                    try {
                        await Promise.allSettled(emailPromises);
                        // Don't show error toast for email failures - just log them
                        emailPromises.forEach((promise, index) => {
                            promise.catch(error => {
                                console.warn(`Failed to send invitation to ${newlyAddedAttendees[index]}:`, error);
                            });
                        });
                    } catch (error) {
                        console.error('Error sending invitation emails:', error);
                    }
                }
            }
            
            addToast(t('calendar.event_saved_synced'), 'success');
            dispatch({ type: 'UPDATE_EVENT', payload: updatedEvent });
            setShowModal(false);
            setEditingEvent(null);
            setIsUpdatingEvent(false);
        } else {
            setIsCreatingEvent(true);
            
            // Remove sync fields that don't exist in database schema
            const { sync_to_google, sync_to_outlook, ...dbEventData } = eventData;
            
            // Create in database first
            const { data: newEvent, error } = await supabaseClient
                .from('calendar_events')
                .insert({ ...dbEventData, user_id: state.user?.id || null })
                .select()
                .single();
            
            if (error) {
                addToast(t('calendar.event_update_error', { message: error.message }), 'error');
                setIsCreatingEvent(false);
                return;
            }
            
            // Sync to external calendars
            try {
                let finalEvent = { ...newEvent };
                
                if (syncToGoogle) {
                    const token = getStoredCalendarToken('google');
                    if (!token) {
                        throw new Error('Google Calendar token not found. Please reconnect your calendar.');
                    }
                    const syncResult = await createGoogleCalendarEvent(eventData, token);
                    // Update event with external ID
                    const { data: updated, error: updateError } = await supabaseClient
                        .from('calendar_events')
                        .update({ 
                            external_id: syncResult.external_id,
                            external_source: syncResult.external_source
                        })
                        .eq('id', newEvent.id)
                        .select()
                        .single();
                    if (updateError) {
                        // Try to clean up external event if DB update fails
                        try {
                            await deleteGoogleCalendarEvent(syncResult.external_id, token);
                        } catch (cleanupError) {
                            console.error('Failed to clean up external event:', cleanupError);
                        }
                        throw new Error('Failed to save external calendar sync info: ' + updateError.message);
                    }
                    if (updated) finalEvent = updated;
                }
                if (syncToOutlook) {
                    const token = getStoredCalendarToken('outlook');
                    if (!token) {
                        throw new Error('Outlook Calendar token not found. Please reconnect your calendar.');
                    }
                    const syncResult = await createOutlookCalendarEvent(eventData, token);
                    // Update event with external ID (overwrite if Google already set, or set if not)
                    const updateData = { 
                        external_id: syncResult.external_id,
                        external_source: syncResult.external_source
                    };
                    const { data: updated, error: updateError } = await supabaseClient
                        .from('calendar_events')
                        .update(updateData)
                        .eq('id', newEvent.id)
                        .select()
                        .single();
                    if (updateError) {
                        // Try to clean up external event if DB update fails
                        try {
                            await deleteOutlookCalendarEvent(syncResult.external_id, token);
                        } catch (cleanupError) {
                            console.error('Failed to clean up external event:', cleanupError);
                        }
                        throw new Error('Failed to save external calendar sync info: ' + updateError.message);
                    }
                    if (updated) finalEvent = updated;
                }
                
                dispatch({ type: 'ADD_EVENT', payload: finalEvent });
                addToast(t('calendar.event_saved_synced'), 'success');
            } catch (syncError) {
                console.error('Error syncing to external calendar:', syncError);
                dispatch({ type: 'ADD_EVENT', payload: newEvent });
                addToast(t('calendar.event_saved_sync_failed', { message: syncError.message }), 'warning');
            }
            
            // Send invitation emails to all attendees for new events
            if (eventData.attendees) {
                const attendeeEmails = eventData.attendees.split(',').map(e => e.trim()).filter(Boolean);
                if (attendeeEmails.length > 0) {
                    const emailPromises = attendeeEmails.map(email => 
                        sendCalendarInvitationEmail(email, newEvent, organizerName)
                    );
                    try {
                        await Promise.allSettled(emailPromises);
                        // Don't show error toast for email failures - just log them
                        emailPromises.forEach((promise, index) => {
                            promise.catch(error => {
                                console.warn(`Failed to send invitation to ${attendeeEmails[index]}:`, error);
                            });
                        });
                    } catch (error) {
                        console.error('Error sending invitation emails:', error);
                    }
                }
            }
            
            setShowModal(false);
            setIsCreatingEvent(false);
        }
    };

    const handleDeleteEvent = (eventId) => {
        const event = calendarEvents.find(e => e.id === eventId);
        if (event) {
            setEventToDelete(event);
            setShowDeleteConfirm(true);
        }
    };

    const confirmDeleteEvent = async () => {
        if (!eventToDelete) return;
        
        setIsDeletingEvent(true);
        
        // Delete from external calendars first
        try {
            if (eventToDelete.external_id) {
                if (eventToDelete.external_source === 'google') {
                    const token = getStoredCalendarToken('google');
                    if (token) {
                        await deleteGoogleCalendarEvent(eventToDelete.external_id, token);
                    }
                } else if (eventToDelete.external_source === 'outlook') {
                    const token = getStoredCalendarToken('outlook');
                    if (token) {
                        await deleteOutlookCalendarEvent(eventToDelete.external_id, token);
                    }
                }
            }
        } catch (syncError) {
            console.error('Error deleting from external calendar:', syncError);
            // Continue with local deletion even if external delete fails
        }
        
        // Delete from database
        const { error } = await supabaseClient
            .from('calendar_events')
            .delete()
            .eq('id', eventToDelete.id);
        
        if (error) {
            addToast(t('calendar.event_delete_error', { message: error.message }), 'error');
        } else {
            addToast(t('calendar.event_deleted'), 'success');
            dispatch({ type: 'DELETE_EVENT', payload: eventToDelete.id });
            setShowDeleteConfirm(false);
            setEventToDelete(null);
            // Close the event editing modal if it's open
            setShowModal(false);
            setEditingEvent(null);
        }
        
        setIsDeletingEvent(false);
    };

    const handleViewChange = (view) => {
        setCurrentView(view);
        if (calendarRef.current) {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.changeView(view);
        }
    };

    const toggleCategoryVisibility = (categoryId) => {
        setVisibleCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryId)) {
                newSet.delete(categoryId);
            } else {
                newSet.add(categoryId);
            }
            return newSet;
        });
    };


    return (
        <>
            <div className="flex h-full gap-8">
                {/* Left Sidebar */}
                <aside className="w-64 flex-shrink-0">
                    <MiniCalendar currentDate={currentDate} setCurrentDate={setCurrentDate} />
                    
                    {/* Calendar Actions */}
                    <div className="mt-6 space-y-3" data-onboarding="calendar-nav">
                        <button type="button"
                            onClick={() => setShowGoogleImportModal(true)}
                            className="w-full px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            {t('calendar.import_google')}
                        </button>
                        <button type="button"
                            onClick={() => setShowOutlookImportModal(true)}
                            className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {t('calendar.import_outlook')}
                        </button>
                    </div>

                    <div className="mt-6" data-onboarding="calendar-events">
                        <h3 className="text-sm font-semibold text-gray-500 mb-2">{t('calendar.my_calendars')}</h3>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-blue-600"/>
                            {t('calendar.calendar_label')}
                        </label>
                    </div>

                    {/* Color Legend */}
                    <div className="mt-6" data-onboarding="calendar-legend">
                        <h3 className="text-sm font-semibold text-gray-500 mb-3">{t('calendar.event_categories')}</h3>
                        <div className="space-y-2">
                            {displayCategories.map(category => {
                                const isVisible = visibleCategories.has(category.id);
                                return (
                                    <label 
                                        key={category.id} 
                                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-1 -mx-1 transition-colors"
                                    >
                                        <input 
                                            type="checkbox" 
                                            checked={isVisible}
                                            onChange={() => toggleCategoryVisibility(category.id)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div 
                                            className="w-3 h-3 rounded flex-shrink-0" 
                                            style={{backgroundColor: category.color}}
                                        ></div>
                                        <span className={`text-gray-600 flex-1 ${!isVisible ? 'opacity-50 line-through' : ''}`}>
                                            {category.name}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                {/* Main Calendar */}
                <main 
                    data-onboarding="calendar-container"
                    className="flex-1 bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden"
                >
                    {/* Outlook-style Header */}
                    <div className="bg-white border-b border-gray-200 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <h1 className="text-2xl font-semibold text-gray-900">{t('calendar.title')}</h1>
                                <div className="flex items-center space-x-2">
                                    <button type="button"
                                        onClick={() => setShowModal(true)}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                    >
                                        {t('calendar.new_event')}
                                    </button>
                                    <button type="button"
                                        onClick={() => setShowCategoryManager(true)}
                                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                                    >
                                        {t('calendar.manage_categories')}
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                {/* Weather Widget */}
                                <div className="flex-shrink-0 relative">
                                    <WeatherWidget compact={true} />
                                </div>
                                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                    <button type="button" 
                                        onClick={() => handleViewChange('timeGridDay')}
                                        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                                            currentView === 'timeGridDay' 
                                                ? 'bg-white text-gray-900 shadow-xs' 
                                                : 'text-gray-700 hover:bg-white hover:text-gray-900'
                                        }`}
                                    >
                                        {t('calendar.view_day')}
                                    </button>
                                    <button type="button" 
                                        onClick={() => handleViewChange('timeGridWeek')}
                                        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                                            currentView === 'timeGridWeek' 
                                                ? 'bg-white text-gray-900 shadow-xs' 
                                                : 'text-gray-700 hover:bg-white hover:text-gray-900'
                                        }`}
                                    >
                                        {t('calendar.view_week')}
                                    </button>
                                    <button type="button" 
                                        onClick={() => handleViewChange('dayGridMonth')}
                                        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                                            currentView === 'dayGridMonth' 
                                                ? 'bg-white text-gray-900 shadow-xs' 
                                                : 'text-gray-700 hover:bg-white hover:text-gray-900'
                                        }`}
                                    >
                                        {t('calendar.view_month')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Calendar Content */}
                    <div className="h-full" data-onboarding="add-event-btn">
                        <FullCalendar
                            ref={calendarRef}
                            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                            initialView={currentView}
                            headerToolbar={false}
                            events={events}
                            dateClick={handleDateClick}
                            eventClick={handleEventClick}
                            eventDrop={handleEventDrop}
                            eventResize={handleEventResize}
                            editable={true}
                            selectable={true}
                            height="calc(100vh - 200px)"
                            allDaySlot={true}
                            timeZone="local"
                            slotMinTime="00:00:00"
                            slotMaxTime="24:00:00"
                            eventDisplay="block"
                            eventTextColor="white"
                            dayHeaderContent={(arg) => {
                                // Add weather to day headers in week/day views
                                const date = arg.date instanceof Date ? arg.date : new Date(arg.date);
                                const dateKey = date.toDateString();
                                const weather = weatherForecast[dateKey];
                                
                                // Month view: return default
                                if (arg.view && arg.view.type === 'dayGridMonth') {
                                    return arg.text;
                                }
                                
                                // Week/Day views: add weather
                                return (
                                    <div className="flex flex-col items-center gap-1">
                                        <div>{arg.text}</div>
                                        {weather && (
                                            <div className="flex items-center gap-1 text-xs">
                                                {weather.icon && (
                                                    <img
                                                        src={getWeatherIconUrl(weather.icon)}
                                                        alt={weather.description}
                                                        className="w-4 h-4"
                                                        title={t('calendar.weather_tooltip', {
                                                            description: weather.description,
                                                            high: weather.high,
                                                            low: weather.low
                                                        })}
                                                    />
                                                )}
                                                <span className="text-gray-600 font-medium" title={t('calendar.weather_tooltip', {
                                                    description: weather.description,
                                                    high: weather.high,
                                                    low: weather.low
                                                })}>
                                                    {weather.temperature}°
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            }}
                            slotLabelFormat={{
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                            }}
                            eventTimeFormat={{
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                            }}
                            nowIndicator={true}
                            scrollTime="08:00:00"
                            dayCellContent={(arg) => {
                                // Get weather for this day (month view only)
                                if (arg.view && arg.view.type === 'dayGridMonth') {
                                    const dateKey = arg.date.toDateString();
                                    const weather = weatherForecast[dateKey];
                                    
                                    return (
                                        <div className="fc-daygrid-day-frame" style={{ position: 'relative' }}>
                                            {/* Weather icon in top LEFT */}
                                            {weather && weather.icon && (
                                                <div style={{ 
                                                    position: 'absolute', 
                                                    top: '4px', 
                                                    left: '4px', 
                                                    zIndex: 10 
                                                }}>
                                                    <img
                                                        src={getWeatherIconUrl(weather.icon)}
                                                        alt={weather.description}
                                                        className="w-8 h-8"
                                                        title={t('calendar.weather_tooltip_full', {
                                                            description: weather.description,
                                                            temp: weather.temperature,
                                                            high: weather.high,
                                                            low: weather.low
                                                        })}
                                                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
                                                    />
                                                </div>
                                            )}
                                            <div className="fc-daygrid-day-top" style={{ paddingLeft: weather && weather.icon ? '36px' : '8px' }}>
                                                <a className="fc-daygrid-day-number">{arg.dayNumberText}</a>
                                            </div>
                                        </div>
                                    );
                                }
                                // For other views, return default
                                return arg.dayNumberText;
                            }}
                            businessHours={{
                                daysOfWeek: [1, 2, 3, 4, 5],
                                startTime: '09:00',
                                endTime: '17:00'
                            }}
                            eventClassNames="outlook-event"
                            dayCellClassNames="outlook-day"
                        />
                    </div>
                </main>
            </div>

            {/* Event Modal */}
            {showModal && (
                <EventModal 
                    onClose={() => {
                        setShowModal(false);
                        setEditingEvent(null);
                    }} 
                    onSave={handleSaveEvent}
                    onDelete={handleDeleteEvent}
                    event={editingEvent}
                    date={modalDate} 
                    isLoading={isCreatingEvent || isUpdatingEvent} 
                />
            )}

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
                <ConfirmDialog
                    isOpen={showDeleteConfirm}
                    onClose={() => {
                        setShowDeleteConfirm(false);
                        setEventToDelete(null);
                    }}
                    onConfirm={confirmDeleteEvent}
                    title={t('calendar.delete_event_title')}
                    message={t('calendar.delete_event_message', { title: eventToDelete?.title })}
                    confirmText={t('common.delete')}
                    confirmClass="bg-red-600 hover:bg-red-700"
                    isLoading={isDeletingEvent}
                />
            )}

            {/* Google Import Modal */}
            {showGoogleImportModal && (
                <CalendarImportModal 
                    onClose={() => setShowGoogleImportModal(false)} 
                    importType="google"
                />
            )}

            {/* Outlook Import Modal */}
            {showOutlookImportModal && (
                <CalendarImportModal 
                    onClose={() => setShowOutlookImportModal(false)} 
                    importType="outlook"
                />
            )}

            {/* Category Color Manager */}
            {showCategoryManager && (
                <CategoryColorManager 
                    isOpen={showCategoryManager}
                    onClose={() => setShowCategoryManager(false)}
                />
            )}
        </>
    );
}

export default CalendarView;