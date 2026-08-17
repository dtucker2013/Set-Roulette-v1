// YouTube Data API v3 client (optional — only used when the user supplies a key).
// Everything here is metadata only: ids, titles, channel names. Playback always
// happens in YouTube's own embedded player.

const API = 'https://www.googleapis.com/youtube/v3';

async function call(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') throw new Error('API quota exceeded for today.');
    if (res.status === 400 || res.status === 403) throw new Error('API key rejected. Check the key and that YouTube Data API v3 is enabled for it.');
    throw new Error(body?.error?.message || `YouTube API error ${res.status}`);
  }
  return body;
}

/**
 * Search for long, embeddable mixes matching a query.
 * `videoDuration=long` keeps results to 20+ minutes, which is what makes a set a set.
 */
export async function searchMixes(apiKey, query, max = 25) {
  const data = await call('search', {
    key: apiKey,
    part: 'snippet',
    q: query,
    type: 'video',
    videoDuration: 'long',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    order: 'viewCount',
    safeSearch: 'none',
    maxResults: String(max),
  });

  return (data.items || [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({
      id: it.id.videoId,
      title: decodeEntities(it.snippet.title),
      channel: decodeEntities(it.snippet.channelTitle),
    }));
}

// The API returns HTML entities in titles (&amp;, &#39;, …).
function decodeEntities(s = '') {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}
