import { getExistingCalendarIdFromAirtable, saveCalendarIdToAirtable, saveEventIdToAirtable } from "./airtableActions";
import { createGCEvent, createGoogleCalendar, hasGCEvent, updateGCEvent } from "./gcalActions";
import { centralCalendarId, createdSessions, editedCalendars, editedCohorts, editedSessions } from "./settings";
import { sendSlackMessage } from "./slackActions";


// SESSION SYNC CONTROLS

let length = 0; // Total number of cohorts to sync

export async function syncSession(session: any, totalSessions: number): Promise<any> {
    if (!session.fields['Is Split Session'])
        await syncToCentral(session);

    let { id, fields } = session;

    length = totalSessions; // Set the total number of cohorts to sync

    // console.log(`[SYNC] Syncing session ${id} with fields:`, fields);

    if (!fields || !fields.Date || isNaN(new Date(fields.Date).getTime()) || !fields.Title || !fields.Description)
        return console.error(`[SYNC] Session ${id} is missing required fields. Skipping sync.`);

    const normalizedCohorts = fields['Cohort Identifier'] ? [fields['Cohort Identifier']].flat().map((cohort: string) => cohort.trim()) : [];

    if (normalizedCohorts.length === 0)
        return console.warn(`[SYNC] Session ${id} has no cohort defined. Skipping sync.`);

    if (fields['Program'].includes('TUXS') && !fields['Is Split Session'])
        return await syncTUXSSession(session);

    // For sessions with multiple cohorts, split them into separate sessions
    if (normalizedCohorts.length > 1)
        return await syncSplitSession(session);

    // Check for current calendar ID
    session = await getExistingCalendarIdFromAirtable(session);
    fields = session.fields;

    const needsNewCalendar = !fields['Calendar ID'] || fields['Calendar ID'].trim().length === 0;

    // Create a MN event if applicable
    // if (needsMNEvent(session))
    //     session = await createMNEvent(session);

    // Check if session has an existing event
    const needsNewEvent = !(fields['Calendar ID'] && fields['Event ID'] && await hasGCEvent(fields['Calendar ID'], fields['Event ID']));

    if (needsNewCalendar)
        session = await createCalendar(session);
    if (needsNewEvent)
        session = await createEvent(session);
    else
        session = await updateEvent(session);

    editedCalendars.push({ number: 1, link: fields['Public Calendar Link'], name: fields['Calendar Name'] });

    return session;
}

async function syncToCentral(session: any): Promise<any> {
    const oldEventId = session.fields['Event ID'];
    const oldCalendarId = session.fields['Calendar ID'];
    const oldTitle = session.fields['Title'];

    session.fields['Calendar ID'] = centralCalendarId;
    session.fields['Event ID'] = session.fields['Central Event ID'];
    session.fields['Title'] = session.fields['Program'] + ': ' + oldTitle;
    session.fields['Is Central Event'] = true;

    const needsNewEvent = !(session.fields['Event ID'] && await hasGCEvent(session.fields['Calendar ID'], session.fields['Event ID']));

    if (needsNewEvent)
        session = await createEvent(session, true, true);
    else
        session = await updateEvent(session, true, true);

    session.fields['Central Event ID'] = session.fields['Event ID'];
    session.fields['Calendar ID'] = oldCalendarId;
    session.fields['Event ID'] = oldEventId;
    session.fields['Title'] = oldTitle;
    session.fields['Is Central Event'] = false;

    return session;
}

