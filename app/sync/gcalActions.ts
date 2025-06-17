import { google } from 'googleapis';
import { NextRequest } from 'next/server';
import { fetchAirtableSessions, saveCalendarIdToAirtable, saveEventIdToAirtable } from './airtableActions';
import { hasRequiredEventFields, createEventBody } from './syncActions';
import { CALENDAR_CREATE_TIMEOUT, CALENDAR_DELETE_TIMEOUT, CALENDAR_FIND_TIMEOUT, CALENDAR_LIST_TIMEOUT, CALENDAR_OWNERS, CALENDAR_SHARE_TIMEOUT, EVENT_CREATE_TIMEOUT, EVENT_DELETE_TIMEOUT, EVENT_FIND_TIMEOUT, EVENT_GET_TIMEOUT, EVENT_UPDATE_TIMEOUT } from './settings';

// Authentication setup for Google Calendar API
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const auth = new google.auth.JWT({
    email: process.env.CLIENT_EMAIL,
    key: process.env.PRIVATE_KEY,
    scopes: SCOPES,
    subject: 'skohlhorst@centercentre.com',
});

const calendar = google.calendar({ version: 'v3', auth });


// CALENDAR ACTIONS

export async function findGoogleCalendarByName(summary: string): Promise<string | null> {
    await new Promise(resolve => setTimeout(resolve, CALENDAR_FIND_TIMEOUT));
    const res = await calendar.calendarList.list({
        auth,
    });

    const calendars = res.data.items || [];

    const foundCal = calendars.find(cal => cal.summary?.trim() === summary?.trim());

    return foundCal ? foundCal.id || null : null;
}

// Testing function to delete all service worker's calendars
export async function deleteAllCalendars() {
    return;
    const res = await calendar.calendarList.list({
        auth,
    });
    const calendars = res.data.items || [];
    console.log(`[SYNC] Found ${calendars.length} calendars to delete.`);

    for (const cal of calendars) {
        console.log(`[SYNC] Deleting calendar ${cal.summary} (${cal.id})...`);
        await new Promise(resolve => setTimeout(resolve, CALENDAR_DELETE_TIMEOUT));
        await calendar.calendars.delete({
            calendarId: cal.id ?? undefined,
        });
        console.log(`[SYNC] Deleted calendar ${cal.summary} (${cal.id}).`);
    }
}

export async function listGoogleCalendars() {
    await new Promise(resolve => setTimeout(resolve, CALENDAR_FIND_TIMEOUT));
    const res = await calendar.calendarList.list({
        auth,
    });

    const calendars = res.data.items || [];
    const names = calendars.map(cal => cal.summary || '');
    console.log(`[SYNC] Found ${calendars.length} calendars: ${names.join(', ')}`);

    const firstCalEvents = await calendar.events.list({
        calendarId: calendars[3]?.id || '',
        timeMin: new Date(0).toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime',
    });
    const firstCalEventNames = firstCalEvents.data.items?.map(event => event.summary || '') || [];
    console.log(`[SYNC] First calendar (${calendars[3]?.summary}) events: ${firstCalEventNames.join(', ')}`);
}

export async function createGoogleCalendar(session: any): Promise<string | null> {
    const { id, fields } = session;

    let calendarId = fields['Calendar ID'] && fields['Calendar ID'].length > 0 ?
        fields['Calendar ID'] :
        await findGoogleCalendarByName(fields['Calendar Name'][0]);

    if (calendarId)
        console.warn(`[SYNC] Calendar with name "${fields['Calendar Name']}" already exists. Using existing calendar.`);
    else {
        console.log(`[SYNC] Creating calendar ${fields['Calendar Name']} for session ${id}.`);

        const calendarBody = {
            summary: fields['Calendar Name'],
            timeZone: 'America/New_York',
        };

        // Create calendar
        await new Promise(resolve => setTimeout(resolve, CALENDAR_CREATE_TIMEOUT));
        const res = await calendar.calendars.insert({
            requestBody: calendarBody,
        });
        calendarId = res.data.id;

        // Add calendar to the bot's calendar list
        await new Promise(resolve => setTimeout(resolve, CALENDAR_LIST_TIMEOUT));
        await calendar.calendarList.insert({
            requestBody: {
                id: calendarId,
            },
        });

        console.log(`[SYNC] Created calendar ${fields['Calendar Name']} under https://calendar.google.com/calendar/u/0?cid=${calendarId}.`);
    }

    // Share the calendar with users
    CALENDAR_OWNERS.forEach(async (owner) => {
        await new Promise(resolve => setTimeout(resolve, CALENDAR_SHARE_TIMEOUT));
        await calendar.acl.insert({
            calendarId: calendarId ?? undefined,
            requestBody: {
                scope: {
                    type: 'user',
                    value: owner,
                },
                role: 'owner',
            },
        });
    });

    return calendarId;
}

