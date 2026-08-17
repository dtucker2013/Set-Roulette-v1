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

/**
 * Turn a channel entry from sets.json into a channel id.
 * A known channelId wins; otherwise resolve the @handle; otherwise fall back to
 * searching for the channel by name, taking the top hit.
 */
export async function resolveChannelId(apiKey, channel) {
  if (channel.channelId) return channel.channelId;

  if (channel.handle) {
    const handle = channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`;
    try {
      const data = await call('channels', { key: apiKey, part: 'id', forHandle: handle });
      const id = data.items?.[0]?.id;
      if (id) return id;
    } catch {
      // fall through to the name search below
    }
  }

  const data = await call('search', {
    key: apiKey,
    part: 'snippet',
    q: channel.query || channel.name,
    type: 'channel',
    maxResults: '1',
  });
  return data.items?.[0]?.id?.channelId || null;
}

/**
 * Newest long uploads from one channel. Restricting to `long` also filters out
 * Shorts, which these channels post a lot of and which aren't sets.
 * If a channel has no long uploads we retry at `medium` rather than come back empty.
 */
export async function searchChannelMixes(apiKey, channelId, max = 25) {
  const fetchAt = async (videoDuration) => {
    const data = await call('search', {
      key: apiKey,
      part: 'snippet',
      channelId,
      type: 'video',
      videoDuration,
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      order: 'date',
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
  };

  const long = await fetchAt('long');
  return long.length ? long : fetchAt('medium');
}

// The API returns HTML entities in titles (&amp;, &#39;, …).
function decodeEntities(s = '') {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}
