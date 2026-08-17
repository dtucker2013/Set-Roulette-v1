// Keyless metadata + liveness check via YouTube's public oEmbed endpoint.
//
// This is what keeps the built-in set list honest: titles and channel names come
// straight from YouTube at runtime, and a video that has been deleted, made
// private, or had embedding switched off answers 401/404 here — so we can retire
// it before a spin ever lands on it.

import { store } from './store.js';

const ENDPOINT = 'https://www.youtube.com/oembed';
const TTL = 1000 * 60 * 60 * 24 * 7; // re-check a set once a week
const inflight = new Map();

export async function hydrate(id) {
  const cached = store.getMeta(id);
  if (cached && Date.now() - (cached.checkedAt || 0) < TTL) return cached;
  if (inflight.has(id)) return inflight.get(id);

  const p = (async () => {
    const url = `${ENDPOINT}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
    try {
      const res = await fetch(url);
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        store.markDead(id);
        return null;
      }
      if (!res.ok) return null; // transient — leave the set alone
      const data = await res.json();
      const meta = { title: data.title, channel: data.author_name };
      store.setMeta(id, meta);
      return meta;
    } catch {
      return null; // offline or blocked; fall back to seeded titles
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, p);
  return p;
}

/** Hydrate a batch politely, a few at a time, so we don't hammer the endpoint. */
export async function hydrateAll(ids, onEach, concurrency = 4) {
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const meta = await hydrate(id);
      onEach?.(id, meta);
    }
  });
  await Promise.all(workers);
}
