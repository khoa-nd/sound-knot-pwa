// Vercel Serverless Function - Fetch YouTube transcript via TubeText API

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
    // Use TubeText API (free, no auth required)
    const apiUrl = `https://tubetext.vercel.app/youtube/transcript-with-timestamps?video_id=${videoId}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`TubeText API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.transcript_array || data.transcript_array.length === 0) {
      return res.status(404).json({ error: 'No transcript available for this video' });
    }

    // Transform TubeText format to our format and merge lines
    const rawLines = data.transcript_array.map(item => ({
      offset: item.start * 1000,
      duration: item.duration * 1000,
      text: item.text,
    }));

    const lines = mergeTranscriptLines(rawLines);

    return res.status(200).json({
      videoId,
      lines,
      count: lines.length,
    });
  } catch (error) {
    console.error('Transcript fetch error:', error);

    if (error.message?.includes('No transcript')) {
      return res.status(404).json({ error: 'No transcript available for this video' });
    }

    return res.status(500).json({ error: 'Failed to fetch transcript' });
  }
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
