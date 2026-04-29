// Vercel Serverless Function - Fetch YouTube transcript via Webshare residential proxy

import { ProxyAgent, fetch as undiciFetch } from 'undici';

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

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId format' });
  }

  try {
    const transcript = await fetchTranscriptWithProxy(videoId);

    if (!transcript || transcript.length === 0) {
      return res.status(404).json({ error: 'No transcript available for this video' });
    }

    const lines = mergeTranscriptLines(transcript);

    return res.status(200).json({
      videoId,
      lines,
      count: lines.length,
    });
  } catch (error) {
    console.error('Transcript fetch error:', error);

    if (error.message?.includes('No captions')) {
      return res.status(403).json({ error: 'Transcripts are disabled for this video' });
    }

    return res.status(500).json({ error: 'Failed to fetch transcript' });
  }
}

async function fetchTranscriptWithProxy(videoId) {
  const WEBSHARE_API_KEY = process.env.WEBSHARE_API_KEY;
  const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let html;

  // Try Webshare proxy if API key is available
  if (WEBSHARE_API_KEY) {
    try {
      // Get proxy credentials from Webshare
      const proxyListRes = await fetch(
        'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=1',
        { headers: { 'Authorization': `Token ${WEBSHARE_API_KEY}` } }
      );
      const proxyData = await proxyListRes.json();

      if (proxyData.results && proxyData.results.length > 0) {
        const proxy = proxyData.results[0];
        const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`;

        console.log('Using Webshare proxy:', proxy.proxy_address);

        const proxyAgent = new ProxyAgent(proxyUrl);

        const response = await undiciFetch(videoPageUrl, {
          dispatcher: proxyAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        });

        if (response.ok) {
          html = await response.text();
          console.log('Proxy fetch success, got', html.length, 'bytes');
        }
      }
    } catch (e) {
      console.error('Proxy fetch failed:', e.message);
    }
  }

  // Fallback: direct fetch (will likely be blocked on Vercel)
  if (!html) {
    console.log('Falling back to direct fetch');
    const response = await fetch(videoPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    html = await response.text();
  }

  // Extract caption tracks
  let tracks = null;

  // Pattern 1: captionTracks array
  const trackMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])\s*,\s*"/s);
  if (trackMatch) {
    try {
      tracks = JSON.parse(trackMatch[1]);
    } catch (e) {}
  }

  // Pattern 2: ytInitialPlayerResponse
  if (!tracks) {
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script)/s);
    if (playerMatch) {
      try {
        const playerData = JSON.parse(playerMatch[1]);
        tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch (e) {}
    }
  }

  // Pattern 3: timedtext URL
  if (!tracks) {
    const timedtextMatch = html.match(/https:\/\/www\.youtube\.com\/api\/timedtext[^"\\]+/g);
    if (timedtextMatch) {
      const url = timedtextMatch[0].replace(/\\u0026/g, '&');
      tracks = [{ baseUrl: url, languageCode: 'en' }];
    }
  }

  if (!tracks || tracks.length === 0) {
    throw new Error('No captions found for this video');
  }

  // Get English track or first available
  const englishTrack = tracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
  const track = englishTrack || tracks[0];

  // Fetch transcript XML
  const transcriptRes = await fetch(track.baseUrl);
  const transcriptXml = await transcriptRes.text();

  // Parse XML
  const lines = [];
  const regex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([^<]*)<\/text>/g;
  let match;

  while ((match = regex.exec(transcriptXml)) !== null) {
    lines.push({
      offset: parseFloat(match[1]) * 1000,
      duration: parseFloat(match[2]) * 1000,
      text: decodeEntities(match[3]),
    });
  }

  return lines;
}

function decodeEntities(text) {
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

function mergeTranscriptLines(transcript) {
  const merged = [];
  let current = null;
  const sentenceEnd = /[.!?][\s"'\)\]]*$/;

  for (const item of transcript) {
    const startSec = item.offset / 1000;
    const durationSec = item.duration / 1000;
    const text = item.text.trim();

    if (!current) {
      current = { start: startSec, endTime: startSec + durationSec, text };
    } else {
      current.text += ' ' + text;
      current.endTime = startSec + durationSec;
    }

    const isSentenceEnd = sentenceEnd.test(text);
    const segmentDuration = current.endTime - current.start;

    if (isSentenceEnd || segmentDuration >= 15 || (segmentDuration >= 8 && text.endsWith(','))) {
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
