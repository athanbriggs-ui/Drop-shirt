# Stance & Motion

A wrestling stance and motion caller. Pick a level and a pace, prop your phone up, and it calls moves out loud while it runs your work and rest intervals. It installs to a phone's home screen and works offline.

## What it does

**Three levels**

| Level | Calls |
| --- | --- |
| 1 | shot, sprawl, down block, shot re-shot |
| 2 | Level 1 plus fake-club-shot, club shot, circle hard left, circle hard right |
| 3 | Level 2 plus named shots (double, single, high crotch, sweep single, low single) and 22 combos |

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

Change the files, then bump `VERSION` at the top of `sw.js` (for example `stance-v2`) so installed phones pick up the new version.

## Files

- `index.html`, `css/app.css`: screens and styling
- `js/data.js`: moves, levels, paces, heart rate and weight maths
- `js/app.js`: timer, voice caller, heart rate monitor, log
- `js/guide.js`: guide text and sources
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and install support

## Safety

Sweating off water weight is risky. The app requires reading the weight cut rules before the first hard session, and it is a training tool, not medical advice.
