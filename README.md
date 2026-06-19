# Rare Yes Tracker

A mobile-first English-language PWA for iPhone that logs rare yes/no events into Google Sheets through a Google Apps Script Web App.

The product idea is intentionally neutral: the calendar can stay mostly empty, and you log a clear “yes, this happened” only when an event happens.

## What is included

```text
rare-yes-tracker/
├── apps-script/
│   └── Code.gs
├── frontend/
│   ├── app.js
│   ├── config.js
│   ├── index.html
│   ├── manifest.json
│   ├── styles.css
│   ├── sw.js
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
└── README.md
```

## Features

### Today

- Big colorful buttons for active habits/events.
- One tap logs a yes event for today.
- The same habit can be logged multiple times in one day. After the first event, the button explicitly says `+ Add another yes event`.
- Shows today’s logged events.
- Events can be edited: date and optional comment.
- Events can be deleted with soft deletion.

### Calendar

- Monthly calendar view.
- Event days show colored dots.
- Multiple events on one day are visible with multiple dots and a `+N` overflow marker.
- Tapping a day shows all events for that day.
- Archived habits remain visible in history.

### Stats

- Period selector: 7 days, 30 days, current month, previous month, custom range.
- For each habit/event:
  - event count in selected period
  - comparison with previous equal period
  - last logged date
  - current quiet-day streak without this event
  - longest quiet-day streak in the selected period
- Simple built-in charts:
  - bar chart by habit
  - heatmap/monthly summary
  - comparison chart

### Habits

- Add habits/events.
- Edit name, including emoji.
- Pick color from visual palette/color names.
- Archive habits instead of hard-deleting.
- Restore archived habits.
- Archived habits disappear from today’s logging buttons but remain in calendar/history/stats.

## Google Sheets schema

Create a Google Sheet. The script can create and seed the sheets for you.

### `habits`

| id | name | color_name | color_value | is_active | created_at | archived_at |
|---|---|---|---|---|---|---|

### `events`

| id | date | habit_id | comment | created_at | updated_at | deleted_at |
|---|---|---|---|---|---|---|

`deleted_at` is used for soft deletion. Calendar and stats ignore deleted events.

## Backend setup: Google Apps Script

1. Create a new Google Sheet.
2. Open **Extensions → Apps Script**.
3. Delete any starter code.
4. Paste the contents of `apps-script/Code.gs`.
5. Save the project.
6. In Apps Script, run the `setup` function once. Approve permissions.
7. Deploy:
   - **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Copy the Web App URL ending in `/exec`.

The first `setup` run creates the two sheets and seeds the initial habits/events:

- ☕ Coffee
- 🍷 Alcohol
- 🥴 Got drunk
- ⚡ Episode
- 🪫 No-energy day
- 🍽️ Heavy overeating

## Frontend setup: GitHub Pages

1. Create a GitHub repository.
2. Upload the contents of the `frontend` folder.
3. Edit `config.js` and replace the placeholder with your Apps Script Web App URL:

```js
const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

4. Commit and push.
5. In GitHub, open **Settings → Pages**.
6. Set the source branch/folder.
7. Open the GitHub Pages URL on your iPhone.
8. In Safari, tap **Share → Add to Home Screen**.

## API actions

Apps Script Web Apps support `doGet` and `doPost`; they do not expose true `doPatch`/`doDelete` functions. This implementation keeps the requested semantics through action-based routing.

### GET

- `GET_HABITS`
- `GET_EVENTS`
- `HEALTH`

### POST action body

- `POST_EVENT`
- `PATCH_EVENT`
- `DELETE_EVENT`
- `POST_HABIT`
- `PATCH_HABIT`
- `ARCHIVE_HABIT`
- `RESTORE_HABIT`

Example body:

```json
{
  "action": "POST_EVENT",
  "date": "2026-06-19",
  "habit_id": "...",
  "comment": "optional"
}
```

The frontend sends JSON as `text/plain` to avoid browser CORS preflight issues with Apps Script Web Apps.

## Notes

- No authentication is implemented.
- Anyone with the app link and Apps Script URL can read/write the sheet.
- Do not publish sensitive data in this setup.
- Habit deletion is archive/deactivate only.
- Event deletion is soft deletion using `deleted_at`.

## Performance update

This version uses optimistic UI updates for the slow Google Apps Script + Google Sheets path:

- Logging an event appears immediately on screen.
- Editing an event appears immediately.
- Deleting an event disappears immediately, while the backend soft-deletes it.
- Adding, editing, archiving, and restoring habits updates the UI immediately.
- If the backend request fails, the UI rolls the change back and shows an error toast.

The Apps Script write may still take several seconds, but the app no longer blocks the interface while it waits for Google Sheets.

The service worker cache name was bumped to `rare-yes-v2` and changed to network-first for app files, so GitHub Pages updates are less likely to get stuck behind the PWA cache.

## Fast v3 fixes

- Fixed the calendar date offset bug on positive time zones by formatting dates locally instead of converting local midnight through UTC.
- Added an **Add** button on the Calendar day detail panel, so you can pick a past date, choose an active habit/event, add an optional comment, and save it with the same instant optimistic UI.
- Service worker cache was bumped to `rare-yes-v3`; after upload, refresh/reinstall the PWA if old files keep showing.

## v4 notes

- Fixed a JavaScript syntax issue in the calendar add-event form.
- Event cards now show Delete directly next to Edit.
- Service worker cache is `rare-yes-v4`.