async function syncSplitSession(session: any): Promise<any> {
    const { id, fields } = session;

    console.log(`[SYNC] Session ${id} has multiple cohorts: '${fields['Cohort']}'. Syncing separate sessions.`);

    // Create a separate session object for each cohort
    let splitSessions = fields['Cohort'].map((cohort: string, index: number) => {
        const newSession = { ...session, fields: { ...fields } };

        newSession.fields['Cohort'] = [cohort];
        newSession.fields['Cohort Identifier'] = [session.fields['Cohort Identifier'][index]];
        newSession.fields['Calendar Name'] = normalizeAirtableField(session.fields['Calendar Name'])[index] ?? '';

        if (session.fields['Calendar ID'])
            newSession.fields['Calendar ID'] = normalizeAirtableField(session.fields['Calendar ID'])[index] ?? '';

        if (session.fields['Event ID'])
            newSession.fields['Event ID'] = normalizeAirtableField(session.fields['Event ID'])[index] ?? '';

        if (session.fields['Calendar Event Link'])
            newSession.fields['Calendar Event Link'] = normalizeAirtableField(session.fields['Calendar Event Link'])[index] ?? '';

        newSession.fields['Is Split Session'] = true;
        newSession.fields['Split Index'] = index + 1; // Add index to differentiate split sessions

        return newSession;
    });

    console.log(`[SYNC] Created ${splitSessions.length} split sessions for session ${id}:`, splitSessions);

    // Sync each split session individually
    let updatedSessions = [];
    for (const splitSession of splitSessions)
        updatedSessions.push(await syncSession(splitSession, length));


    // Merge the Event IDs and Calendar Event Links back into the original session
    const eventIds = splitSessions.map((s: any) => s.fields['Event ID'] ?? ' ');
    const eventLinks = splitSessions.map((s: any) => s.fields['Calendar Event Link'] ?? ' ');

    const mergedSession = {
        ...session,
        fields: {
            ...session.fields,
            'Event ID': eventIds,
            'Calendar Event Link': eventLinks,
        },
    };

    // Save the merged session back to Airtable
    await saveEventIdToAirtable(mergedSession);
    return mergedSession;
}

async function syncTUXSSession(session: any): Promise<any> {
    const { id, fields } = session;

    console.log(`[SYNC] TUXS Session ${id} has multiple events. Syncing separate sessions.`);

    // Create a separate session object for each cohort
    let qaSession = { ...session, fields: { ...fields } };
    qaSession.fields['Event ID'] = fields['Secondary Event ID'] || '';
    qaSession.fields['Title'] = fields['Secondary Title'] || '';
    qaSession.fields['Description'] = fields['Secondary Description'] || '';
    qaSession.fields['Date'] = fields['End Date'] || '';
    qaSession.fields['End Date'] = fields['Secondary End Date'] || '';
    qaSession.fields['Is Split Session'] = true;

    session.fields['Is Split Session'] = true;

    // Sync each split session individually
    session = await syncSession(session, length);

    qaSession.fields['Calendar ID'] = session.fields['Calendar ID'];
    qaSession.fields['Calendar Event Link'] = session.fields['Calendar Event Link'];

    qaSession = await syncSession(qaSession, length);



    const mergedSession = {
        ...session,
        fields: {
            ...session.fields,
            'Secondary Event ID': qaSession.fields['Event ID'] || '',
        },
    };

    // Save the merged session back to Airtable
    await saveEventIdToAirtable(mergedSession, true);
    return mergedSession;
}



// SYNC ACTIONS

async function createCalendar(session: any): Promise<any> {
    if (!hasRequiredCalendarFields(session))
        throw new Error(`[SYNC] Session ${session.id} is missing required fields for calendar creation. Skipping.`);

    const newCalId = await createGoogleCalendar(session);

    if (!newCalId)
        throw new Error(`[SYNC] Failed to create Google Calendar for session ${session.id}.`);

    session.fields['Calendar ID'] = newCalId;
    session.fields['Public Calendar Link'] = 'https://calendar.google.com/calendar/embed?src=' + newCalId;
    session.fields['iCal Calendar Link'] = 'https://calendar.google.com/calendar/ical/' + newCalId + '/public/basic.ics';
    session.fields['Direct Calendar Link'] = 'https://calendar.google.com/calendar/u/0?cid=' + newCalId;

    const cohortRecordId = normalizeAirtableField(session.fields['Cohort Identifier'])[0];

    // Save the calendar ID to Airtable
    await saveCalendarIdToAirtable(cohortRecordId, newCalId);

    sendSlackMessage('calendar_create', {
        calendarPublicLink: session.fields['Public Calendar Link'],
        calendarSummary: session.fields['Calendar Name'],
        calendariCalLink: session.fields['iCal Calendar Link'],
        calendarDirectLink: session.fields['Direct Calendar Link'],
    }, (editedSessions.length + createdSessions.length + 1), length);

    editedCohorts.push(cohortRecordId);

    return session;
}

