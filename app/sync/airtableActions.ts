
// SESSION TABLE

import { addCalendarToList } from "./gcalActions";
import { AIRTABLE_TIMEOUT, createdSessions, editedCohorts, editedSessions, FORCE_RESHARE } from "./settings";

const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const airtableTableId = process.env.AIRTABLE_TABLE_ID;
const airtableCohortTableId = process.env.AIRTABLE_COHORT_TABLE_ID;
const airtableSyncTableId = process.env.AIRTABLE_SYNC_TABLE_ID;
const airtableToken = process.env.AIRTABLE_TOKEN;

let knownCalendarsIds: string[] = [];

export async function fetchAirtableSessions(lastSyncTime: Date) {
    if (!airtableBaseId || !airtableTableId || !airtableToken)
        throw new Error('[AIRTABLE] Airtable credentials are not set');


    // Calculate hard cutoff time for retroactive updates
    let cutoffTime = new Date();
    cutoffTime.setFullYear(cutoffTime.getFullYear() - 1);

    const formula = `AND(IS_AFTER({Last Modified}, "${lastSyncTime.toISOString()}"), IS_AFTER({Date}, "${cutoffTime.toISOString()}"))`;

    console.log(`[AIRTABLE] Fetching sessions edited after ${lastSyncTime.toISOString()} and set after ${cutoffTime.toISOString()}.`);

    // Fetch all applicable records from Airtable, including pagination
    let records: any[] = [];
    let offset: string | undefined;

    do {
        const response = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableTableId}?filterByFormula=${formula}` + (offset ? `&offset=${offset}` : ''), {
            headers: {
                Authorization: `Bearer ${airtableToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok)
            throw new Error(`[AIRTABLE] Failed to fetch Airtable sessions: ${response.statusText}`);

        const responseData = await response.json();

        if (!responseData.records)
            throw new Error('[AIRTABLE] No records found in Airtable response');

        offset = responseData.offset;
        records = records.concat(responseData.records);

        await new Promise(resolve => setTimeout(resolve, AIRTABLE_TIMEOUT));

    } while (offset && offset.length > 0);

    if (records.length === 0) {
        console.log('[AIRTABLE] No sessions found that need updates.');
        return [];
    }

    console.log(`[AIRTABLE] Found ${records.length} relevant sessions.`);
    return records;
}

