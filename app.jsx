// app.jsx — standalone PWA entry point
// Flow: home → listen ↔ dictation → finished
// Listen + Dictation are mounted simultaneously (display toggle) so the YT player keeps state.

const { useState: useAppState, useEffect: useAppEffect } = React;

// ═══════════════════════════════════════════════════════════════════════════
// Client-side YouTube transcript fetcher (fallback when server API is blocked)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchTranscriptClient(videoId) {
  // Fetch YouTube video page to extract caption tracks
  const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Use a CORS proxy for client-side fetch
  const corsProxy = 'https://corsproxy.io/?';
  const response = await fetch(corsProxy + encodeURIComponent(videoPageUrl));
  const html = await response.text();

  // Extract captions JSON from the page
  const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s);
  if (!captionMatch) {
    throw new Error('No captions found');
  }

  let captionsData;
  try {
    // Extract just the captions object and parse
    const captionsStr = captionMatch[1];
    captionsData = JSON.parse(captionsStr);
  } catch (e) {
    throw new Error('Failed to parse captions data');
  }

  const tracks = captionsData?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('No caption tracks available');
  }

  // Prefer English, fallback to first available
  const englishTrack = tracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
  const track = englishTrack || tracks[0];

  // Fetch the actual transcript XML
  const transcriptUrl = track.baseUrl;
  const transcriptRes = await fetch(corsProxy + encodeURIComponent(transcriptUrl));
  const transcriptXml = await transcriptRes.text();

  // Parse XML transcript
  const parser = new DOMParser();
  const doc = parser.parseFromString(transcriptXml, 'text/xml');
  const textNodes = doc.querySelectorAll('text');

  const rawLines = Array.from(textNodes).map(node => ({
    offset: parseFloat(node.getAttribute('start')) * 1000,
    duration: parseFloat(node.getAttribute('dur') || '2') * 1000,
    text: node.textContent.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
  }));

  // Merge into sentences (same logic as server)
  return mergeTranscriptLines(rawLines);
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
    const isLongEnough = segmentDuration >= 8;
    const isTooLong = segmentDuration >= 15;

    if (isSentenceEnd || isTooLong || (isLongEnough && text.endsWith(','))) {
      const mins = Math.floor(current.start / 60);
      const secs = Math.floor(current.start % 60);
      merged.push({
        t: `${mins}:${secs.toString().padStart(2, '0')}`,
        start: current.start,
        duration: current.endTime - current.start,
        text: current.text.replace(/\s+/g, ' ').trim(),
      });
      current = null;
    }
  }

  if (current) {
    const mins = Math.floor(current.start / 60);
    const secs = Math.floor(current.start % 60);
    merged.push({
      t: `${mins}:${secs.toString().padStart(2, '0')}`,
      start: current.start,
      duration: current.endTime - current.start,
      text: current.text.replace(/\s+/g, ' ').trim(),
    });
  }

  return merged;
}

function extractYouTubeId(url) {
  if (!url) return 'dQw4w9WgcQ';
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : 'dQw4w9WgcQ';
}

// Detect iOS vs Android for safe-area padding heuristics.
// Uses the same 54px / 40px values as the design prototype.
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'ios';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS ? 'ios' : 'android';
}

const platform = detectPlatform();

// ═════════════════════════════════════════════════════════════
// iOS install banner — detects iOS Safari & not standalone
// ═════════════════════════════════════════════════════════════

const INSTALL_DISMISS_KEY = 'gk-install-dismissed';

function shouldShowIOSInstall() {
  if (typeof window === 'undefined') return false;
  // Always show in development (localhost)
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev) return true;

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Other iOS browsers can't install PWAs — only Safari can.
  // Check for non-Safari browsers first (Chrome, Firefox, Edge, Opera on iOS)
  const isNotSafari = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
  // On iOS, if it's not one of those browsers, it's Safari (or Safari WebView)
  const isSafari = isIOS && !isNotSafari;
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch (e) {}
  return isIOS && isSafari && !isStandalone && !dismissed;
}

function InstallBanner({ onDismiss }) {
  const showHelp = () => {
    alert('To install Sound Knot:\n\n1. Tap the Share button (square with arrow) in Safari\'s toolbar\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm');
  };

  return (
    <div style={{
      position: 'fixed',
      left: 16, right: 16, bottom: 24,
      background: 'var(--gk-ink)',
      color: 'var(--gk-paper)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
      zIndex: 9999,
    }}>
      <button onClick={showHelp} style={{
        background: 'rgba(244,243,238,0.10)',
        border: 'none',
        width: 44, height: 44, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, cursor: 'pointer', color: 'var(--gk-paper)',
      }}>
        <IconShare size={20} />
      </button>
      <div onClick={showHelp} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div className="gk-marker" style={{ color: 'rgba(244,243,238,0.6)', marginBottom: 2 }}>
          Install
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.35, letterSpacing: '-0.005em' }}>
          Tap <span style={{ display: 'inline-flex', verticalAlign: '-3px', margin: '0 2px' }}><IconShare size={13} /></span>
          {' '}then <span style={{ fontWeight: 500 }}>Add to Home Screen</span>
        </div>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" style={{
        background: 'transparent', border: 'none',
        color: 'var(--gk-paper)', opacity: 0.6,
        padding: 12, margin: -6, cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 44, minHeight: 44,
      }}>
        <IconClose size={18} />
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Main app — state machine
// ═════════════════════════════════════════════════════════════

