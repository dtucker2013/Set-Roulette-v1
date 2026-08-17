// Catalog: seed list from sets.json, optionally overlaid with live YouTube search results.

import { store } from './store.js';
import { searchMixes } from './youtube-api.js';

let seed = null;

export async function loadSeed() {
  if (seed) return seed;
  const res = await fetch('./src/data/sets.json');
  if (!res.ok) throw new Error(`Could not load set list (${res.status})`);
  seed = await res.json();
  return seed;
}

export function genres() {
  return seed ? seed.genres : [];
}

export function genreById(id) {
  return genres().find((g) => g.id === id) || null;
}

/** All sets for a genre id, or every set when id is 'all'. Live results come first. */
export function setsFor(genreId) {
  const live = store.get('live');
  const dead = new Set(store.get('dead') || []);
  const pick = genreId === 'all' ? genres() : genres().filter((g) => g.id === genreId);

  const out = [];
  const seen = new Set();

  for (const g of pick) {
    const liveSets = (live && live.genres && live.genres[g.id]) || [];
    for (const s of [...liveSets, ...g.sets]) {
      if (seen.has(s.id) || dead.has(s.id)) continue;
      seen.add(s.id);
      const cached = store.getMeta(s.id);
      out.push({
        id: s.id,
        title: cached?.title || s.title,
        channel: cached?.channel || s.channel || '',
        genreId: g.id,
        genreName: g.name,
        live: liveSets.some((l) => l.id === s.id),
      });
    }
  }
  return out;
}

export function findSet(id) {
  return setsFor('all').find((s) => s.id === id) || null;
}

/**
 * Pull fresh popular mixes for every genre via the YouTube Data API.
 * Results are filtered to long, embeddable videos so a spin always lands on something playable.
 */
export async function refreshLive(apiKey, onProgress) {
  const out = {};
  for (const g of genres()) {
    onProgress?.(`Searching ${g.name}…`);
    out[g.id] = await searchMixes(apiKey, g.query);
  }
  const total = Object.values(out).reduce((n, arr) => n + arr.length, 0);
  if (!total) throw new Error('Search returned no embeddable mixes.');
  store.set('live', { fetchedAt: Date.now(), genres: out });
  return total;
}