export async function saveEventIdToAirtable(session: any, saveSecondaryID: boolean = false, syncToCentral: boolean = false): Promise<any> {
    if (!airtableBaseId || !airtableTableId || !airtableToken)
        throw new Error('[AIRTABLE] Airtable credentials are not set');

    if (!session || !session.id || !session.fields || !session.fields['Event ID'])
        throw new Error(`[AIRTABLE] Session ${session.id} is missing required fields for saving event ID:`, session);

    let payload = JSON.stringify({
        fields: {
            'Event ID': [session.fields['Event ID']].flat().join(', '),
            'Calendar Event Link': [session.fields['Calendar Event Link']].flat().join(', '),
            'Secondary Event ID': saveSecondaryID ? session.fields['Secondary Event ID'] : undefined,
        },
    });

    if (syncToCentral)
        payload = JSON.stringify({
            fields: {
                'Central Event ID': [session.fields['Event ID']].flat().join(', '),
            },
        });

    await new Promise(resolve => setTimeout(resolve, AIRTABLE_TIMEOUT));
    const response = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableTableId}/${session.id}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${airtableToken}`,
            'Content-Type': 'application/json',
        },
        body: payload,
    });

    if (!response.ok)
        throw new Error(`[AIRTABLE] Failed to save event ID: ${response.statusText}`, session);

    return session;
}








// COHORT TABLE

export async function getExistingCalendarIdFromAirtable(session: any): Promise<any | null> {
    if (!airtableBaseId || !airtableCohortTableId || !airtableToken)
        throw new Error('[AIRTABLE] Airtable credentials are not set');

    // Ensure session has a linked row in the Cohort table
    const recordId = session.fields['Cohort Identifier'] ? session.fields['Cohort Identifier'][0] : null;

    if (!recordId)
        throw new Error(`[SYNC] Session ${session.id} is missing a Cohort Identifier:`, session);



    // Fetch row from Airtable Cohort table to get the current Calendar ID
    await new Promise(resolve => setTimeout(resolve, AIRTABLE_TIMEOUT));
    const response = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableCohortTableId}/${recordId}`, {
        headers: {
            Authorization: `Bearer ${airtableToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok)
        throw new Error(`[AIRTABLE] Failed to fetch calendar ID from Cohort Table: ${response.statusText}:`, session);

    const cohortData = await response.json();

    if (!cohortData || !cohortData.fields)
        throw new Error(`[AIRTABLE] Couldn't find cohort information for ${recordId}:`, session);

    if (cohortData.fields['Calendar ID'] && !knownCalendarsIds.includes(cohortData.fields['Calendar ID']) && FORCE_RESHARE) {
        addCalendarToList(cohortData.fields['Calendar ID']);
        knownCalendarsIds.push(cohortData.fields['Calendar ID']);
        console.log(`[AIRTABLE] Added unfamiliar calendar ID ${cohortData.fields['Calendar ID']} to known calendars list.`);
    }

    if (cohortData.fields['Calendar ID']) {
        const newCalId = cohortData.fields['Calendar ID'];

        session.fields['Calendar ID'] = newCalId;
        session.fields['Public Calendar Link'] = 'https://calendar.google.com/calendar/embed?src=' + newCalId;
        session.fields['iCal Calendar Link'] = 'https://calendar.google.com/calendar/ical/' + newCalId + '/public/basic.ics';
        session.fields['Direct Calendar Link'] = 'https://calendar.google.com/calendar/u/0?cid=' + newCalId;
    }

    return session;
}

export async function saveCalendarIdToAirtable(cohortRecordId: string, calendarId: string): Promise<any> {
    if (!airtableBaseId || !airtableCohortTableId || !airtableToken)
        throw new Error('[AIRTABLE] Airtable credentials are not set');

    console.log(`[AIRTABLE] Saving calendar ID ${calendarId} to Cohort record ${cohortRecordId}.`);
    console.log();

    // Save a new calendar ID and links to the Cohort table
    await new Promise(resolve => setTimeout(resolve, AIRTABLE_TIMEOUT));
    const response = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableCohortTableId}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${airtableToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(
            {
                records:
                    [
                        {
                            id: cohortRecordId,
                            fields: {
                                'Calendar ID': calendarId,
                            },
                        }
                    ]
            }
        ),
    });

    if (!response.ok)
        throw new Error(`[AIRTABLE] Failed to save calendar ID: ${await response.text()}`);
}





// SYNC TABLE
export async function getLastSync() {
    if (!airtableBaseId || !airtableSyncTableId || !airtableToken)
        throw new Error('[AIRTABLE] Airtable credentials are not set');

    // Fetch the last sync record from the Sync table
    await new Promise(resolve => setTimeout(resolve, AIRTABLE_TIMEOUT));
    const response = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableSyncTableId}?sort[0][field]=Date&sort[0][direction]=desc&maxRecords=1`, {
        headers: {
            Authorization: `Bearer ${airtableToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok)
        throw new Error(`[AIRTABLE] Failed to fetch last sync: ${response.statusText}`);

    const data = await response.json();
    return data.records.length > 0 ? new Date(data.records[0].fields['Date']) : null;
}

export async function saveSyncInfo() {
    if (!airtableBaseId || !airtableSyncTableId || !airtableToken)
        throw new Error('[AIRTABLE] Airtable credentials are not set');

    const now = new Date().toISOString();

    // Save the current sync time to the Sync table
    await new Promise(resolve => setTimeout(resolve, AIRTABLE_TIMEOUT));
    const response = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableSyncTableId}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${airtableToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            records: [
                {
                    fields: {
                        'Date': now,
                        'Events Edited': editedSessions,
                        'Events Created': createdSessions,
                        'Cohorts Edited': editedCohorts,
                    },
                }
            ],
            typecast: true, // Enable typecasting for fields
        }),
    });

    editedSessions.length = 0; // Clear the edited sessions after saving
    editedCohorts.length = 0; // Clear the edited cohorts after saving
    createdSessions.length = 0; // Clear the created sessions after saving

    if (!response.ok)
        throw new Error(`[AIRTABLE] Failed to save sync info: ${response.statusText}`);
}