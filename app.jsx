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
// Main app — state machine
// ═════════════════════════════════════════════════════════════

function SoundKnotApp() {
  const [screen, setScreen] = useAppState('home');
  const [videoId, setVideoId] = useAppState('dQw4w9WgcQ');
  const [recalls, setRecalls] = useAppState([]);
  const [checked, setChecked] = useAppState(false);
  const [results, setResults] = useAppState([]);
  const [transcriptHidden, setTranscriptHidden] = useAppState(false);

  const addRecall = (r) => {
    setRecalls(prev => [...prev, { ...r, id: Date.now() + Math.random() }]);
  };

  const checkAll = () => {
    const lines = (window.GK_DATA?.SEGMENT?.lines || []).map(l => l.text);
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
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Root mount
// ═════════════════════════════════════════════════════════════

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SoundKnotApp />);
