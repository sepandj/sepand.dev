# sepand.dev

The index of every `*.sepand.dev` site. Each visit adds one link to a SHA-256
hash chain (previous hash + visit number + 32 CSPRNG bytes + time), and the page
draws that hash as a looping WebGL piece that belongs to that visit alone.

- **Epochs:** a hash's rarity is its count of leading zero bits. A visit that
  beats the rarest hash so far starts a new epoch; its hash becomes the seed
  for the structure (symmetry, space, fields, palette). Drastic changes come
  roughly at doublings of the visit count, at moments chance decides.
- **Growth:** layers, cells and wave sources grow with log2(visits).
- **Loop:** all motion uses whole-number multiples of one angle, so it repeats
  exactly every 24 s and a visit's state never drifts.
- **Sharing:** `keep` saves a card, `share` sends it with a link to `/v/<id>`,
  which replays that visit. Link previews are drawn by the same `art.js` in
  headless Chromium (`/v/<id>.png`).
- **Sites:** add an entry to `static/sites.json`.

Runs in the not-alone container as user `sepandidx` (`deploy/sepand-index.service`,
port 8001), database `sepandidx`, behind Caddy (`deploy/Caddyfile.snippet`).
