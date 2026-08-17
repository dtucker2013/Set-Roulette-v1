// Set Roulette — app wiring.

import { store } from './store.js';
import { loadSeed, genres, genreById, setsFor, findSet, refreshLive } from './catalog.js';
import { hydrate, hydrateAll } from './oembed.js';
import { draw, reset as resetBag } from './shuffle.js';
import * as playerApi from './player.js';

const $ = (id) => document.getElementById(id);

const el = {
  html: document.documentElement,
  genres: $('genres'),
  frame: $('frame'),
  frameMsg: $('frame-msg'),
  npGenre: $('np-genre'),
  npTitle: $('np-title'),
  npChannel: $('np-channel'),
  spin: $('spin'),
  fav: $('fav'),
  ytLink: $('yt-link'),
  sets: $('sets'),
  listTitle: $('list-title'),
  listEmpty: $('list-empty'),
  tabs: document.querySelectorAll('.tab'),
  sheet: $('sheet'),
  backdrop: $('sheet-backdrop'),
  apiKey: $('api-key'),
  liveStatus: $('live-status'),
  refreshLive: $('refresh-live'),
  optAutoplay: $('opt-autoplay'),
  optNocookie: $('opt-nocookie'),
  clearData: $('clear-data'),
};

let current = null;         // currently loaded set
let view = 'browse';        // browse | saved | history
let playerReady = false;
let skips = 0;              // consecutive unplayable sets, so we never loop forever

const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/* ---------------- boot ---------------- */

async function boot() {
  try {
    await loadSeed();
  } catch (err) {
    el.npTitle.textContent = 'Could not load the set list';
    el.npChannel.textContent = err.message;
    return;
  }

  renderGenreChips();
  restoreSettings();
  setGenre(store.get('genre') || 'all', { silent: true });

  el.spin.addEventListener('click', spin);
  el.fav.addEventListener('click', toggleFav);
  el.tabs.forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  wireSettings();

  // Fill in real titles/channels in the background and retire anything dead.
  const ids = setsFor('all').map((s) => s.id);
  hydrateAll(ids, () => renderList()).then(renderList);

  registerServiceWorker();
}

/* ---------------- genres ---------------- */

function renderGenreChips() {
  const frag = document.createDocumentFragment();
  for (const g of genres()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.genre = g.id;
    b.textContent = `${g.emoji} ${g.name}`;
    frag.appendChild(b);
  }
  el.genres.appendChild(frag);
  el.genres.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) setGenre(chip.dataset.genre);
  });
}

function setGenre(id, { silent = false } = {}) {
  store.set('genre', id);
  el.html.dataset.genre = id;
  resetBag();

  for (const chip of el.genres.querySelectorAll('.chip')) {
    chip.classList.toggle('is-active', chip.dataset.genre === id);
  }

  if (view === 'browse') renderList();
  if (!silent) renderList();
}

function currentGenre() {
  return store.get('genre') || 'all';
}

/* ---------------- spinning & playback ---------------- */

async function spin() {
  const pool = setsFor(currentGenre());
  if (!pool.length) {
    message('No sets left in this genre — try another, or pull fresh mixes from Settings.');
    return;
  }

  el.frame.classList.add('is-spinning');
  el.spin.classList.add('is-spinning-btn');
  el.spin.disabled = true;

  const next = draw(currentGenre(), pool, current?.id);

  // A short spin makes it feel like a roulette rather than a button.
  await new Promise((r) => setTimeout(r, 420));

  el.frame.classList.remove('is-spinning');
  el.spin.classList.remove('is-spinning-btn');
  el.spin.disabled = false;

  if (next) playSet(next);
}

async function playSet(set) {
  current = set;
  clearMessage();

  el.npGenre.textContent = set.genreName;
  el.npTitle.textContent = set.title;
  el.npChannel.textContent = set.channel || '';
  el.ytLink.href = `https://www.youtube.com/watch?v=${set.id}`;
  el.ytLink.hidden = false;
  el.fav.disabled = false;
  el.fav.setAttribute('aria-pressed', String(store.has('favorites', set.id)));

  el.frame.classList.add('is-playing');
  store.pushHistory(set.id);

  if (!playerReady) {
    playerReady = true;
    await playerApi.init({
      onEnd: () => { if (store.get('autoplay')) spin(); },
      onPlaying: () => { skips = 0; },
      onUnplayable: handleUnplayable,
    });
  }
  playerApi.play(set.id);

  // Correct the title from YouTube itself if we were working from a seeded guess.
  hydrate(set.id).then((meta) => {
    if (!meta || current?.id !== set.id) return;
    el.npTitle.textContent = meta.title;
    el.npChannel.textContent = meta.channel;
    renderList();
  });

  renderList();
}

function handleUnplayable(id, code) {
  const reason = code === 101 || code === 150 ? "can't be played outside YouTube" : 'is unavailable';
  skips += 1;
  renderList();

  if (skips >= 4) {
    message(`Several sets in a row ${reason}. Try another genre, or add an API key in Settings to pull fresh ones.`);
    skips = 0;
    return;
  }
  message(`That set ${reason} — spinning again…`);
  setTimeout(spin, 700);
}

function message(text) {
  el.frameMsg.textContent = text;
  el.frameMsg.hidden = false;
}

