// Vercel Serverless Function - Fetch YouTube transcript via Webshare proxy

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId parameter' });
  }

  // Validate videoId format (11 characters, alphanumeric + dash + underscore)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId format' });
  }

  try {
    const transcript = await fetchTranscriptWithProxy(videoId);

    if (!transcript || transcript.length === 0) {
      return res.status(404).json({ error: 'No transcript available for this video' });
    }

    // Merge fragments into complete sentences
    const lines = mergeTranscriptLines(transcript);

    return res.status(200).json({
      videoId,
      lines,
      count: lines.length,
    });
  } catch (error) {
    console.error('Transcript fetch error:', error);

    if (error.message?.includes('disabled') || error.message?.includes('No captions')) {
      return res.status(403).json({ error: 'Transcripts are disabled for this video' });
    }
    if (error.message?.includes('unavailable') || error.message?.includes('not found')) {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }

    return res.status(500).json({ error: 'Failed to fetch transcript' });
  }
}

// Fetch transcript using Webshare proxy
async function fetchTranscriptWithProxy(videoId) {
  const WEBSHARE_API_KEY = process.env.WEBSHARE_API_KEY;

  // Webshare proxy endpoint (rotating residential)
  const proxyUrl = 'https://proxy.webshare.io/api/v2/proxy/ipauthorization/';

  // First, get a proxy from Webshare's proxy list
  const proxyListUrl = `https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=1`;

  let proxyHost, proxyPort, proxyUsername, proxyPassword;

  if (WEBSHARE_API_KEY) {
    try {
      const proxyListRes = await fetch(proxyListUrl, {
        headers: { 'Authorization': `Token ${WEBSHARE_API_KEY}` }
      });
      const proxyData = await proxyListRes.json();

      if (proxyData.results && proxyData.results.length > 0) {
        const proxy = proxyData.results[0];
        proxyHost = proxy.proxy_address;
        proxyPort = proxy.port;
        proxyUsername = proxy.username;
        proxyPassword = proxy.password;
      }
    } catch (e) {
      console.log('Failed to get proxy from Webshare:', e.message);
    }
  }

  // Fetch YouTube page to extract caption tracks
  const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let html;
  if (proxyHost && proxyUsername) {
    // Use Webshare proxy via their HTTP API
    const encodedUrl = encodeURIComponent(videoPageUrl);
    const proxyFetchUrl = `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;

    // For Vercel, we need to use a different approach - fetch via proxy service
    // Webshare provides a direct fetch API
    const webshareProxyUrl = `https://proxy.webshare.io/api/v2/proxy/fetch/`;
    const fetchRes = await fetch(webshareProxyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${WEBSHARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: videoPageUrl,
        proxy_type: 'residential',
      }),
    });

    if (fetchRes.ok) {
      html = await fetchRes.text();
    }
  }

  // Fallback: direct fetch (may be blocked on Vercel)
  if (!html) {
    const response = await fetch(videoPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    html = await response.text();
  }

  // Extract caption tracks from YouTube page
  let tracks = null;

  // Pattern 1: Look for captionTracks array
  const trackMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])\s*,\s*"/s);
  if (trackMatch) {
    try {
      tracks = JSON.parse(trackMatch[1]);
    } catch (e) {}
  }

  // Pattern 2: Try ytInitialPlayerResponse
  if (!tracks) {
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (playerMatch) {
      try {
        const playerData = JSON.parse(playerMatch[1]);
        tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch (e) {}
    }
  }

  // Pattern 3: Look for timedtext URL directly
  if (!tracks) {
    const timedtextMatch = html.match(/https:\/\/www\.youtube\.com\/api\/timedtext[^"\\]+/g);
    if (timedtextMatch && timedtextMatch.length > 0) {
      const url = timedtextMatch[0].replace(/\\u0026/g, '&');
      tracks = [{ baseUrl: url, languageCode: 'en' }];
    }
  }

  if (!tracks || tracks.length === 0) {
    throw new Error('No captions found for this video');
  }

  // Prefer English, fallback to first available
  const englishTrack = tracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
  const track = englishTrack || tracks[0];

  // Fetch transcript XML
  const transcriptUrl = track.baseUrl;
  const transcriptRes = await fetch(transcriptUrl);
  const transcriptXml = await transcriptRes.text();

  // Parse XML
  const lines = [];
  const regex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([^<]*)<\/text>/g;
  let match;

  while ((match = regex.exec(transcriptXml)) !== null) {
    lines.push({
      offset: parseFloat(match[1]) * 1000,
      duration: parseFloat(match[2]) * 1000,
      text: decodeHTMLEntities(match[3]),
    });
  }

  return lines;
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n/g, ' ');
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Merge fragmented transcript lines into complete sentences
function mergeTranscriptLines(transcript) {
  const merged = [];
  let current = null;
  const sentenceEnd = /[.!?][\s"'\)\]]*$/;

  for (const item of transcript) {
    const startSec = item.offset / 1000;
    const durationSec = item.duration / 1000;
    const text = item.text.trim();

    if (!current) {
      current = {
        start: startSec,
        endTime: startSec + durationSec,
        text: text,
      };
    } else {
      current.text += ' ' + text;
      current.endTime = startSec + durationSec;
    }

    const isSentenceEnd = sentenceEnd.test(text);
    const segmentDuration = current.endTime - current.start;
    const isLongEnough = segmentDuration >= 8;
    const isTooLong = segmentDuration >= 15;

    if (isSentenceEnd || isTooLong || (isLongEnough && text.endsWith(','))) {
      merged.push({
        t: formatTime(current.start),
        start: current.start,
        duration: current.endTime - current.start,
        text: current.text.replace(/\s+/g, ' ').trim(),
      });
      current = null;
    }
  }

  if (current) {
    merged.push({
      t: formatTime(current.start),
      start: current.start,
      duration: current.endTime - current.start,
      text: current.text.replace(/\s+/g, ' ').trim(),
    });
  }

  return merged;
}
