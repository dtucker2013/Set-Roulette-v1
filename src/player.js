// Thin wrapper around the YouTube IFrame Player API.
// Playback is always YouTube's own player, so views, ads and rights all stay with them.

import { store } from './store.js';

const IFRAME_API = 'https://www.youtube.com/iframe_api';

let player = null;
let ready = false;
let pending = null;      // video id requested before the API finished loading
let handlers = {};

function loadApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.querySelector(`script[src="${IFRAME_API}"]`)) {
      const s = document.createElement('script');
      s.src = IFRAME_API;
      document.head.appendChild(s);
    }
  });
}

/**
 * Error codes worth acting on:
 *   2   – bad video id
 *   5   – HTML5 player can't play it
 *   100 – removed or private
 *   101 / 150 – uploader disabled embedding (same thing, two codes)
 * All of them mean "this set will never play here", so we retire it and move on.
 */
const FATAL = new Set([2, 5, 100, 101, 150]);

export async function init({ onEnd, onUnplayable, onPlaying }) {
  handlers = { onEnd, onUnplayable, onPlaying };
  await loadApi();

  player = new window.YT.Player('player', {
    host: store.get('nocookie') ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com',
    playerVars: {
      playsinline: 1,      // iOS: play inline instead of hijacking fullscreen
      rel: 0,
      modestbranding: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        ready = true;
        if (pending) { const id = pending; pending = null; play(id); }
      },
      onStateChange: (e) => {
        if (e.data === window.YT.PlayerState.ENDED) handlers.onEnd?.();
        if (e.data === window.YT.PlayerState.PLAYING) handlers.onPlaying?.();
      },
      onError: (e) => {
        const id = currentId();
        if (FATAL.has(e.data)) {
          if (id) store.markDead(id);
          handlers.onUnplayable?.(id, e.data);
        }
      },
    },
  });
}

export function play(id) {
  if (!ready) { pending = id; return; }
  player.loadVideoById(id);
}

export function currentId() {
  try {
    const url = player?.getVideoUrl?.();
    return url ? new URL(url).searchParams.get('v') : null;
  } catch {
    return null;
  }
}

export function stop() {
  try { player?.stopVideo?.(); } catch { /* ignore */ }
}
