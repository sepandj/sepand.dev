"""sepand.dev: the index of every *.sepand.dev site.

Every visit appends one link to a hash chain:

    hash_n = SHA-256("sepand.dev/v1" | hash_{n-1} | n | 32 random bytes | time_ns)

The 32 random bytes come from the OS CSPRNG and are kept server-side, so no one
can predict the next state, and two visits can never share one. The page turns
the hash into its art (see static/art.js).

Thresholds: a hash's "rarity" is its number of leading zero bits. When a visit
beats the rarest hash ever seen, a new epoch begins and its hash becomes the
epoch seed that shapes everything after it. Records get exponentially harder to
break, so these drastic changes arrive roughly at doublings of the visit count,
but exactly when is up to chance.
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import timezone
from pathlib import Path

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from psycopg_pool import ConnectionPool

ROOT = Path(__file__).parent
STATIC = ROOT / "static"
DB = os.environ.get("DATABASE_URL", "postgresql://sepandidx@localhost/sepandidx")
PUBLIC = os.environ.get("PUBLIC_URL", "https://sepand.dev")
CACHE = Path(os.environ.get("CACHE_DIR", "/var/cache/sepand-index"))
SELF = os.environ.get("SELF_URL", "http://127.0.0.1:8001")
GENESIS = bytes(32)
ID_RE = re.compile(r"^[0-9a-f]{16}$")
BOTS = re.compile(r"bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|"
                  r"telegram|discord|slack|headless|curl|wget|python|httpx|go-http", re.I)

pool = ConnectionPool(DB, min_size=1, max_size=4, open=False)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")

SCHEMA = """
CREATE TABLE IF NOT EXISTS visits (
    n          bigint PRIMARY KEY,
    hash       bytea  NOT NULL UNIQUE,
    prev       bytea  NOT NULL,
    nonce      bytea  NOT NULL,
    lz         int    NOT NULL,
    epoch      int    NOT NULL,
    epoch_seed bytea  NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_id ON visits (substring(hash from 1 for 8));
CREATE INDEX IF NOT EXISTS visits_lz ON visits (lz);
-- The doors that existed at that visit, and which art engine drew it.
-- Rows from before these columns existed were engine 1 with one door.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS sites jsonb;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS engine int NOT NULL DEFAULT 1;
"""
ENGINE = 3
FIRST_SITES = [{"name": "not alone", "url": "https://notalone.sepand.dev"}]


def current_sites() -> list[dict]:
    """The doors right now, as stored with each visit (name + url only)."""
    raw = json.loads((STATIC / "sites.json").read_text())
    return [{"name": str(s["name"]), "url": str(s["url"])} for s in raw]


def sites_digest(sites: list[dict]) -> bytes:
    canon = json.dumps(sites, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canon.encode()).digest()


@app.on_event("startup")
def _start():
    pool.open()
    with pool.connection() as c:
        c.execute(SCHEMA)
    (CACHE / "og").mkdir(parents=True, exist_ok=True)


def leading_zero_bits(h: bytes) -> int:
    n = 0
    for b in h:
        if b == 0:
            n += 8
            continue
        return n + (8 - b.bit_length())
    return n


COLS = "n, hash, lz, epoch, epoch_seed, created_at, sites, engine"


def public(row) -> dict:
    n, h, lz, epoch, seed, at, sites, engine = row
    sites = sites if sites is not None else FIRST_SITES
    return {
        "n": n, "hash": h.hex(), "id": h[:8].hex(), "lz": lz, "epoch": epoch,
        "epoch_seed": seed.hex(), "when": at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "sites": sites, "sites_digest": sites_digest(sites).hex(), "engine": engine,
    }


def mint() -> dict:
    with pool.connection() as c, c.transaction():
        c.execute("SELECT pg_advisory_xact_lock(4242)")  # one link at a time
        head = c.execute("SELECT n, hash, epoch, epoch_seed FROM visits ORDER BY n DESC LIMIT 1").fetchone()
        rec = c.execute("SELECT COALESCE(MAX(lz), -1) FROM visits").fetchone()[0]
        n, prev, epoch, seed = (head[0] + 1, head[1], head[2], head[3]) if head else (1, GENESIS, 0, GENESIS)
        nonce = secrets.token_bytes(32)
        sites = current_sites()
        # The doors are part of what gets sealed: a new site changes every
        # hash after it.
        h = hashlib.sha256(b"sepand.dev/v2" + prev + n.to_bytes(8, "big") + nonce
                           + time.time_ns().to_bytes(8, "big") + sites_digest(sites)).digest()
        lz = leading_zero_bits(h)
        if lz > rec:  # a new rarity record: the design turns over
            epoch, seed = epoch + 1, h
        row = c.execute(
            "INSERT INTO visits (n, hash, prev, nonce, lz, epoch, epoch_seed, sites, engine) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {COLS}",
            (n, h, prev, nonce, lz, epoch, seed, json.dumps(sites), ENGINE)).fetchone()
    return public(row) | {"record": max(rec, lz)}


def lookup(vid: str) -> dict:
    if not ID_RE.match(vid):
        raise HTTPException(404)
    with pool.connection() as c:
        row = c.execute(
            f"SELECT {COLS} FROM visits WHERE substring(hash from 1 for 8) = %s",
            (bytes.fromhex(vid),)).fetchone()
    if not row:
        raise HTTPException(404)
    return public(row)


# ---- rate limit (single process) ----
_hits: dict[str, deque] = defaultdict(deque)


def limited(ip: str, per_min: int) -> bool:
    q, now = _hits[ip], time.monotonic()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= per_min:
        return True
    q.append(now)
    if len(_hits) > 50_000:
        _hits.clear()
    return False


def client_ip(r: Request) -> str:
    xff = r.headers.get("x-forwarded-for")  # set by Caddy
    return xff.split(",")[0].strip() if xff else (r.client.host if r.client else "")


# ---- routes ----
INDEX = (STATIC / "index.html").read_text()


def _hsl(h: float, s: float, l: float) -> tuple[int, int, int]:
    h %= 1.0
    def f(n):
        k = (n + h * 12) % 12
        a = s * min(l, 1 - l)
        return l - a * max(-1, min(k - 3, 9 - k, 1))
    return tuple(round(f(n) * 255) for n in (0, 8, 4))


def colours(epoch_seed: bytes | None, engine: int) -> str:
    """The paper and ink of a piece, so the very first paint is already the
    right colour (no flash). Mirrors genome() in static/art.js; palette bytes
    0..7 come from the epoch seed alone."""
    if engine == 1 or not epoch_seed:
        bg, ink = (0, 0, 0), (255, 255, 255)
    else:
        u = lambda i: epoch_seed[i] / 255
        hue, dark, bgs = u(3), epoch_seed[4] % 3 == 0, 0.06 + u(5) * 0.1
        bg = _hsl(hue + 0.5, bgs, 0.075 + u(6) * 0.04) if dark else _hsl(hue + 0.08, bgs, 0.9 + u(6) * 0.05)
        ink = _hsl(hue, 0.14 + u(2) * 0.22, 0.72 if dark else 0.3)
    rgb = lambda c: f"rgb({c[0]},{c[1]},{c[2]})"
    return (f'<style>:root{{--ground:{rgb(bg)};--ink:{rgb(ink)}}}</style>'
            f'<meta name="theme-color" content="{rgb(bg)}">')


def page(og: str = "", seed: bytes | None = None, engine: int = ENGINE) -> HTMLResponse:
    return HTMLResponse(INDEX.replace("<!--OG-->", og + colours(seed, engine)),
                        headers={"Cache-Control": "no-store"})


def head_seed() -> bytes | None:
    """Epoch seed the next visit will most likely share."""
    with pool.connection() as c:
        row = c.execute("SELECT epoch_seed FROM visits ORDER BY n DESC LIMIT 1").fetchone()
    return bytes(row[0]) if row else None


def og_tags(title: str, url: str, image: str) -> str:
    return (f'<meta property="og:type" content="website"><meta property="og:title" content="{title}">'
            f'<meta property="og:url" content="{url}"><meta property="og:image" content="{image}">'
            f'<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
            f'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{image}">')


@app.get("/")
def index():
    return page(og_tags("sepand.dev", PUBLIC + "/", PUBLIC + "/og.png"), head_seed())


@app.post("/api/visit")
def visit(request: Request):
    if BOTS.search(request.headers.get("user-agent", "")):
        raise HTTPException(403)
    if limited(client_ip(request), 30):
        raise HTTPException(429)
    return mint()


@app.get("/api/v/{vid}")
def get_visit(vid: str):
    return lookup(vid)


@app.get("/render/{vid}")
def render_page(vid: str):
    v = lookup(vid)
    return page("", bytes.fromhex(v["epoch_seed"]), v["engine"])


# ---- preview images, drawn by the same art code in headless Chromium ----
_browser = None
_render_lock = asyncio.Lock()


async def _render_png(vid: str, w: int, h: int) -> bytes:
    global _browser
    from playwright.async_api import async_playwright
    async with _render_lock:
        if _browser is None or not _browser.is_connected():
            pw = await async_playwright().start()
            _browser = await pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await _browser.new_page(viewport={"width": 400, "height": 300})
        try:
            await pg.goto(f"{SELF}/render/{vid}?w={w}&h={h}", wait_until="load", timeout=20000)
            await pg.wait_for_function("window.__card", timeout=20000)
            data = await pg.evaluate("window.__card")
        finally:
            await pg.close()
    return base64.b64decode(data.split(",", 1)[1])


async def _cached(vid: str) -> Path:
    f = CACHE / "og" / f"{vid}.png"
    if not f.exists():
        png = await _render_png(vid, 1200, 630)
        tmp = f.with_suffix(".tmp")
        tmp.write_bytes(png)
        tmp.replace(f)
    return f


@app.get("/v/{vid}.png")
async def shared_png(vid: str):
    await asyncio.to_thread(lookup, vid)
    return FileResponse(await _cached(vid), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


# Registered after /v/{vid}.png so that route matches first.
@app.get("/v/{vid}")
def shared(vid: str):
    v = lookup(vid)
    return page(og_tags(f"sepand.dev · no. {v['n']:,}", f"{PUBLIC}/v/{vid}", f"{PUBLIC}/v/{vid}.png"),
                bytes.fromhex(v["epoch_seed"]), v["engine"])


@app.get("/og.png")
async def site_png():
    """Preview for the bare domain: the design of the last visit before the
    current hour began, so at most one new render per hour."""
    with pool.connection() as c:
        row = c.execute("SELECT hash FROM visits WHERE created_at < date_trunc('hour', now()) "
                        "ORDER BY n DESC LIMIT 1").fetchone() \
            or c.execute("SELECT hash FROM visits ORDER BY n LIMIT 1").fetchone()
    if not row:
        raise HTTPException(404)
    f = await _cached(row[0][:8].hex())
    return FileResponse(f, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/robots.txt")
def robots():
    return Response("User-agent: *\nAllow: /\nDisallow: /render/\nDisallow: /api/\n", media_type="text/plain")


@app.get("/healthz")
def healthz():
    return {"ok": True}
