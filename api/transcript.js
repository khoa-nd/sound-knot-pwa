// Vercel Serverless Function - Fetch YouTube transcript
// Uses youtube-transcript package (no API key needed)

import { YoutubeTranscript } from 'youtube-transcript';

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
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcript || transcript.length === 0) {
      return res.status(404).json({ error: 'No transcript available for this video' });
    }

    // Format transcript data
    const lines = transcript.map(item => ({
      t: formatTime(item.offset / 1000),
      start: item.offset / 1000,
      duration: item.duration / 1000,
      text: item.text,
    }));

    return res.status(200).json({
      videoId,
      lines,
      count: lines.length,
    });
  } catch (error) {
    console.error('Transcript fetch error:', error);

    // Handle specific errors
    if (error.message?.includes('disabled')) {
      return res.status(403).json({ error: 'Transcripts are disabled for this video' });
    }
    if (error.message?.includes('unavailable') || error.message?.includes('not found')) {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }

    return res.status(500).json({ error: 'Failed to fetch transcript' });
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
