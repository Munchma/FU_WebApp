# Bayshore Follow-ups Web App

Static GitHub Pages frontend for entering physio follow-up dates.

Current live features include FU scheduling/clearing, weekly allowance editing, Early D/C, and a Possible Discharges review panel. Possible Discharges is confirm-before-delete and removes only Calendar events linked by Bayshore-managed event IDs.

`Assignment State` is editable in both the Sheet dropdown and every FU web-app patient row. Existing patients migrate to `Regular`; genuinely new patients default to `Provisional / Unknown`. `Coverage`, `PT Assessment Helper`, and `Provisional / Unknown` patients appear in a separate temporary-assignment panel rather than the regular FU workload. Their automatically created FU events are placed at 04:00 with no reminders, while Regular FU events keep the normal pre-09:00 allocation and reminders. Assignment changes are written to both Current Patients and All Patients, and non-regular patients do not enter Possible Discharges.

## Backend

The backend is the Google Apps Script project attached to the Bayshore Sheet.

1. Paste the current `calendar_sync.gs` into Apps Script.
2. Save.
3. Deploy as a web app.
4. Set access to the narrowest option that works for your Google account setup.
5. Copy the `/exec` web app URL.

After any `calendar_sync.gs` change, create a new Apps Script web-app version; saving source alone does not update deployed `/exec` behavior.

### Name-alias safety

The deployed backend compares Procura Client IDs before presenting or confirming a possible discharge. If an inactive typo/alias has the same Client ID as a current patient, it is hidden and confirmation is rejected. This protects the Edward/Edwin correction case. Live verification on 2026-07-20 returned zero possible discharges and excluded both aliases.

## Local Config

Open `config.js` and set:

```js
window.BAYSHORE_CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
};
```

If `config.js` is blank, the app will ask for the URL in the browser and store it in local storage.

## Patient End Date Display

The patient list includes a read-only `End Date` pill sourced from `Current Patients -> Patient End Date`. The Apps Script `patients` action sends this as `patientEndDate`, formatted as a concise date such as `Sep 28, 2026`.

The app has three follow-up states:

- `Needs FU Date`: no future FU date is scheduled, or the last logged FU date has passed.
- `FU Scheduled`: a current/future FU date is logged.
- `Cleared / No Further FU`: PT has indicated no further follow-up is needed.

On each load, the Apps Script backend expires past FU dates silently. It clears the event status/id fields and returns an expired date only as `Last FU`, leaving the editable `Next FU` field blank. Current/future dates appear only under `Next FU`; they are no longer duplicated under `Last FU`.

The `Early D/C` button applies a manual patient end-date override. After explicit confirmation it keeps the historical `All Patients` record, moves the row out of Current Patients, disables the patient's template/order rows, permanently deletes only linked Bayshore-managed visit/FU events on and after the effective date, tombstones those Raw Visits, and immediately rebuilds Daily Plan and mileage. Unrelated Calendar events and visits before the discharge date are untouched. Legacy early-discharge overrides that still have future linked events appear in Possible Discharges as `Early D/C cleanup` cards so they can be finalized safely.

To reverse an override, remove the `Manual End Date Override: YYYY-MM-DD` line from the patient Notes field, set matching `Active?` cells back to `Yes` if needed, then rerun Schedule Check / Refresh Start/End Dates.

For these fields and actions to work on GitHub Pages, deploy the matching `calendar_sync.gs` first, then upload the updated `webapp/app.js`, `webapp/index.html`, and `webapp/styles.css`.

## GitHub Pages

Upload the contents of this `webapp` folder to a GitHub repository, then enable Pages for that repository.

The app is static and does not need a build step.
