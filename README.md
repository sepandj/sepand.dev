# sepand.dev

The index of every `*.sepand.dev` site. Each visit adds one link to a SHA-256
hash chain (previous hash + visit number + 32 CSPRNG bytes + time + the
fingerprint of the current list of sites), and the page draws that hash as a
drawing of the whole history: every visit ever made is one thread, drawn
oldest first, with this visit's thread last and brightest.

- **Epochs:** a hash's rarity is its count of leading zero bits. A visit that
  beats the rarest hash so far starts a new epoch; its hash becomes the seed
  for the structure (symmetry, space, fields, palette). Drastic changes come
  roughly at doublings of the visit count, at moments chance decides.
- **Growth:** one thread per visit, so visit 500 really holds 500 threads.
  Each thread follows the currents of the era it was born in (curl swirls,
  spirals, steady currents, cells or blooms), in that era's palette and stroke
  (solid, beads, dashes, double). `/api/chain/<n>` serves the history compactly.
- **Loop:** all motion uses whole-number multiples of one angle, so it repeats
  exactly every 24 s and a visit's state never drifts.
- **Sharing:** `keep` saves a card, `share` sends it with a link to `/v/<id>`,
  which replays that visit. Link previews are drawn by the same `art.js` in
  headless Chromium (`/v/<id>.png`).
- **Doors:** every site in `static/sites.json` is a quiet circle the lines bend
  around, and the circle is the link. The list is stored with each visit and
  its fingerprint is folded into the structure, so adding a site changes every
  piece that follows while older links still replay as they were.
- **Engines:** each visit records the engine that drew it and is always drawn
  by it: 1 = filled colour (`art-v1.js`), 2 and 3 = single line fields
  (`art-v2.js`, `art-v3.js`), 4 = the history of threads (`art-v4.js`),
  5 = the history woven live, in ribbons with colour washes (`art.js`).

Runs in the not-alone container as user `sepandidx` (`deploy/sepand-index.service`,
port 8001), database `sepandidx`, behind Caddy (`deploy/Caddyfile.snippet`).