export async function updateGCEvent(session: any) {
    const { id, fields } = session;

    await new Promise(resolve => setTimeout(resolve, EVENT_UPDATE_TIMEOUT));
    const event = createEventBody(session);
    await calendar.events.update({
        calendarId: fields['Calendar ID'],
        eventId: fields['Event ID'],
        requestBody: event,
    });

    return session;
}

export async function createGCEvent(session: any) {
    const { id, fields } = session;

    // Check if different event exists at same time
    const equivId = await equivalentGCEventExists(fields['Calendar ID'], new Date(fields.Date), fields.Title);
    if (equivId) {
        console.warn(`[SYNC] Equivalent event already exists for session ${id}.`);
        await deleteGCEvent(equivId, fields['Calendar ID']);
    }

    // Create event
    await new Promise(resolve => setTimeout(resolve, EVENT_CREATE_TIMEOUT));
    const event = createEventBody(session);
    const res = await calendar.events.insert({
        calendarId: fields['Calendar ID'],
        requestBody: event,
    });

    return { id: res.data.id, link: res.data.htmlLink };
}


export async function hasGCEvent(calendarId: string, eventId: string) {
    try {
        await new Promise(resolve => setTimeout(resolve, EVENT_GET_TIMEOUT));
        const response = await calendar.events.get({
            calendarId,
            eventId,
        });
        return !!response.data;
    } catch (error) {
        return false;
    }
}

export async function equivalentGCEventExists(
    calendarId: string,
    dateTime: Date,
    summary: string
): Promise<string | null> {
    const startTime = new Date(dateTime.getTime() - 1 * 60 * 1000).toISOString();
    const endTime = new Date(dateTime.getTime() + 1 * 60 * 1000).toISOString();

    await new Promise(resolve => setTimeout(resolve, EVENT_FIND_TIMEOUT));
    const res = await calendar.events.list({
        auth,
        calendarId,
        timeMin: startTime,
        timeMax: endTime,
        singleEvents: true,
        orderBy: 'startTime',
    });

    const events = res.data.items || [];

    if (!events[0]?.start?.dateTime || new Date(events[0]?.start?.dateTime).toISOString() !== dateTime.toISOString())
        return null; // No equivalent event found

    return events[0]?.id || null; // Return the first event ID if found, otherwise null
}

export async function deleteGCEvent(eventId: string, calendarId: string) {
    try {
        await new Promise(resolve => setTimeout(resolve, EVENT_DELETE_TIMEOUT));
        await calendar.events.delete({
            calendarId,
            eventId,
        });
        console.log(`[SYNC] Deleted event ${eventId} from calendar ${calendarId}`);
    } catch (error) {
        console.error(`[SYNC] Failed to delete event ${eventId} from calendar ${calendarId}:`, error);
    }
}


export async function addCalendarToList(calendarId: string) {
    try {
        await new Promise(resolve => setTimeout(resolve, CALENDAR_LIST_TIMEOUT));
        await calendar.calendarList.insert({
            requestBody: {
                id: calendarId,
            },
        });

        // Share the calendar with users
        CALENDAR_OWNERS.forEach(async (owner) => {
            await new Promise(resolve => setTimeout(resolve, CALENDAR_SHARE_TIMEOUT));
            await calendar.acl.insert({
                calendarId: calendarId ?? undefined,
                requestBody: {
                    scope: {
                        type: 'user',
                        value: owner,
                    },
                    role: 'owner',
                },
            });
        });
        console.log(`[SYNC] Added calendar ${calendarId} to the calendar list.`);
    } catch (error) {
        console.error(`[SYNC] Failed to add calendar ${calendarId} to the calendar list:`, error);
    }
}