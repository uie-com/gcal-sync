import { NextRequest } from "next/server";
import { fetchAirtableSessions, getLastSync, saveSyncInfo } from "./airtableActions";
import { syncSession } from "./syncActions";
import { sendSlackMessage } from "./slackActions";
import { deleteAllCalendars, listGoogleCalendars } from "./gcalActions";

export const CALENDAR_FIND_TIMEOUT = 1000 * 1;
export const CALENDAR_CREATE_TIMEOUT = 1000 * 30;
export const CALENDAR_LIST_TIMEOUT = 1000 * 1;
export const CALENDAR_SHARE_TIMEOUT = 1000 * 1;
export const CALENDAR_DELETE_TIMEOUT = 1000 * 5;

export const EVENT_GET_TIMEOUT = 1000 * 1 / 4;
export const EVENT_FIND_TIMEOUT = 1000 * 1 / 4;
export const EVENT_CREATE_TIMEOUT = 1000 * 1;
export const EVENT_UPDATE_TIMEOUT = 1000 * 1 / 4;
export const EVENT_DELETE_TIMEOUT = 1000 * 1;

export const AIRTABLE_TIMEOUT = 1000 * 1 / 4;


export const CALENDAR_OWNERS = [
    'ayang@centercentre.com',
    'avelazquez@centercentre.com'
];



let isInProgress = false;
export const FORCE_RESYNC = true;
export const FORCE_RESHARE = false;
const MANUAL_FILTER = 'TUXS';

export const editedCohorts: string[] = [];
export const createdSessions: string[] = [];
export const editedSessions: string[] = [];
export let length: number = 0;

export async function POST(request: NextRequest) {
    // Check if a sync is already in progress
    if (isInProgress)
        return new Response('Sync is already in progress.', { status: 429 });
    isInProgress = true;

    let lastSync = await getLastSync();
    if (lastSync) {
        console.log(`[SYNC] Last sync was on ${lastSync}`);
    } else {
        console.log('[SYNC] No previous sync found. This is the first sync.');
        lastSync = new Date();
        lastSync.setDate(lastSync.getDate() - 7);
    }

    if (FORCE_RESYNC) {
        console.log('[SYNC] Forcing resync of all sessions.');
        lastSync = new Date(0); // Reset to epoch time to fetch all sessions
    }

    console.log(`[SYNC] Starting sync at ${new Date().toISOString()}.`);


    // Fetch sessions from Airtable that were modified after the last sync time
    let sessions = await fetchAirtableSessions(lastSync);

    // Filter sessions for testing
    sessions = sessions.filter(session => session.fields && session.fields['Name (from Cohort Identifier)'].join('').includes(MANUAL_FILTER));

    // Sort sessions by date
    sessions.sort((a, b) => {
        const dateA = new Date(a.fields.Date);
        const dateB = new Date(b.fields.Date);
        return dateA.getTime() - dateB.getTime();
    });


    length = sessions.map(s => s.fields['Cohort Identifier']).flat().length;
    sendSlackMessage('sync_start', {
        syncLink: process.env.SYNC_LINK || 'https://centercentre.com/gcal-sync',
        numberEvents: length.toString(),
    });

    if (sessions.length === 0) {
        console.log('[SYNC] No sessions to sync.');
        return new Response('No updates found to sync.', { status: 200 });
    }



    // Perform the sync for each session
    for (const session of sessions)
        await syncSession(session);


    // Saving sync info
    await saveSyncInfo();
    length = 0;

    // sendSlackMessage('sync_end', {
    //     syncLink: process.env.SYNC_LINK || 'https://centercentre.com/gcal-sync',
    //     numberEvents: length.toString(),
    // });

    // Log the completion of the sync
    console.log('[SYNC] Sync completed successfully.');
    isInProgress = false;
    return new Response('Sync completed successfully', { status: 200 });

}



