# Google Calendar Sync Utility

The **Google Calendar Sync Utility** automatically creates and updates **Google Calendars and events** based on session data stored in Airtable.  
It ensures every cohort’s calendar stays synchronized as dates, times, and topics change — no manual updates required.

## 🧭 Overview

The Sync Utility reads data from the **Programs Airtable**, where sessions for each cohort are managed.  
When sessions are **published**, it automatically:

- Creates a dedicated **Google Calendar** for each cohort.
- Creates events for each session.
- Keeps sessions and calendar events in sync — updating, moving, or renaming them as needed.

All synced calendars can be viewed in the **🧑‍🧑‍🧒‍🧒 Cohort Settings** tab of the  
**Programs – Google Calendars** Airtable.

## 🚀 How to Use

### Automatic Syncs

1. When a session is marked **Published** in the Programs Airtable,  
   it will sync to Google Calendar within about **15–30 minutes**.
2. Each sync posts status updates (such as new events or calendars created) to Slack in `#google_cals`.
3. When sessions for a new cohort are published, the utility automatically:
   - Creates a **new calendar**.
   - Shares it with the appropriate users.
   - Notifies the `#google_cals` channel.

### Manual Re-Sync

If you need to refresh specific events:

- Open [https://gcal.centercentre.com](https://gcal.centercentre.com)  
  to trigger a full or partial sync.
- Use the **“Re-sync event”** button in `#google_cals` for targeted refreshes.
- In Airtable, go to  
  **Programs – Google Calendars → 📆 Sessions tab → Sync Status view**,  
  and toggle the **Trigger Sync** checkbox to flag items for re-sync.

### Adjusting Event Formatting

To change how sessions appear in Google Calendar (titles, durations, descriptions, etc.):

- Edit the formula fields inside the  
  **Programs – Google Calendars** Airtable.  
- No code changes are required — the app simply uses the computed fields.

## ⚙️ How It Works

### Hosting

- Runs as a **Next.js app**, hosted on the **CenterCentre Droplet**.  
- Traffic is routed through **https://gcal.centercentre.com/**
- Managed by **PM2**, with a nightly restart at **~3 AM ET** for stability.

### API Endpoint

There is one main endpoint:

#### `POST /sync`

- Called automatically when the root index page is loaded.  
- Optional query parameter: **`resync`** (a date-time string).  
  - When provided, re-syncs all sessions updated after that timestamp.  
  - This powers Slack’s “re-sync” button feature.

**Example:**  
```
POST https://gcal.centercentre.com/sync?resync=2025-10-08T14:00:00Z
```

## 🧩 Data Sources

### Airtable Integration

The Sync Utility relies on three connected Airtable bases:

1. **Programs** – Original source of truth for all sessions.  
2. **Programs – Sync Utility** – Merges the Programs table for processing.  
3. **Programs – Google Calendars** – Final formatted data for calendar creation.

If data seems stale, you can manually refresh each linked table in Airtable:  
**Click the table name → Start Sync**.

## 🔗 Data Relationships

The tool permanently links:

| Relationship | Description |
|---------------|-------------|
| **Sessions ↔ Events** | Each Airtable session is paired with one or more Google Calendar events. |
| **Cohorts ↔ Calendars** | Each cohort has its own Google Calendar. |

IDs for both **events** and **calendars** are stored in Airtable to:
- Avoid creating duplicates.
- Enable accurate updates when sessions are rescheduled.

Special event handling:
- **Influence (Win)** sessions → 3 events combined under one session.
- **TUXS** sessions → 2 events (Lecture + Q&A) combined similarly.

All events are also synced to a unified **CC Programs** calendar, with colors assigned per program.

A record of every successful run is saved to the  
**📓 Sync History** table.

## 🧠 Internal Workflow (Simplified)

After filtering sessions that have changed since the last sync:

1. Notify Slack with the number of sessions to be processed.
2. For each session:
   - If it’s **TUXS**, duplicate for Q&A.
   - If it spans multiple cohorts, split accordingly.
   - Ensure a **Calendar ID** exists for the cohort:
     - If missing, create the calendar, share it, and record the ID.
   - If the **Event ID** is missing or invalid:
     - Check for duplicates and delete if found.
     - Create a new event; record its ID.
   - If an existing event exists:
     - Update the event details in Google Calendar.
   - Notify Slack of each action.
3. Merge split event IDs as needed.
4. Save the run to **Sync History** and post a summary to Slack.

## 🔐 Integrations & Permissions

### Airtable
- Read/write access via **API Token**.
- Used to store calendar/event IDs and session metadata.

### Google Calendar
- Runs under a **Workspace Service Account** with delegated domain access.  
- Uses OAuth 2.0 scope  
  `https://www.googleapis.com/auth/calendar`.

**Setup summary:**
1. Create a [Google Service Account](https://cloud.google.com/iam/docs/service-accounts-create).  
2. Grant **Owner** access to the Workspace.  
3. Enable [Domain-wide delegation](https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority).  
4. Authorize the Calendar API scope for the service account.  

### Slack
- Notifications sent via **Incoming Webhook URLs**.  
- Each major operation (calendar create, event update, sync summary) posts a structured message.

### Rate-Limiting
- API calls (Airtable, Google, Slack) are throttled with delays set in  
  `settings.ts` to prevent exceeding API quotas.

## 🧑‍💻 Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/uie-com/gcal-sync
cd gcal-sync
```

### 2. Install & Run

```bash
npm install
npm run dev
```

### 3. Environment Variables

Create a `.env.local` file using the values described in  
[the environment documentation](https://www.notion.so/centercentre/GCal-Sync-Utility-21b903316fdd8005932bfc9073fcdcfd).

Typical variables include:

| Key | Description |
|-----|-------------|
| `AIRTABLE_TOKEN` | Airtable API token |
| `GOOGLE_CLIENT_EMAIL` | Service Account email |
| `GOOGLE_PRIVATE_KEY` | Private key for the service account |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook |
| `BASE_URL` | Base URL for your deployment |

### 4. Deployment

The app is deployed to the **CenterCentre Droplet**.  
See [CC Droplet Docs](https://www.notion.so/CC-Droplet-285903316fdd808f9d2def5d7f44c9a8) for production steps.

## 🗂️ Airtable Schema

Field names are **exact** (case-sensitive) and should match verbatim.

### 1) Sessions Table  `(AIRTABLE_TABLE_ID)`

Each record represents **one session occurrence** that becomes one or more Google Calendar events.

**Required fields (read by the sync):**

**Required fields (read by the sync):**

| Field                          | Type                                                | Required | Notes |
|---|---|---|---|
| `Published`               | Single select or Single line text                    | ✅ | Records sync when value is `"Published"` or blank. |
| `Last Modified`           | Last modified time                                   | ✅ | Used to fetch only sessions edited after the last sync. |
| `Date`                    | Date/Time (with timezone)                            | ✅ | Event start; must be valid ISO date-time. |
| `End Date`                | Date/Time (with timezone)                            | ✅ | Event end; must be valid ISO date-time. |
| `Title`                   | Single line text                                     | ✅ | Used as Google Calendar event `summary`. |
| `Description`             | Long text                                            | ✅ | Used as Google Calendar event `description`. |
| `Location`                | Single line text                                     | ✅ | Used as Google Calendar event `location`. |
| `Calendar Name`           | Single line text **or** Lookup/Rollup (array-like)   | ✅ | Required to create calendars and for notifications; supports per-cohort names for split sessions. |
| `Cohort Identifier`       | Link to `Cohorts` table (1+)   | ✅ | First linked record ID is used to fetch/save calendar info. |
| `Program`                 | Single line text or Single select                    | ✅ | Routing logic (e.g., detects `TUXS`); also prepended for central calendar titles. |
| `Cohort`                  | Lookup/Rollup or Multi-select (array-like)           | Required for multi-cohort sessions | Used to split a session across multiple cohorts; length must align with `Cohort Identifier`. |
| `Secondary Title`         | Single line text                                     | Required for TUXS | Used for TUXS Q&A event title. |
| `Secondary Description`   | Long text                                            | Required for TUXS | Used for TUXS Q&A event description. |
| `Secondary End Date`      | Date/Time (with timezone)                            | Required for TUXS | Used for TUXS Q&A event end time. |
| `Color`                   | Number or Single select (Google colorId)             | Optional | Applied when creating/updating **central** events only. |

**Fields written/updated by the sync:**

| Field                          | Type                         | Required | Written When | Value |
|---|---|---|---|---|
| `Event ID`                | Single line text (or Long text) | ⚠️ Yes for write | On create/update | If multiple IDs (split/multi-part), joined with `, ` + space. |
| `Calendar Event Link`     | URL or Single line text          | Optional         | On create/update | Direct link to the Google Calendar event. |
| `Secondary Event ID`      | Single line text                 | Optional         | When TUXS second event is created | Stores the secondary event’s ID. |
| `Has MN Event`            | Single select or Checkbox        | Optional         | On create/update | Set to string `"Yes"` by code when present. |
| `Central Event ID`        | Single line text                 | Optional         | When syncing to central calendar | Mirrors the current event ID for the central calendar. |

**Fetch Filter (as used by the app):**

The sync **only** pulls sessions that are:
- Published (value `"Published"` **or** blank),
- Edited after the **last sync time**, and
- Scheduled after a **1-year cutoff** (to skip old sessions).

Template of the effective filter formula:

```
AND(
  OR({Published} = "Published", {Published} = ""),
  AND(
    IS_AFTER({Last Modified}, "{{LAST_SYNC_ISO}}"),
    IS_AFTER({Date}, "{{ONE_YEAR_CUTOFF_ISO}}")
  )
)
```

> Note: The code paginates through results using Airtable’s `offset` and waits `AIRTABLE_TIMEOUT` ms between calls.

### 2) Cohorts Table  `(AIRTABLE_COHORT_TABLE_ID)`

Each record represents **one cohort**; a Google Calendar is created and stored here.

**Required fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `Cohort` | Single line text | ✅ | Human-readable cohort identifier. '[Program] - [Cohort Name]' |

**Fields written/updated by the sync:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `Calendar ID` | Single line text | ✅ (after first calendar creation) | The app reads this value to attach events to the correct calendar; if absent, the app creates a new calendar and writes the ID here. |

**Recommended formula fields (optional but useful):**

| Field | Type | Formula |
|---|---|---|
| `Public Calendar Link` | Formula → URL | `"https://calendar.google.com/calendar/embed?src=" & {Calendar ID}` |
| `iCal Calendar Link` | Formula → URL | `"https://calendar.google.com/calendar/ical/" & {Calendar ID} & "/public/basic.ics"` |
| `Direct Calendar Link` | Formula → URL | `"https://calendar.google.com/calendar/u/0?cid=" & {Calendar ID}` |

**Session linkage:**

- The Sessions table’s `Cohort Identifier` field should be a **Link to this Cohorts table** (one-to-one recommended).

**Write path used by the app:**

When a new calendar is created, the app writes it back via `PATCH`:

```json
{
  "records": [
    {
      "id": "<COHORT_RECORD_ID>",
      "fields": {
        "Calendar ID": "<new_calendar_id>"
      }
    }
  ]
}
```

### 3) Sync History Table  `(AIRTABLE_SYNC_TABLE_ID)`

Each record represents **one run** of the sync job.

**Required fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `Date` | Date/Time (ISO) | ✅ | The timestamp of this sync run (written by the app). |

**Optional fields (written with `typecast: true`):**

| Field | Suggested Type | Notes |
|---|---|---|
| `Events Edited` | **Multiple select** | The app writes an array (`editedSessions`). Using **Multiple select** with `typecast` lets Airtable auto-create options. |
| `Events Created` | **Multiple select** | The app writes an array (`createdSessions`). |
| `Cohorts Edited` | **Multiple select** | The app writes an array (`editedCohorts`). |

> Why **Multiple select**? The code sends **arrays** for these fields and uses `typecast: true`. Multiple select accepts arrays of strings with typecast, avoiding the need to predefine every option.

**Read path used by the app:**

To find the most recent run:

```
?sort[0][field]=Date&sort[0][direction]=desc&maxRecords=1
```
