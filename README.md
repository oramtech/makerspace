# ME Makerspace website

Landing page for the Undergraduate Projects Workshop, Faculty of Mechanical Engineering.
Plain HTML, CSS and JavaScript: no build step, nothing to install, no external requests.

## Put it on GitHub Pages

1. Create a repository and upload everything in this folder (keep the folder structure).
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` and `/ (root)`.
3. The site appears at `https://<user>.github.io/<repository>/` a minute later.

To preview locally, run `python3 -m http.server` in this folder and open http://localhost:8000.

## What is where

```
index.html                 the landing page (all the text lives here)
he/index.html              the Hebrew landing page (right-to-left), same assets
assets/css/main.css        colours, type, layout
assets/js/room.js          the 3D room, built from the architect's plan
assets/js/main.js          scrolling, the tour, minimap, auto-fly, photo viewer
assets/img/                photos (WebP, two sizes) and the plan drawing
assets/fonts/, vendor/     self-hosted fonts and three.js
docs/                      safety sheets and instructions (PDF) go here
```

## Things to fill in

- **Two languages.** `index.html` is English and `he/index.html` is Hebrew; the button in the header switches between them.
  A change to one page has to be made in the other by hand.
- **Safety sheets and instructions.** Fourteen draft PDFs are in `docs/`, and their Hebrew versions in `docs/he/`. They need the engineer's review: see `docs/README.md`.
- **Links marked `data-soon`.** The Workshops and Nitai pages are not built yet.
  Any link carrying a `data-soon="…"` attribute shows that message instead of navigating. Delete the attribute
  once the page or file exists.
- **Workshops.** The three sessions on the landing page are placeholder topics with "Date to be announced".
- **Nitai.** The section shows initials. To use a photo, replace the `<div class="person__tile">` with an `<img>`.
- **Opening hours.** 08:00–15:00, shown in the hero, the footer and the PDFs. Days, location and contact details are not on the page yet.

## The domain

The site is served at `https://techmakerspace.com/`. The `CNAME` file in this folder tells GitHub Pages which domain to use,
so keep it. The domain is registered at Cloudflare, where four `A` records point the bare domain at GitHub Pages
and a `CNAME` record points `www` at `<account>.github.io`. If the repository moves to another account, update that `www` record.

## After you change CSS or JavaScript

Both pages load `main.css`, `room.js` and `main.js` with a version stamp, for example `main.css?v=1a2b3c4d`.
Browsers keep these files for a while, so after editing one of them change the stamp to any new value
in `index.html` and `he/index.html`. Otherwise visitors may go on seeing the old version.

## Editing the 3D room

`assets/js/room.js` is commented. Units are metres, measured off the architect's plan
(the room is 5.80 × 14.31 m). Two things you are most likely to touch:

- `STOPS` at the top: the ten camera positions of the tour (`p` is where the camera sits, `t` what it looks at).
  The order must match the ten `<li class="stop">` cards in `index.html`.
- `buildRoom()`: every bench, machine and cabinet. Move a machine by changing its coordinates there.

The opening sequence, the slow circling and the auto-fly are all switched off for visitors who have
"reduce motion" turned on, and the page falls back to a photo where WebGL is unavailable.
