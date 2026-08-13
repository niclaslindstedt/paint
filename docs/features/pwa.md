# Installing and offline

Paint is a Progressive Web App: a web page that installs to a home screen or a
dock and runs with no network.

## Installing

Open the app and use your browser's install affordance — "Install app" in
Chromium's address bar, or Share → "Add to Home Screen" on iOS. The installed
app gets its own icon, opens without browser chrome, and paints under the notch
and home indicator on a phone.

## Offline

A service worker precaches the app shell — the JS, CSS, fonts, and icons — on
first visit, so a later launch works with no connection. Drawings live in
localStorage, which needs no network either; a connected cloud backend simply
queues its push until you're back online.

## Updates

Deploys never swap the app under your hands mid-stroke. A new build installs in
the background and parks; the app then raises a "new version is ready" prompt
and applies it when you accept. The sidebar's **Check for updates** row asks for
one on demand.
