# Stance & Motion

A wrestling stance and motion caller. Pick a level and a pace, prop your phone up, and it calls moves out loud while it runs your work and rest intervals. It installs to a phone's home screen and works offline.

## What it does

**Three levels**

| Level | Calls |
| --- | --- |
| 1 | shot, sprawl, down block, shot re-shot |
| 2 | Level 1 plus fake-club-shot, club shot, circle hard left, circle hard right |
| 3 | Level 2 plus named shots (double, single, high crotch, sweep single, low single) and 15 combos |

**Three paces**

| Intensity | Name | Default | Calls | Target heart rate |
| --- | --- | --- | --- | --- |
| Easy | Warm up | 6 × 30s on / 30s off | every 4–6 s | 60–75% of max |
| Medium | Conditioning | 12 × 30s on / 30s off | every 2–4 s | 80–90% of max |
| Hard | Weight cut (water loss) | 20 × 40s on / 20s off | nearly back to back | 85–95% of max |

Work, rest and rounds can all be changed. Turn off **Call moves** to use it as a plain interval timer.

**Also**

- Voice calls, whistle beeps and a 3-2-1 countdown; the screen stays awake during a session.
- Heart rate zones from your age (208 − 0.7 × age), with heart rate reserve zones if you add a resting heart rate.
- Tap-along pulse counter, and live heart rate from a Bluetooth chest strap (Chrome on Android or desktop).
- Weight before and after for weight cut sessions, with the percent lost, a warning past 2%, and how much to drink back.
- A log of every finished session, saved on the device.
- **Nudges:** on days with no session yet, the app calls you out when you open it, when the phone has sat still for 20 minutes with the app open, and (Chrome on Android, installed) through background notifications. You pick the hours and how often.
- A guide tab with the research behind the numbers and links to the sources.

## Put it online (GitHub Pages)

The app is plain HTML, CSS and JavaScript with no build step.

1. Get these files onto the `main` branch.
2. In the repository, open **Settings → Pages**. Under **Branch**, choose `main` and `/ (root)`, then **Save**.
3. A minute later it is live at `https://athanbriggs-ui.github.io/Drop-shirt/`.

## Install it as an app

- **Android:** open the site in Chrome, tap ⋮, then **Add to Home screen → Install**.
- **iPhone:** open the site in Safari, tap Share, then **Add to Home Screen**.

After the first visit it works with no connection.

## Updating

Change the files, then bump `VERSION` at the top of `sw.js` (for example `stance-v5`) so installed phones pick up the new version.

## Coach voice

Recorded coach lines replace the phone's built-in voice. Each of the 34 lines the app can say is one file in `audio/`, named after the spoken text in lowercase with dashes (`Shot, re-shot` → `audio/shot-re-shot.mp3`), and listed in `js/clips.js`. To add a new call, add the move in `js/data.js`, upload its mp3, add the name to `js/clips.js`, and bump `VERSION` in `sw.js`. If any line has no recording the app falls back to the phone's voice.

## Look

The interface is plain grey. Picking a level tints the whole app slightly: blue for Level 1, green for Level 2, red for Level 3.

## What nudges cannot do

A website app cannot see which other apps are open, cannot tell when the screen turns on, and cannot read the motion sensor while it is closed. Catching someone on social media needs a store-installed Android app with the Usage Access permission.

## Files

- `index.html`, `css/app.css`: screens and styling
- `js/data.js`: moves, levels, paces, heart rate and weight maths
- `js/app.js`: timer, voice caller, heart rate monitor, log
- `js/guide.js`: guide text and sources
- `js/clips.js`, `audio/`: recorded coach lines
- `sw.js`, `manifest.webmanifest`, `icons/`: offline, install and background nudges

## Safety

Sweating off water weight is risky. The app requires reading the weight cut rules before the first hard session, and it is a training tool, not medical advice.
