# Drop Studio

3D clothing mockups on your phone. Put your art on a garment, see it from every side, and export the photos, videos and colorway sheets you need to show a drop before it's made. No account, no subscription, works offline once it's installed.

## What it does

- **Garments:** T-shirt, oversized tee, long sleeve, crewneck, hoodie (hood, drawstrings, kangaroo pocket) and tank top, each with real collars, ribbed cuffs and hems, and hem stitching.
- **Fabric and wash:** jersey cotton, heavyweight or fleece; clean, vintage wash or acid wash. 25 apparel colors (heather grays have a real heather texture) or any custom color.
- **Your art:** add PNG, JPG, SVG or WebP files and text. Put art on the front or back, then drag it on the shirt to move it and pinch to resize and turn. Placement presets for center chest, left chest, full front, upper back, full back, sleeve and lower hem. Size shows the real print width in inches.
- **Print finishes:** screen print, puff (raised), embroidery (satin stitch texture) and distressed (cracked vintage print).
- **Image tools:** remove a plain background (the white box around a logo is cleared automatically), recolor a one-color logo to any ink color, flip.
- **Text:** 9 fonts including heavy condensed, gothic blackletter, marker and script; ink color, outline, letter spacing and curved (arched) text.
- **Scene:** 8 backdrops plus custom color or transparent; studio, dramatic, sunlight and catalog lighting; shadow on the floor, on a wall or none. Front, back, angle, side and close-up views, plus a slow spin.
- **Export:** photos (square, 4:5, 9:16 story, 16:9) up to 2560 px with optional transparent background; turntable, sway, front-to-back and push-in videos (MP4 on Chrome); and a colorway sheet showing your design in up to 6 colors. Share straight to Instagram, TikTok or Messages from the share sheet, or save to the device.
- **Designs:** every change is saved on the device. Keep as many designs as you like, duplicate them, and pick up where you left off. Undo and redo.

## Put it on GitHub (same as Macro Lens)

1. Unzip `drop-studio.zip` on your computer.
2. On github.com, click **+ → New repository**, name it `Drop-Studio`, keep it **Public**, and click **Create repository**.
3. Click **uploading an existing file**, then drag **everything inside** the unzipped `drop-studio` folder (the `index.html` file and the `css`, `fonts`, `icons`, `js` and `vendor` folders) into the page. Click **Commit changes**.
4. Open **Settings → Pages**. Under **Branch**, pick `main` and `/ (root)`, then **Save**.
5. After a minute the app is live at `https://YOUR-USERNAME.github.io/Drop-Studio/` (for the account that has Macro Lens: `https://athanbriggs-ui.github.io/Drop-Studio/`).

## Install on Android

Open the site in Chrome, tap the ⋮ menu, then **Add to home screen → Install**. It opens full screen like any app and works without a connection. There's also an **Install** button at the bottom of the Export tab when Chrome offers it.

## Updating it later

Change the files, then bump `VERSION` at the top of `sw.js` (for example `dropstudio-v2`) so phones pick up the new version. Open the app twice to load it.

## Selling it

It's named Drop Studio rather than Mockwear so you can publish it without using someone else's brand. To list it on Google Play later, the live GitHub Pages site can be wrapped as an Android app with [PWABuilder](https://www.pwabuilder.com) (free; Google charges a one-time $25 developer fee).

## Credits

- 3D: [three.js](https://threejs.org) r186 (MIT), bundled in `vendor/three/`.
- Triangulation: [Delaunator](https://github.com/mapbox/delaunator) (ISC), bundled in `vendor/`.
- Fonts (SIL Open Font License, copies in `fonts/licenses/`): Anton, Bebas Neue, Archivo Black, UnifrakturMaguntia, Permanent Marker, Pacifico, Playfair Display, Rubik Mono One, Space Mono, Big Shoulders Display and Instrument Sans, via [Fontsource](https://fontsource.org).
- Garment shapes are generated in code: each flat pattern is filled with a triangle mesh and inflated with a Poisson solve, so sleeves and body get natural rounded volume.

Video recording uses the browser's built-in recorder: Chrome on Android and desktop Chrome save MP4, some other browsers save WebM, and a few can't record (photos and colorway sheets still work there).
