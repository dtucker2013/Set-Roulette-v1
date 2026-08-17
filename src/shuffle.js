// A shuffle bag: every set in the pool plays once before any repeats.
// Plain Math.random() re-picks the same mix two spins in a row often enough to feel broken.

let bag = [];
let bagKey = '';

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {string} key   pool identity (genre id) — changing it refills the bag
 * @param {Array}  pool  candidate sets
 * @param {string} avoid id not to hand back on the first draw
 */
export function draw(key, pool, avoid) {
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];

  if (key !== bagKey || !bag.length) {
    bag = fisherYates(pool.map((s) => s.id));
    bagKey = key;
  }

  // Drop ids that have since left the pool (retired, genre switched, etc.)
  const live = new Set(pool.map((s) => s.id));
  bag = bag.filter((id) => live.has(id));
  if (!bag.length) bag = fisherYates(pool.map((s) => s.id));

  let id = bag.pop();
  if (id === avoid && bag.length) {
    const swap = bag.pop();
    bag.unshift(id);
    id = swap;
  }
  return pool.find((s) => s.id === id) || pool[0];
}

export function reset() {
  bag = [];
  bagKey = '';
}
