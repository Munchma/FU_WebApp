# Bayshore Follow-ups Web App

Static GitHub Pages frontend for entering physio follow-up dates.

## Backend

The backend is the Google Apps Script project attached to the Bayshore Sheet.

1. Paste the current `calendar_sync.gs` into Apps Script.
2. Save.
3. Deploy as a web app.
4. Set access to the narrowest option that works for your Google account setup.
5. Copy the `/exec` web app URL.

## Local Config

Open `config.js` and set:

```js
window.BAYSHORE_CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
};
```

If `config.js` is blank, the app will ask for the URL in the browser and store it in local storage.

## GitHub Pages

Upload the contents of this `webapp` folder to a GitHub repository, then enable Pages for that repository.

The app is static and does not need a build step.
