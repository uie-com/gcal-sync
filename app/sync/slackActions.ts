import { editedCalendars, savedLastSync, SLACK_REPEAT_TIMEOUT } from "./settings";

export type SlackBody = {
    "calendarPublicLink"?: string,
    "syncLink"?: string,
    "eventDate"?: string,
    "calendarDirectLink"?: string,
    "calendarSummary"?: string,
    "calendariCalLink"?: string,
    "eventSummary"?: string,
    "eventLink"?: string,
    "numberEvents"?: string,
    "percentageComplete"?: string,
};

export async function sendFinishedSlackMessage(): Promise<void> {
    const url = process.env.SYNC_END_WEBHOOK_URL;
    if (!url) {
        console.error('[SLACK] No webhook URL configured for sync end. Skipping message.');
        return;
    }

    const finalCalendars: { name: string, number: number, link: string }[] = [];

    for (const cal of editedCalendars) {
        const existing = finalCalendars.find(c => c.link === cal.link);
        if (existing)
            existing.number += cal.number;
        else
            finalCalendars.push(cal);
    }

    for (const cal of finalCalendars) {
        const body = {
            name: cal.name,
            number: cal.number,
            link: cal.link,
        };

        try {
            await new Promise(resolve => setTimeout(resolve, SLACK_REPEAT_TIMEOUT));
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error(`[SLACK] Failed to send message: ${response.statusText}`);
            }
        } catch (error) {
            console.error(`[SLACK] Error sending message: ${error}`);
        }
    }
}


export async function sendSlackMessage(type: 'event_create' | 'event_update' | 'calendar_create' | 'sync_start', body: SlackBody, done: number, length: number): Promise<void> {
    const webhookUrl = type === 'event_create' ? process.env.EVENT_CREATE_WEBHOOK_URL :
        type === 'event_update' ? process.env.EVENT_UPDATE_WEBHOOK_URL :
            type === 'calendar_create' ? process.env.CALENDAR_CREATE_WEBHOOK_URL :
                type === 'sync_start' ? process.env.SYNC_START_WEBHOOK_URL :
                    null;

    if (!webhookUrl) {
        console.error(`[SLACK] No webhook URL configured for ${type}. Skipping message.`);
        return;
    }

    // Convert arrays to strings if they are present
    for (const key in body) {
        const typedKey = key as keyof SlackBody;
        if (Array.isArray(body[typedKey])) {
            body[typedKey] = (body[typedKey] as unknown as string[]).join(', ');
        } else
            body[typedKey] = (body[typedKey] as unknown as string).split(',')[0] || '';
    }

    body["percentageComplete"] = done + '/' + (length);
    body["syncLink"] = process.env.SYNC_URL + (savedLastSync[0] ? '?resync=' + new Date(savedLastSync[0] ?? '').toISOString() : '') || '';

    // console.log(`[SLACK] Sending message to ${type} webhook:`, body);

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`[SLACK] Failed to send message: ${response.statusText}`);
        }
    } catch (error) {
        console.error(`[SLACK] Error sending message: ${error}`);
    }
}