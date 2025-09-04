
export function needsMNEvent(session: any) {
    return session && (session.fields['MN Space ID'] && session.fields['MN Space ID'][0] && session.fields['MN Space ID'][0].trim() !== '') && (session.fields['Has MN Event'] && session.fields['Has MN Event'] === 'No')
}

export async function createMNEvent(session: any) {
    if (!needsMNEvent(session))
        return session;

    const mnSpaceId = session.fields['MN Space ID'][0].trim();
    const mnWebhook = process.env.MN_WEBHOOK;

    if (!mnWebhook)
        return session;

    const res = await fetch(mnWebhook, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            space_id: mnSpaceId,
            title: session.fields['MN Title'] || 'No Title',
            description: session.fields['Description'] || '',
            start_time: session.fields['Date'] || '',
            end_time: session.fields['End Date'] || '',
            location: session.fields['Location'] || '',
            organizer: session.fields['Organizer'] || '',
        }),
    });

    if (!res.ok) {
        console.error(`[MN] Failed to create MN event for session ${session.fields['Title']}: ${await res.text()}`);
        return session;
    }

    session.fields['Has MN Event'] = 'Yes';
    console.log(`[MN] Created MN event for session ${session.fields['Title']}`);


    return session;

}