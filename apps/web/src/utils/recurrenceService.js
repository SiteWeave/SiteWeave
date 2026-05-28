/**
 * Recurrence Service
 * Handles generation of recurring event instances
 */

/**
 * Parse recurrence JSON string
 * @param {string} recurrenceJson - JSON string or object
 * @returns {object|null}
 */
export function parseRecurrence(recurrenceJson) {
    if (!recurrenceJson) return null;
    if (typeof recurrenceJson === 'string') {
        try {
            return JSON.parse(recurrenceJson);
        } catch {
            return null;
        }
    }
    return recurrenceJson;
}

/**
 * Generate recurring event instances
 * @param {object} event - Base event with recurrence rules
 * @param {Date} startDate - Start generating from this date
 * @param {Date} endDate - Generate instances until this date
 * @returns {Array} Array of event instances
 */
export function generateRecurringInstances(event, startDate, endDate) {
    const recurrence = parseRecurrence(event.recurrence);
    if (!recurrence) return [];

    const instances = [];
    const baseStart = new Date(event.start_time);
    const baseEnd = new Date(event.end_time);
    const duration = baseEnd.getTime() - baseStart.getTime();

    let currentDate = new Date(baseStart);
    
    // Advance to startDate if it's in the future
    if (startDate > currentDate) {
        currentDate = new Date(startDate);
        // Adjust to match recurrence pattern
        if (recurrence.pattern === 'daily') {
            currentDate.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        } else if (recurrence.pattern === 'weekly') {
            // Find next matching weekday
            const baseDayOfWeek = baseStart.getDay();
            while (currentDate.getDay() !== baseDayOfWeek || currentDate <= baseStart) {
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    }

    const exceptions = (recurrence.exceptions || []).map(d => new Date(d).toDateString());
    let occurrenceCount = 0;

    while (currentDate <= endDate && occurrenceCount < 1000) { // Safety limit
        // Check end conditions
        if (recurrence.endType === 'until' && recurrence.endDate) {
            if (currentDate > new Date(recurrence.endDate)) break;
        } else if (recurrence.endType === 'after' && recurrence.occurrences) {
            if (occurrenceCount >= recurrence.occurrences) break;
        }

        // Check if this date is an exception
        if (!exceptions.includes(currentDate.toDateString())) {
            // Check pattern-specific conditions
            let shouldInclude = false;

            switch (recurrence.pattern) {
                case 'daily':
                    shouldInclude = true;
                    break;
                case 'weekly':
                    if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
                        shouldInclude = recurrence.daysOfWeek.includes(currentDate.getDay());
                    } else {
                        // If no days specified, use the base day
                        shouldInclude = currentDate.getDay() === baseStart.getDay();
                    }
                    break;
                case 'monthly':
                    shouldInclude = currentDate.getDate() === baseStart.getDate();
                    break;
                case 'yearly':
                    shouldInclude = 
                        currentDate.getMonth() === baseStart.getMonth() && 
                        currentDate.getDate() === baseStart.getDate();
                    break;
                case 'weekdays':
                    const dayOfWeek = currentDate.getDay();
                    shouldInclude = dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
                    break;
                default:
                    shouldInclude = false;
            }

            if (shouldInclude) {
                const instanceStart = new Date(currentDate);
                instanceStart.setHours(baseStart.getHours(), baseStart.getMinutes(), baseStart.getSeconds());
                
                const instanceEnd = new Date(instanceStart.getTime() + duration);

                instances.push({
                    ...event,
                    id: `${event.id}_${currentDate.toISOString()}`, // Temporary ID
                    start_time: instanceStart.toISOString(),
                    end_time: instanceEnd.toISOString(),
                    is_recurring_instance: true,
                    parent_event_id: event.id
                });

                occurrenceCount++;
            }
        }

        // Advance to next occurrence
        advanceDate(currentDate, recurrence);
    }

    return instances;
}

/**
 * Advance date based on recurrence pattern
 * @param {Date} date - Date to advance
 * @param {object} recurrence - Recurrence rules
 */
function advanceDate(date, recurrence) {
    const interval = recurrence.interval || 1;

    switch (recurrence.pattern) {
        case 'daily':
        case 'weekdays':
            date.setDate(date.getDate() + interval);
            break;
        case 'weekly':
            if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
                // Find next matching day
                let daysAdded = 1;
                const maxDays = 14; // Safety limit
                while (daysAdded < maxDays) {
                    if (recurrence.daysOfWeek.includes(date.getDay())) {
                        break;
                    }
                    date.setDate(date.getDate() + 1);
                    daysAdded++;
                }
            } else {
                date.setDate(date.getDate() + (7 * interval));
            }
            break;
        case 'monthly':
            date.setMonth(date.getMonth() + interval);
            break;
        case 'yearly':
            date.setFullYear(date.getFullYear() + interval);
            break;
        default:
            date.setDate(date.getDate() + interval);
    }
}

/**
 * Format recurrence pattern for display
 * @param {object} recurrence - Recurrence rules
 * @returns {string}
 */
export function formatRecurrencePattern(recurrence) {
    if (!recurrence) return 'No repeat';
    
    const interval = recurrence.interval || 1;
    const intervalText = interval > 1 ? `every ${interval} ` : '';
    
    switch (recurrence.pattern) {
        case 'daily':
            return intervalText ? `Every ${interval} days` : 'Daily';
        case 'weekly':
            if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const days = recurrence.daysOfWeek.map(d => dayNames[d]).join(', ');
                return `Weekly on ${days}`;
            }
            return intervalText ? `Every ${interval} weeks` : 'Weekly';
        case 'monthly':
            return intervalText ? `Every ${interval} months` : 'Monthly';
        case 'yearly':
            return intervalText ? `Every ${interval} years` : 'Yearly';
        case 'weekdays':
            return 'Weekdays (Mon-Fri)';
        default:
            return 'Custom';
    }
}

/**
 * Validate recurrence rules
 * @param {object} recurrence - Recurrence rules to validate
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateRecurrence(recurrence) {
    if (!recurrence || !recurrence.pattern) {
        return { valid: false, errorKey: 'calendar.recurrence_pattern_required' };
    }

    const validPatterns = ['daily', 'weekly', 'monthly', 'yearly', 'weekdays'];
    if (!validPatterns.includes(recurrence.pattern)) {
        return { valid: false, errorKey: 'calendar.recurrence_invalid_pattern' };
    }

    if (recurrence.endType === 'until' && !recurrence.endDate) {
        return { valid: false, errorKey: 'calendar.recurrence_end_date_required' };
    }

    if (recurrence.endType === 'after' && (!recurrence.occurrences || recurrence.occurrences < 1)) {
        return { valid: false, errorKey: 'calendar.recurrence_occurrences_required' };
    }

    return { valid: true };
}



























