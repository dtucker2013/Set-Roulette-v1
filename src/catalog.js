// Catalog: seed list from sets.json, optionally overlaid with live YouTube search results.

import { store } from './store.js';
import { searchMixes, searchChannelMixes, resolveChannelId } from './youtube-api.js';

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
        // Name of the followed channel this came from, if any.
        from: s.from || (g.channels || []).find((c) => c.name === s.channel)?.name || '',
      });
    }
  }
  return out;
}

export function findSet(id) {
  return setsFor('all').find((s) => s.id === id) || null;
}

/**
 * Pull fresh mixes for every genre via the YouTube Data API.
 *
 * Two passes per genre: the channels the genre explicitly follows, then a general
 * search. Followed channels go first so their uploads win the merge, and their ids
 * are cached so we only pay the handle lookup once.
 * Everything is filtered to long, embeddable videos, so a spin lands on something playable.
 */
export async function refreshLive(apiKey, onProgress) {
  const out = {};
  const resolved = { ...(store.get('channelIds') || {}) };
  const problems = [];

  for (const g of genres()) {
    const fromChannels = [];

    for (const ch of g.channels || []) {
      onProgress?.(`Checking ${ch.name}…`);
      try {
        let id = resolved[ch.handle || ch.name];
        if (!id) {
          id = await resolveChannelId(apiKey, ch);
          if (id) resolved[ch.handle || ch.name] = id;
        }
        if (!id) { problems.push(`Couldn't find the ${ch.name} channel.`); continue; }

        const vids = await searchChannelMixes(apiKey, id);
        if (!vids.length) problems.push(`${ch.name} had no full-length sets.`);
        fromChannels.push(...vids.map((v) => ({ ...v, from: ch.name })));
      } catch (err) {
        problems.push(`${ch.name}: ${err.message}`);
      }
    }

    onProgress?.(`Searching ${g.name}…`);
    let general = [];
    try {
      general = await searchMixes(apiKey, g.query);
    } catch (err) {
      problems.push(err.message);
    }

    const seen = new Set();
    out[g.id] = [...fromChannels, ...general].filter((v) => !seen.has(v.id) && seen.add(v.id));
  }

  const total = Object.values(out).reduce((n, arr) => n + arr.length, 0);
  if (!total) throw new Error(problems[0] || 'Search returned no embeddable mixes.');

  store.set('channelIds', resolved);
  store.set('live', { fetchedAt: Date.now(), genres: out });
  return { total, problems };
}
