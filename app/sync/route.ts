import { NextRequest } from "next/server";
import { fetchAirtableSessions, getLastSync, saveSyncInfo } from "./airtableActions";
import { addCalendarToList } from "./gcalActions";
import { FORCE_RESHARE, FORCE_RESYNC, createdSessions, editedSessions, savedLastSync } from "./settings";
import { sendFinishedSlackMessage, sendSlackMessage } from "./slackActions";
import { normalizeAirtableField, syncSession } from "./syncActions";



let isInProgress = false;

const MANUAL_FILTER = undefined;

export async function POST(request: NextRequest) {
    // Check if a sync is already in progress
    if (isInProgress)
        return new Response('Sync is already in progress.', { status: 429 });
    isInProgress = true;

    const { searchParams } = new URL(request.url);

    let lastSync = await getLastSync();
    if (lastSync) {
        savedLastSync.push(lastSync);
        console.log(`[SYNC] Last sync was on ${lastSync}`);
    } else {
        console.log('[SYNC] No previous sync found. This is the first sync.');
        lastSync = new Date();
        lastSync.setDate(lastSync.getDate() - 7);
    }

    if (searchParams.has('resync')) {
        lastSync = new Date(searchParams.get('resync') ?? ''); // Reset to epoch time to fetch all sessions
        console.log(`[SYNC] Resync requested. Last sync time set to ${lastSync.toISOString()}.`);
    }

    if (FORCE_RESYNC) {
        console.log('[SYNC] Forcing resync of all sessions.');
        lastSync = new Date(0); // Reset to epoch time to fetch all sessions
    }

    console.log(`[SYNC] Starting sync at ${new Date().toISOString()}.`);


    // Fetch sessions from Airtable that were modified after the last sync time
    let sessions = await fetchAirtableSessions(lastSync);

    // Filter sessions for testing
    if (MANUAL_FILTER)
        sessions = sessions.filter(session => session.fields && session.fields['Name (from Cohort Identifier)'].join('').includes(MANUAL_FILTER));

    // Sort sessions by date
    sessions.sort((a, b) => {
        const dateA = new Date(a.fields.Date);
        const dateB = new Date(b.fields.Date);
        return dateA.getTime() - dateB.getTime();
    });

    // Manual Calendar Sync
    if (FORCE_RESHARE) {
        console.log('[SYNC] Forcing reshare of all calendars.');
        const allSyncDate = new Date();
        allSyncDate.setFullYear(allSyncDate.getFullYear() - 1); // Set a cutoff date for retroactive updates
        let allSessions = await fetchAirtableSessions(allSyncDate);

        // Sort sessions by date
        allSessions.sort((a, b) => {
            const dateA = new Date(a.fields.Date);
            const dateB = new Date(b.fields.Date);
            return dateA.getTime() - dateB.getTime();
        });

        const allCalendarIds = allSessions.map(s => normalizeAirtableField(s.fields['Calendar ID'])).flat().filter(id => id);
        const uniqueCalendarIds = Array.from(new Set(allCalendarIds));

        console.log(`[SYNC] Forcing reshare of all calendars. Found ${uniqueCalendarIds.length} calendars to reshare.`);

        for (const calendarId of uniqueCalendarIds) {
            await addCalendarToList(calendarId);
            console.log(`[SYNC] Added calendar ID ${calendarId}.`);
        }

    }


    let length = sessions.map(s => s.fields['Cohort Identifier']).flat().length;
    sendSlackMessage('sync_start', {
        numberEvents: length.toString(),
    }, (editedSessions.length + createdSessions.length + 1), length);

    if (sessions.length === 0) {
        console.log('[SYNC] No sessions to sync.');
        isInProgress = false;
        return new Response('No updates found to sync.', { status: 200 });
    }



    // Perform the sync for each session
    for (const session of sessions)
        await syncSession(session, length);


    // Saving sync info
    await saveSyncInfo();
    length = 0;

    // sendSlackMessage('sync_end', {
    //     numberEvents: length.toString(),
    // });

    // Log the completion of the sync
    console.log('[SYNC] Sync completed successfully.');
    await sendFinishedSlackMessage();

    isInProgress = false;
    return new Response('Sync completed successfully', { status: 200 });
}



