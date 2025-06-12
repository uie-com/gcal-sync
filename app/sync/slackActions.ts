import { createdSessions, editedSessions, length } from "./route";


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


export async function sendSlackMessage(type: 'event_create' | 'event_update' | 'calendar_create' | 'sync_start', body: SlackBody): Promise<void> {
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

    body["percentageComplete"] = (editedSessions.length + createdSessions.length) + '/' + (length);

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