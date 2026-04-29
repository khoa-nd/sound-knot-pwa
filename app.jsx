// app.jsx — standalone PWA entry point
// Flow: home → listen ↔ dictation → finished
// Listen + Dictation are mounted simultaneously (display toggle) so the YT player keeps state.

const { useState: useAppState, useEffect: useAppEffect } = React;

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

  // Fetch transcript when videoId changes
  useAppEffect(() => {
    if (!videoId || videoId === 'dQw4w9WgcQ') return;

    setTranscriptLoading(true);
    setTranscriptError(null);
    setTranscript(null);

    fetch(`/api/transcript?videoId=${videoId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch transcript');
        return res.json();
      })
      .then(data => {
        setTranscript(data.lines);
        setTranscriptLoading(false);
      })
      .catch(err => {
        console.error('Transcript error:', err);
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