function SoundKnotApp() {
  const [screen, setScreen] = useAppState('home');
  const [videoId, setVideoId] = useAppState('dQw4w9WgcQ');
  const [recalls, setRecalls] = useAppState([]);
  const [checked, setChecked] = useAppState(false);
  const [results, setResults] = useAppState([]);
  const [transcriptHidden, setTranscriptHidden] = useAppState(false);
  const [showInstall, setShowInstall] = useAppState(false);
  const [transcript, setTranscript] = useAppState(null);
  const [transcriptLoading, setTranscriptLoading] = useAppState(false);
  const [transcriptError, setTranscriptError] = useAppState(null);

  useAppEffect(() => { setShowInstall(shouldShowIOSInstall()); }, []);

  // Fetch transcript when videoId changes (server first, client fallback)
  useAppEffect(() => {
    if (!videoId || videoId === 'dQw4w9WgcQ') return;

    setTranscriptLoading(true);
    setTranscriptError(null);
    setTranscript(null);

    const apiUrl = `/api/transcript?videoId=${videoId}`;
    console.log('[DEBUG] Fetching transcript from server:', apiUrl);

    fetch(apiUrl)
      .then(async res => {
        console.log('[DEBUG] Server response:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('[DEBUG] Server transcript:', data.lines?.length, 'lines');
          return data.lines;
        }
        // Server blocked (403) or error - try client-side fallback
        console.log('[DEBUG] Server blocked, trying client-side fallback...');
        const lines = await fetchTranscriptClient(videoId);
        console.log('[DEBUG] Client transcript:', lines.length, 'lines');
        return lines;
      })
      .then(lines => {
        setTranscript(lines);
        setTranscriptLoading(false);
      })
      .catch(err => {
        console.error('[DEBUG] Transcript error:', err);
        setTranscriptError(err.message);
        setTranscriptLoading(false);
      });
  }, [videoId]);

  const dismissInstall = () => {
    try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch (e) {}
    setShowInstall(false);
  };

  const addRecall = (r) => {
    setRecalls(prev => [...prev, { ...r, id: Date.now() + Math.random() }]);
  };

  const checkAll = () => {
    // Use fetched transcript if available, otherwise fall back to sample data
    const lines = (transcript || window.GK_DATA?.SEGMENT?.lines || []).map(l => l.text);
    const out = recalls.map(r => {
      let best = null;
      for (const line of lines) {
        const candidate = checkRecall(r.text, line);
        if (!best || candidate.accuracy > best.accuracy) {
          best = { ...candidate, target: line };
        }
      }
      return best || checkRecall(r.text, lines[0] || '');
    });
    setResults(out);
    setChecked(true);
  };

  const reset = () => {
    setRecalls([]);
    setResults([]);
    setChecked(false);
  };

  const go = (s) => {
    if (s === 'home') reset();
    setScreen(s);
  };

  // Both Listen and Dictation are always mounted during a session — visibility toggled
  // so the YouTube iframe doesn't unmount/remount.
  const inSession = screen === 'listen' || screen === 'dictation';

  return (
    <div className="gk-app" style={{ height: '100%' }}>
      {screen === 'home' && (
        <HomeScreen
          platform={platform}
          onPaste={(u) => { setVideoId(extractYouTubeId(u)); reset(); setScreen('listen'); }}
          onOpenItem={() => { reset(); setScreen('listen'); }}
          onProgress={() => setScreen('listen')}
        />
      )}

      {inSession && (
        <>
          <ListenScreen
            platform={platform}
            visible={screen === 'listen'}
            videoId={videoId}
            recallCount={recalls.length}
            transcriptHidden={transcriptHidden}
            setTranscriptHidden={setTranscriptHidden}
            transcript={transcript}
            transcriptLoading={transcriptLoading}
            transcriptError={transcriptError}
            onBack={() => go('home')}
            onRecall={() => setScreen('dictation')}
          />
          <DictationScreen
            platform={platform}
            visible={screen === 'dictation'}
            recalls={recalls}
            addRecall={addRecall}
            checkAll={checkAll}
            checked={checked}
            results={results}
            onBack={() => setScreen('listen')}
            onFinish={() => setScreen('finished')}
          />
        </>
      )}

      {screen === 'finished' && (
        <FinishedScreen
          platform={platform}
          recalls={recalls}
          results={results}
          onDone={() => go('home')}
        />
      )}

      {screen === 'home' && showInstall && (
        <InstallBanner onDismiss={dismissInstall} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Root mount
// ═════════════════════════════════════════════════════════════

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SoundKnotApp />);