function clearMessage() {
  el.frameMsg.hidden = true;
  el.frameMsg.textContent = '';
}

function toggleFav() {
  if (!current) return;
  const on = store.toggleInList('favorites', current.id);
  el.fav.setAttribute('aria-pressed', String(on));
  if (view === 'saved') renderList();
}

/* ---------------- list ---------------- */

function setView(next) {
  view = next;
  for (const t of el.tabs) {
    const active = t.dataset.view === next;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  }
  el.listTitle.textContent = { browse: 'Up next', saved: 'Saved sets', history: 'Recently played' }[next];
  renderList();
}

function listItems() {
  if (view === 'browse') return setsFor(currentGenre());

  const key = view === 'saved' ? 'favorites' : 'history';
  return (store.get(key) || []).map((id) => findSet(id) || fallbackSet(id)).filter(Boolean);
}

// A saved/played set whose genre is filtered out, or that came from a live pull
// that has since been replaced, still deserves a row.
function fallbackSet(id) {
  const meta = store.getMeta(id);
  if (!meta) return null;
  return { id, title: meta.title, channel: meta.channel, genreId: '', genreName: '' };
}

function renderList() {
  const items = listItems();
  el.sets.replaceChildren();

  if (!items.length) {
    el.listEmpty.hidden = false;
    el.listEmpty.textContent = {
      browse: 'No sets here yet.',
      saved: 'Tap the heart while a set plays to save it.',
      history: 'Sets you play show up here.',
    }[view];
    return;
  }
  el.listEmpty.hidden = true;

  const dead = new Set(store.get('dead') || []);
  const frag = document.createDocumentFragment();

  for (const s of items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'set';
    btn.classList.toggle('is-current', current?.id === s.id);
    btn.classList.toggle('is-dead', dead.has(s.id));

    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = thumb(s.id);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    // Offline, or a thumbnail that 404s: show an empty tile, not a broken-image glyph.
    img.addEventListener('error', () => img.classList.add('is-blank'), { once: true });

    const body = document.createElement('div');
    body.className = 't-body';

    const title = document.createElement('p');
    title.className = 't-title';
    title.textContent = s.title;

    const sub = document.createElement('p');
    sub.className = 't-sub';
    sub.textContent = dead.has(s.id)
      ? 'Unavailable'
      : [s.channel, s.genreName].filter(Boolean).join(' · ');

    body.append(title, sub);
    btn.append(img, body);

    if (s.from || s.live) {
      const badge = document.createElement('span');
      badge.className = 't-badge';
      badge.textContent = s.from || 'Fresh';
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => playSet(s.genreName ? s : { ...s, genreName: 'Set Roulette' }));
    li.appendChild(btn);
    frag.appendChild(li);
  }
  el.sets.appendChild(frag);
}

/* ---------------- settings ---------------- */

function restoreSettings() {
  el.apiKey.value = store.get('apiKey') || '';
  el.optAutoplay.checked = !!store.get('autoplay');
  el.optNocookie.checked = !!store.get('nocookie');

  const live = store.get('live');
  if (live?.fetchedAt) {
    el.liveStatus.textContent = `Last pull: ${new Date(live.fetchedAt).toLocaleString()}`;
  }

  const followed = genres().flatMap((g) => (g.channels || []).map((c) => c.name));
  if (followed.length) {
    $('following').textContent = `Following: ${followed.join(' · ')} — their newest sets are pulled in first.`;
  }
}

function openSheet(open) {
  el.sheet.hidden = !open;
  el.backdrop.hidden = !open;
  if (open) el.apiKey.focus({ preventScroll: true });
}

function wireSettings() {
  $('settings-open').addEventListener('click', () => openSheet(true));
  $('sheet-close').addEventListener('click', () => openSheet(false));
  el.backdrop.addEventListener('click', () => openSheet(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.sheet.hidden) openSheet(false);
  });

  el.apiKey.addEventListener('change', () => store.set('apiKey', el.apiKey.value.trim()));
  el.optAutoplay.addEventListener('change', () => store.set('autoplay', el.optAutoplay.checked));
  el.optNocookie.addEventListener('change', () => {
    store.set('nocookie', el.optNocookie.checked);
    el.liveStatus.textContent = 'Player host changes on next reload.';
  });

  el.refreshLive.addEventListener('click', async () => {
    const key = el.apiKey.value.trim();
    store.set('apiKey', key);
    if (!key) {
      el.liveStatus.textContent = 'Add a YouTube Data API key first — see the README for how to get one.';
      return;
    }
    el.refreshLive.disabled = true;
    try {
      const { total, problems } = await refreshLive(key, (msg) => { el.liveStatus.textContent = msg; });
      resetBag();
      el.liveStatus.textContent = problems.length
        ? `Pulled ${total} mixes. ${problems.join(' ')}`
        : `Pulled ${total} mixes.`;
      renderList();
      hydrateAll(setsFor('all').map((s) => s.id), () => {}).then(renderList);
    } catch (err) {
      el.liveStatus.textContent = err.message;
    } finally {
      el.refreshLive.disabled = false;
    }
  });

  el.clearData.addEventListener('click', () => {
    store.clear();
    location.reload();
  });
}

/* ---------------- pwa ---------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline shell is a nicety */ });
}

boot();