async function createEvent(session: any, syncToCentral: boolean = false, ignoreStats: boolean = false): Promise<any> {
    if (!hasRequiredEventFields(session))
        throw new Error(`[SYNC] Session ${session.id} is missing required fields for event creation. Skipping.`);
    console.log(`[SYNC] Creating event for session ${session.id} in calendar ${syncToCentral ? 'CC Programs' : session.fields['Calendar Name']}.`);

    const { id, link } = await createGCEvent(session);

    session.fields['Event ID'] = id;
    if (!syncToCentral)
        session.fields['Calendar Event Link'] = link;

    // Save the event ID back to Airtable. Split sessions will save their event IDs together.
    if (!session.fields['Is Split Session'])
        await saveEventIdToAirtable(session, false, syncToCentral);

    if (!ignoreStats) {
        sendSlackMessage('event_create', {
            eventDate: new Date(session.fields.Date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }),
            eventSummary: session.fields.Title,
            eventLink: session.fields['Calendar Event Link'],
            calendarPublicLink: session.fields['Public Calendar Link'],
            calendarSummary: session.fields['Calendar Name'],
            calendariCalLink: session.fields['iCal Calendar Link'],
            calendarDirectLink: session.fields['Direct Calendar Link'],
        }, (editedSessions.length + createdSessions.length + 1), length);

        createdSessions.push(session.id);
    }

    return session;
}

async function updateEvent(session: any, syncToCentral: boolean = false, ignoreStats: boolean = false): Promise<any> {
    if (!hasRequiredEventFields(session))
        throw new Error(`[SYNC] Session ${session.id} is missing required fields for event update. Skipping.`);
    console.log(`[SYNC] Updating event for session ${session.id} in calendar ${syncToCentral ? 'CC Programs' : session.fields['Calendar Name']}.`);

    await updateGCEvent(session);

    if (!ignoreStats) {
        sendSlackMessage('event_update', {
            eventDate: new Date(session.fields.Date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }),
            eventSummary: session.fields.Title,
            eventLink: session.fields['Calendar Event Link'],
            calendarPublicLink: session.fields['Public Calendar Link'],
            calendarSummary: session.fields['Calendar Name'],
            calendariCalLink: session.fields['iCal Calendar Link'],
            calendarDirectLink: session.fields['Direct Calendar Link'],
        }, (editedSessions.length + createdSessions.length + 1), length);

        editedSessions.push(session.id);
    }

    return session;
}





// UTILITY FUNCTIONS

// Normalize lookup table strings/arrays/csl from Airtable into array of strings
export function normalizeAirtableField(field: any): string[] {
    if (!field) return [];
    return [field].flat().join(',').split(',').map((item: string) => item.trim());
}

// Create the event body from session for Google Calendar API
export function createEventBody(session: any): any {
    const { fields } = session;
    return {
        summary: fields.Title,
        description: fields.Description,
        location: fields.Location,
        start: {
            dateTime: new Date(fields.Date).toISOString(),
            timeZone: 'America/New_York',
        },
        end: {
            dateTime: new Date(fields["End Date"]).toISOString(),
            timeZone: 'America/New_York',
        },
        colorId: session.fields['Is Central Event'] ? fields.Color : undefined,
    };
}

// Check if the session has all required fields to send to Google Calendar
export function hasRequiredEventFields(session: any): boolean {
    const { fields } = session;
    return fields
        && fields.Date && !isNaN(new Date(fields.Date).getTime())
        && fields['End Date'] && !isNaN(new Date(fields['End Date']).getTime())
        && fields.Title
        && fields.Description
        && fields.Location
        && fields['Calendar Name']
        && fields['Calendar ID'];
}

// Check if the session has all required fields to create a Google Calendar
export function hasRequiredCalendarFields(session: any): boolean {
    const { fields } = session;
    return fields
        && fields['Cohort Identifier']
        && fields['Calendar Name'];
}
