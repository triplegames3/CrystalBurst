# Crystal Burst — deploy notes

## What was actually broken
The stats/score system was wired up to **CountAPI** (`api.countapi.xyz`),
which shut down. That's why nothing was persisting or updating — it wasn't
your file, it was the third-party service being dead. There was also no
in-game stats button, and stats were being re-fetched from scratch on every
page load with no caching.

## What's here now
- `index.html` — your game, with the CountAPI calls replaced by calls to
  `/api/stats` (a Netlify Function backed by **Netlify Blobs**, which is
  free, built into Netlify, and needs zero external signup/API keys).
- `netlify/functions/stats.js` — the backend. Tracks total players
  (all-time), players active in the last 5 minutes, and the global high
  score + who holds it.
- `netlify.toml` / `package.json` — deploy config so the function bundles
  correctly and `/api/*` routes to it.

## How to deploy
1. Drop this whole folder (not just the HTML file) into Netlify — either
   drag-and-drop the folder in the Netlify UI, or connect it as a repo.
   Netlify will run `npm install` automatically to pull in `@netlify/blobs`.
2. That's it — no accounts, API keys, or config needed. Netlify Blobs
   auto-provisions per-site once deployed.

## Player identity — read this part
There's no login system. A player's identity is their **nickname**, stored
in their browser and sent to the server. This is what makes your requirement
work — *"even after clearing history, keep the progress"* — because as long
as someone re-types the same nickname, the server hands back that nickname's
saved high score, regardless of what's in their local storage.

The trade-off: nicknames aren't password-protected. Anyone who types the
same name as an existing player is that player, as far as the server's
concerned — someone could accidentally (or deliberately) end up "sharing"
a name with someone else's score. For a casual/indie leaderboard that's a
reasonable trade; if you ever want real accounts, that's a bigger feature
(actual auth) I didn't build here.

Also worth knowing: because all the game logic runs in the browser, a
determined player could tamper with the score before it's submitted —
there's no server-side validation of gameplay. Not fixed here; that would
mean re-architecting the game to be server-authoritative, which is a much
bigger job than what was asked.

## In-game stats
There's now a small 📊 button in the top-right corner while playing (next
to shuffle/sound), opening the same stats panel as the main menu. Taps on
the board are ignored while it's open.

## Refresh cadence (to address the performance concern)
- Stats are cached client-side for 20 seconds — reopening the panel
  repeatedly won't spam the backend.
- A "heartbeat" (which is what keeps you counted as an active player and
  pulls back your server-known high score) fires: once on page load, once
  when you hit Play, and once when you return to the tab after it's been
  hidden — not continuously during gameplay.
