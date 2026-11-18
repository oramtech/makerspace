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
assets/css/main.css        colours, type, layout
assets/js/room.js          the 3D room, built from the architect's plan
assets/js/main.js          scrolling, the tour, minimap, auto-fly, photo viewer
assets/img/                photos (WebP, two sizes) and the plan drawing
assets/fonts/, vendor/     self-hosted fonts and three.js
docs/                      safety sheets and instructions (PDF) go here
```

## Things to fill in

- **Safety sheets and instructions.** See `docs/README.md` for the file names the page expects.
- **Links marked `data-soon`.** The Workshops and Nitai pages are not built yet, and the PDFs are not uploaded.
  Any link carrying a `data-soon="…"` attribute shows that message instead of navigating. Delete the attribute
  once the page or file exists.
- **Workshops.** The three sessions on the landing page are placeholder topics with "Date to be announced".
- **Nitai.** The section shows initials. To use a photo, replace the `<div class="person__tile">` with an `<img>`.
- **Opening hours, location, contact.** Not on the page yet because they were not supplied.

## Editing the 3D room

`assets/js/room.js` is commented. Units are metres, measured off the architect's plan
(the room is 5.80 × 14.31 m). Two things you are most likely to touch:

- `STOPS` at the top: the ten camera positions of the tour (`p` is where the camera sits, `t` what it looks at).
  The order must match the ten `<li class="stop">` cards in `index.html`.
- `buildRoom()`: every bench, machine and cabinet. Move a machine by changing its coordinates there.

The opening sequence, the slow circling and the auto-fly are all switched off for visitors who have
"reduce motion" turned on, and the page falls back to a photo where WebGL is unavailable.
