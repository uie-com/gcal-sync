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

export const SLACK_REPEAT_TIMEOUT = 1000 * 1 / 4;


export const CALENDAR_OWNERS = [
    'jquinn@centercentre.com',
    'jdunn@centercentre.com',
    'avelazquez@centercentre.com',
];

export const FORCE_RESYNC = false; // Force resync all sessions and cohorts
export const FORCE_RESHARE = false; // Force reshare all calendars

export const editedCohorts: string[] = [];
export const createdSessions: string[] = [];
export const editedSessions: string[] = [];

export const editedCalendars: { name: string, number: number, link: string }[] = [];

export const savedLastSync: (Date | null)[] = [];

export const centralCalendarId = 'c_8c5d0801420d303754929f07b6fae936874a03580642a84998481cfc9dfeca74@group.calendar.google.com';