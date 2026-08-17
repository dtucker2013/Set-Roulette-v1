// Tiny localStorage-backed store. Everything stays on the device.

const KEY = 'setroulette.v1';

const DEFAULTS = {
  apiKey: '',
  genre: 'all',
  autoplay: true,
  nocookie: true,
  favorites: [],     // video ids
  history: [],       // video ids, most recent first (capped)
  dead: [],          // ids that failed to load or refused embedding
  live: null,        // { fetchedAt, genres: { [genreId]: [{id,title,channel}] } }
  meta: {},          // id -> { title, channel, checkedAt }
};

const HISTORY_CAP = 60;
const META_CAP = 400;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = read();
let writeTimer = null;

function flush() {
  writeTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded (usually the metadata cache). Drop it and retry once.
    state.meta = {};
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* give up quietly */ }
  }
}

function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 120);
}

export const store = {
  get: (k) => state[k],

  set(k, v) {
    state[k] = v;
    save();
  },

  toggleInList(k, id) {
    const list = state[k] || [];
    const next = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
    state[k] = next;
    save();
    return next.includes(id);
  },

  has: (k, id) => (state[k] || []).includes(id),

  pushHistory(id) {
    state.history = [id, ...(state.history || []).filter((x) => x !== id)].slice(0, HISTORY_CAP);
    save();
  },

  markDead(id) {
    if (!state.dead.includes(id)) {
      state.dead = [...state.dead, id];
      save();
    }
  },

  setMeta(id, meta) {
    const keys = Object.keys(state.meta);
    if (keys.length > META_CAP) {
      // Cheap eviction: keep the newest half.
      const kept = keys
        .sort((a, b) => (state.meta[b].checkedAt || 0) - (state.meta[a].checkedAt || 0))
        .slice(0, META_CAP / 2);
      state.meta = Object.fromEntries(kept.map((k) => [k, state.meta[k]]));
    }
    state.meta[id] = { ...meta, checkedAt: Date.now() };
    save();
  },

  getMeta: (id) => state.meta[id],

  clear() {
    state = { ...DEFAULTS };
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};
