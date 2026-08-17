# Set Roulette

A mobile web app that spins up a random YouTube DJ set. Hit **Spin** for a mix at
random, or filter to a genre first — **Riddim Dubstep**, **Hip Hop**, or **Lofi**.

No build step, no dependencies, no backend. It's a static site plus a service worker.

## Running it

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host works. Because every path is relative, it also runs fine from a
subdirectory such as GitHub Pages (`/<repo>/`).

## How the sets get here

Two sources, and the app works with or without the second:

1. **Built-in list** (`src/data/sets.json`) — a hand-picked set of well-known mixes per
   genre. Works immediately, offline, no key.
2. **Live pull** (optional) — add a YouTube Data API key in Settings and tap
   *Pull fresh mixes*. The app searches each genre for long, embeddable videos ordered
   by view count, so the catalog tracks what's actually popular right now. Results are
   tagged **Fresh** and sort above the built-ins.

### Keeping the built-in list honest

A hardcoded video id rots: uploads get deleted, go private, or have embedding switched
off by the uploader. Set Roulette handles that itself, so a spin doesn't dead-end:

- On load, each set is checked against YouTube's public **oEmbed** endpoint (no API key
  needed). That returns the real current title and channel name, so what you see is
  YouTube's own metadata rather than whatever was typed into the JSON file.
- A video answering 401/404 there — deleted, private, or embedding disabled — is retired
  and never offered again.
- If one slips through and the player itself rejects it (error 101/150 and friends), the
  app marks it, says so, and automatically spins to the next set.

So the seed list is a starting point that corrects itself, not a promise.

### Getting an API key

1. Create a project in the [Google Cloud console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3**.
3. Create an API key under *APIs & Services → Credentials*.
4. Paste it into Settings.

The key is stored in `localStorage` on your device only — there's no server to send it
to. A search costs 100 quota units and the free daily allowance is 10,000, so a refresh
of all three genres (300 units) is cheap. If you host this publicly, restrict the key to
your domain in the Cloud console.

## Features

- **Spin** — weighted by nothing, but drawn from a shuffle bag: every set in the pool
  plays once before any repeat, so you don't get the same mix twice in a row.
- **Genre filter** — the whole UI re-themes per genre.
- **Saved** — heart a set while it plays.
- **History** — the last 60 sets you played.
- **Autoplay** — when a set ends, spin straight into the next one.
- **Installable** — a PWA with an offline app shell. Playback naturally needs a network.
- **Privacy-enhanced player** on by default (`youtube-nocookie.com`).

## Layout

```
index.html              markup and the settings sheet
styles/main.css         mobile-first dark theme, per-genre accents
src/app.js              wiring: spin, genre, lists, settings
src/catalog.js          seed list + live results merged into one pool
src/store.js            localStorage state
src/shuffle.js          the shuffle bag
src/player.js           YouTube IFrame API wrapper, unplayable-set handling
src/oembed.js           keyless metadata + liveness checks
src/youtube-api.js      YouTube Data API v3 client (only used with a key)
src/data/sets.json      the built-in set list
sw.js                   offline shell
```

## Adding a genre

Append an entry to `genres` in `src/data/sets.json` — an `id`, `name`, `tagline`,
`emoji`, a `query` used for live search, and a few seed `sets`. The chip row, filtering,
and shuffle pick it up with no code changes. For a matching accent colour, add one line
to `styles/main.css`:

```css
html[data-genre="yourgenre"] { --accent: #…; --accent-2: #…; --accent-ink: #…; }
```

## Notes

All playback happens inside YouTube's official embedded player, so views, ads, and
creator revenue stay with YouTube and the uploaders. The app stores video ids and
metadata, never media.
