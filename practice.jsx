// practice.jsx — Listen, Dictation, Finished screens
// Listen: YouTube embed (native controls), transcript, Recall + Show/Hide
// Dictation: list of recall attempts, text/voice input, check-all diff
// Finished: stats summary

const { useState: usePractice, useEffect: useEffectP, useRef: useRefP, useMemo: useMemoP } = React;

// ═════════════════════════════════════════════════════════════
// YouTube Player Component with IFrame API
// ═════════════════════════════════════════════════════════════

let ytApiReady = false;
let ytApiCallbacks = [];

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    ytApiReady = true;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      ytApiCallbacks.push(resolve);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      ytApiCallbacks.forEach(cb => cb());
      ytApiCallbacks = [];
      resolve();
    };
    ytApiCallbacks.push(resolve);
  });
}

function YouTubePlayer({ videoId, onReady, onStateChange, transcriptHidden, onToggleTranscript }) {
  const containerRef = useRefP(null);
  const playerRef = useRefP(null);
  const [isPlaying, setIsPlaying] = usePractice(false);
  const [currentTime, setCurrentTime] = usePractice(0);
  const [duration, setDuration] = usePractice(0);
  const [isReady, setIsReady] = usePractice(false);

  useEffectP(() => {
    let mounted = true;

    loadYouTubeAPI().then(() => {
      if (!mounted || !containerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e) => {
            if (!mounted) return;
            setDuration(e.target.getDuration());
            setIsReady(true);
            if (onReady) onReady(e.target);
          },
          onStateChange: (e) => {
            if (!mounted) return;
            setIsPlaying(e.data === window.YT.PlayerState.PLAYING);
            if (onStateChange) onStateChange(e.data);
          },
        },
      });
    });

    return () => {
      mounted = false;
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [videoId]);

  // Update current time
  useEffectP(() => {
    if (!isReady) return;
    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isReady]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const seek = (seconds) => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(playerRef.current.getCurrentTime() + seconds, true);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      {/* YouTube iframe container with touch blocker */}
      <div style={{
        aspectRatio: '16 / 9',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#000',
        border: '1px solid var(--gk-hair)',
        position: 'relative',
      }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {/* Invisible overlay to block touches on video */}
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
        }} />
      </div>

      {/* Controls below video */}
      <div style={{
        marginTop: 12,
        padding: '10px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      }}>
        {/* Time (left) */}
        <span style={{
          fontFamily: 'var(--gk-mono)',
          fontSize: 11, letterSpacing: '0.03em',
          color: 'var(--gk-ink-3)',
          minWidth: 40,
        }}>
          {formatTime(currentTime)}
        </span>

        {/* Rewind 5s */}
        <button onClick={() => seek(-5)} style={{
          background: 'var(--gk-ink)', border: 'none', color: 'var(--gk-paper)',
          width: 38, height: 38, borderRadius: 19,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <IconBack size={16} />
        </button>

        {/* Play/Pause */}
        <button onClick={togglePlay} style={{
          background: 'var(--gk-ink)', border: 'none', color: 'var(--gk-paper)',
          width: 48, height: 48, borderRadius: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          {isPlaying ? <IconPause size={22} /> : <IconPlay size={22} />}
        </button>

        {/* Forward 5s */}
        <button onClick={() => seek(5)} style={{
          background: 'var(--gk-ink)', border: 'none', color: 'var(--gk-paper)',
          width: 38, height: 38, borderRadius: 19,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transform: 'scaleX(-1)',
        }}>
          <IconBack size={16} />
        </button>

        {/* Duration */}
        <span style={{
          fontFamily: 'var(--gk-mono)',
          fontSize: 11, letterSpacing: '0.03em',
          color: 'var(--gk-ink-3)',
          minWidth: 40,
          textAlign: 'right',
        }}>
          {formatTime(duration)}
        </span>

        {/* CC button */}
        {onToggleTranscript && (
          <button onClick={onToggleTranscript} style={{
            background: transcriptHidden ? 'var(--gk-paper-2)' : 'var(--gk-ink)',
            border: '1px solid var(--gk-hair)',
            color: transcriptHidden ? 'var(--gk-ink-3)' : 'var(--gk-paper)',
            width: 38, height: 38, borderRadius: 19,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            marginLeft: 4,
          }}>
            <IconCC size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// 2. LISTEN SCREEN — YouTube + transcript
// ═════════════════════════════════════════════════════════════

function ListenScreen({ onBack, onRecall, platform = 'ios', visible = true,
  videoId = 'dQw4w9WgcQ', recallCount = 0, transcriptHidden, setTranscriptHidden,
  transcript, transcriptLoading, transcriptError }) {
  const { SEGMENT, SAMPLE_VIDEO } = window.GK_DATA;
  const topPad = platform === 'ios' ? 54 : 40;

  // Use fetched transcript or fall back to sample data
  const lines = transcript || SEGMENT.lines;

  return (
    <div className="gk-app" style={{ display: visible ? 'flex' : 'none' }}>
      {/* Header */}
      <div style={{ padding: `${topPad}px 16px 0`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', padding: 0, color: 'var(--gk-ink)',
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          fontFamily: 'var(--gk-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <IconClose size={14} /> End
        </button>
        <span className="gk-mono" style={{ fontSize: 10, color: 'var(--gk-ink-3)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          DAY&nbsp;03 · {recallCount}&nbsp;RECALL{recallCount === 1 ? '' : 'S'}
        </span>
      </div>

      {/* YT video with custom controls */}
      <div style={{ padding: '14px 16px 0' }}>
        <YouTubePlayer
          videoId={videoId}
          transcriptHidden={transcriptHidden}
          onToggleTranscript={() => setTranscriptHidden(!transcriptHidden)}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginTop: 10, color: 'var(--gk-ink-3)', fontSize: 12,
        }}>
          <span style={{ fontSize: 13, color: 'var(--gk-ink)', fontWeight: 500, lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>
            {SAMPLE_VIDEO.title}
          </span>
          <span className="gk-mono" style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--gk-ink-4)' }}>
            {SAMPLE_VIDEO.duration}
          </span>
        </div>
      </div>

      {/* Transcript */}
      <div className="gk-scroll" style={{ flex: 1, padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span className="gk-marker">Transcript</span>
          <span className="gk-mono" style={{ fontSize: 10, color: 'var(--gk-ink-4)', letterSpacing: '0.04em' }}>
            {transcriptLoading ? 'LOADING...' : transcriptHidden ? 'HIDDEN' : `${lines.length} LINES`}
          </span>
        </div>

        {transcriptLoading ? (
          <div style={{
            padding: 18,
            border: '1px dashed var(--gk-hair)',
            borderRadius: 10,
            color: 'var(--gk-ink-3)', fontSize: 13,
            textAlign: 'center',
          }}>
            Fetching transcript...
          </div>
        ) : transcriptError ? (
          <div style={{
            padding: 18,
            border: '1px dashed var(--gk-negative, #c53030)',
            borderRadius: 10,
            color: 'var(--gk-negative, #c53030)', fontSize: 13,
            textAlign: 'center',
          }}>
            {transcriptError === 'Failed to fetch transcript'
              ? 'No transcript available for this video'
              : transcriptError}
          </div>
        ) : transcriptHidden ? (
          <div style={{
            padding: 18,
            border: '1px dashed var(--gk-hair)',
            borderRadius: 10,
            color: 'var(--gk-ink-3)', fontSize: 13,
            textAlign: 'center',
          }}>
            Listen without reading. Tap CC to reveal.
          </div>
        ) : (
          <div>
            {lines.map((line, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '8px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--gk-hair-2)',
              }}>
                <div className="gk-mono" style={{
                  color: 'var(--gk-ink-4)',
                  fontSize: 10, letterSpacing: '0.04em',
                  paddingTop: 6, minWidth: 38, flexShrink: 0,
                }}>
                  {line.t}
                </div>
                <div style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--gk-ink-2)', letterSpacing: '-0.005em' }}>
                  {line.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom action — Recall */}
      <div style={{
        borderTop: '1px solid var(--gk-hair)',
        padding: '12px 16px 16px',
        background: 'var(--gk-paper)',
        paddingBottom: platform === 'ios' ? 24 : 12,
      }}>
        <button onClick={onRecall} style={{
          width: '100%',
          height: 52,
          background: 'var(--gk-ink)', color: 'var(--gk-paper)',
          border: 'none', borderRadius: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: 'pointer',
          fontFamily: 'var(--gk-sans)', fontWeight: 500, fontSize: 14, letterSpacing: '-0.005em',
        }}>
          Recall
          <IconArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// 3. DICTATION SCREEN — recall attempts list + text/voice input
// ═════════════════════════════════════════════════════════════

function DictationScreen({ onBack, onFinish, platform = 'ios', visible = true,
  recalls, addRecall, checkAll, checked, results }) {
  const { SEGMENT } = window.GK_DATA;
  const [draft, setDraft] = usePractice('');
  const [recording, setRecording] = usePractice(false);
  const [recordedSec, setRecordedSec] = usePractice(0);
  const topPad = platform === 'ios' ? 54 : 40;

  // Simulate voice recording timer
  useEffectP(() => {
    if (!recording) return;
    const timer = setInterval(() => setRecordedSec(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  const submitDraft = (text, type = 'text') => {
    if (!text.trim()) return;
    addRecall({ text: text.trim(), type, ts: new Date() });
    setDraft('');
    setRecordedSec(0);
    setRecording(false);
  };

  const stopRecording = () => {
    if (recordedSec > 0) {
      // Fake transcription — append to draft
      submitDraft("For sixty years we wrote software that on CPUs and the architect of that software was shape by the architecture of processor.", 'voice');
    } else {
      setRecording(false);
    }
  };

  return (
    <div className="gk-app" style={{ display: visible ? 'flex' : 'none' }}>
      {/* Header */}
      <div style={{ padding: `${topPad}px 16px 0`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', padding: 0, color: 'var(--gk-ink)',
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          fontFamily: 'var(--gk-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <IconBack size={14} /> Listen
        </button>
        <span className="gk-mono" style={{ fontSize: 10, color: 'var(--gk-ink-3)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          {recalls.length}&nbsp;RECALL{recalls.length === 1 ? '' : 'S'}
        </span>
      </div>

      <div style={{ padding: '12px 20px 0' }}>
        <div className="gk-marker">Recall</div>
        <div style={{
          fontFamily: 'var(--gk-serif)',
          fontSize: 26, lineHeight: 1.15, letterSpacing: '-0.02em',
          marginTop: 4,
        }}>
          {checked ? (
            <>Compare against <span style={{ fontStyle: 'italic', color: 'var(--gk-ink-3)' }}>what was said.</span></>
          ) : (
            <>Type or speak <span style={{ fontStyle: 'italic', color: 'var(--gk-ink-3)' }}>what you just heard.</span></>
          )}
        </div>
      </div>

      {/* Recalls list */}
      <div className="gk-scroll" style={{ flex: 1, padding: '16px 20px 12px' }}>
        {recalls.length === 0 && !checked && (
          <div style={{
            padding: 18,
            border: '1px dashed var(--gk-hair)',
            borderRadius: 10,
            color: 'var(--gk-ink-3)', fontSize: 13,
            textAlign: 'center',
          }}>
            No recalls yet. Add one below — text or voice.
          </div>
        )}
        {recalls.map((r, i) => {
          const result = checked ? results[i] : null;
          return (
            <div key={i} style={{
              padding: 14,
              borderRadius: 10,
              border: '1px solid var(--gk-hair)',
              background: 'var(--gk-paper-2)',
              marginBottom: 10,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                marginBottom: 8,
              }}>
                <span className="gk-marker">
                  Recall {i + 1} · {r.type === 'voice' ? 'voice' : 'text'}
                </span>
                {result && (
                  <span className="gk-mono" style={{ fontSize: 11, color: 'var(--gk-ink)', fontWeight: 500 }}>
                    {result.accuracy}% match
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--gk-ink-2)', letterSpacing: '-0.005em' }}>
                {result ? (
                  result.diff.map((d, j) => {
                    const cls =
                      d.status === 'correct' ? 'gk-diff-correct' :
                      d.status === 'missed' ? 'gk-diff-missed' :
                      d.status === 'extra' ? 'gk-diff-extra' : '';
                    return <span key={j} className={cls}>{d.text} </span>;
                  })
                ) : r.text}
              </div>
              {result && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="gk-chip" style={{ color: 'var(--gk-negative)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--gk-negative)' }}/>
                    {result.missed} missed
                  </span>
                  <span className="gk-chip">
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--gk-ink)' }}/>
                    {result.correct} correct
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {checked && (
          <div style={{
            marginTop: 14, padding: 14, borderRadius: 10,
            background: 'var(--gk-ink)', color: 'var(--gk-paper)',
          }}>
            <div className="gk-marker" style={{ color: 'rgba(244,243,238,0.6)' }}>Session average</div>
            <div className="gk-mono" style={{ fontSize: 28, fontWeight: 500, marginTop: 4, letterSpacing: '-0.01em' }}>
              {Math.round(results.reduce((a, b) => a + b.accuracy, 0) / Math.max(1, results.length))}% match
            </div>
            <div style={{ fontSize: 12, color: 'rgba(244,243,238,0.7)', marginTop: 4 }}>
              across {recalls.length} recall{recalls.length === 1 ? '' : 's'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: input dock OR action bar */}
      {!checked ? (
        <div style={{
          borderTop: '1px solid var(--gk-hair)',
          padding: '10px 16px 16px',
          background: 'var(--gk-paper)',
          paddingBottom: platform === 'ios' ? 24 : 12,
        }}>
          {recording ? (
            <div style={{
              padding: 12,
              borderRadius: 26,
              background: 'var(--gk-paper-2)',
              border: '1px solid var(--gk-hair)',
              display: 'flex', alignItems: 'center', gap: 10,
              height: 52,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: 5,
                background: 'var(--gk-negative)',
                animation: 'gk-pulse 1.2s ease-in-out infinite',
                flexShrink: 0,
              }}/>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 24 }}>
                {Array.from({ length: 28 }, (_, i) => {
                  const h = 0.3 + Math.abs(Math.sin(i * 0.4 + recordedSec * 0.5)) * 0.7;
                  return <div key={i} style={{
                    height: `${h * 100}%`, flex: 1,
                    background: 'var(--gk-ink-3)',
                    borderRadius: 1,
                  }}/>;
                })}
              </div>
              <span className="gk-mono" style={{ fontSize: 11, color: 'var(--gk-ink-3)' }}>
                {String(Math.floor(recordedSec / 60)).padStart(2,'0')}:{String(recordedSec % 60).padStart(2,'0')}
              </span>
              <button onClick={stopRecording} style={{
                width: 36, height: 36, borderRadius: 18,
                background: 'var(--gk-ink)', color: 'var(--gk-paper)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <IconCheck size={14} />
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 52px 52px',
              gap: 8, alignItems: 'flex-end',
            }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDraft(draft); }
                }}
                placeholder="Type a recall…"
                rows={1}
                style={{
                  resize: 'none', outline: 'none',
                  padding: '14px 16px',
                  borderRadius: 26,
                  border: '1px solid var(--gk-hair)',
                  background: 'var(--gk-paper-2)',
                  fontFamily: 'var(--gk-sans)',
                  fontSize: 14, lineHeight: 1.4, color: 'var(--gk-ink)',
                  letterSpacing: '-0.005em',
                  minHeight: 52, maxHeight: 120,
                }}
              />
              <button onClick={() => setRecording(true)} style={{
                width: 52, height: 52, borderRadius: 26,
                background: 'transparent',
                border: '1px solid var(--gk-hair)',
                color: 'var(--gk-ink)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}>
                <IconMic size={18} />
              </button>
              <button onClick={() => submitDraft(draft)} disabled={!draft.trim()} style={{
                width: 52, height: 52, borderRadius: 26,
                background: draft.trim() ? 'var(--gk-ink)' : 'var(--gk-ink-4)',
                color: 'var(--gk-paper)',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: draft.trim() ? 'pointer' : 'default',
              }}>
                <IconArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="gk-btn gk-btn-ghost" style={{ flex: 1 }} onClick={onBack}>
              <IconBack size={12} /> Listen again
            </button>
            <button className="gk-btn gk-btn-primary"
              disabled={recalls.length === 0}
              style={{ flex: 1, opacity: recalls.length === 0 ? 0.4 : 1 }}
              onClick={checkAll}>
              Check all <IconCheck size={12} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          borderTop: '1px solid var(--gk-hair)',
          padding: '12px 16px 16px',
          background: 'var(--gk-paper)',
          paddingBottom: platform === 'ios' ? 24 : 12,
          display: 'flex', gap: 10,
        }}>
          <button className="gk-btn gk-btn-ghost" style={{ flex: 1 }} onClick={onBack}>
            <IconBack size={14} /> Listen again
          </button>
          <button className="gk-btn gk-btn-primary" style={{ flex: 1.3 }} onClick={onFinish}>
            Finish session <IconCheck size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Diff helpers — word-level comparison
// ═════════════════════════════════════════════════════════════

function checkRecall(userText, targetText) {
  const u = userText.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(Boolean);
  const t = targetText.split(/\s+/);
  const out = [];
  let ui = 0;
  let correct = 0, missed = 0;
  for (let i = 0; i < t.length; i++) {
    const tw = t[i];
    const twClean = tw.toLowerCase().replace(/[.,!?;:]/g, '');
    const uw = u[ui];
    if (uw === twClean) {
      out.push({ text: tw, status: 'correct' });
      correct++; ui++;
    } else if (u[ui + 1] === twClean) {
      out.push({ text: u[ui], status: 'extra' });
      out.push({ text: tw, status: 'correct' });
      correct++; ui += 2;
    } else if (uw && twClean.length >= 4 && uw.length >= 4 && uw.slice(0, 4) === twClean.slice(0, 4)) {
      out.push({ text: tw, status: 'correct' });
      correct++; ui++;
    } else {
      out.push({ text: tw, status: 'missed' });
      missed++;
    }
  }
  const total = t.length;
  return {
    diff: out,
    accuracy: Math.round((correct / Math.max(1, total)) * 100),
    correct, missed,
  };
}

// ═════════════════════════════════════════════════════════════
// 4. FINISHED SCREEN — session stats
// ═════════════════════════════════════════════════════════════

function FinishedScreen({ onDone, platform = 'ios', recalls = [], results = [] }) {
  const topPad = platform === 'ios' ? 54 : 40;
  const avg = results.length
    ? Math.round(results.reduce((a, b) => a + b.accuracy, 0) / results.length)
    : 82;
  return (
    <div className="gk-app">
      <div style={{ height: topPad, flexShrink: 0 }} />
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ color: 'var(--gk-ink)' }}>
          <Knot size={200} progress={1} mastery={0.5} pass={3} animated={false} accentColor="var(--gk-accent)" />
        </div>
        <div className="gk-marker" style={{ marginTop: 18, color: 'var(--gk-accent-ink)' }}>Session complete</div>
        <div style={{
          fontFamily: 'var(--gk-serif)',
          fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.02em',
          textAlign: 'center', marginTop: 8,
        }}>
          <span style={{ color: 'var(--gk-ink-3)' }}>Small gain.</span><br/>
          <span style={{ fontStyle: 'italic' }}>Counted.</span>
        </div>
        <div style={{
          marginTop: 20, width: '100%', maxWidth: 320,
          padding: 14,
          background: 'var(--gk-paper-2)',
          border: '1px solid var(--gk-hair)',
          borderRadius: 10,
        }}>
          <StatRow label="Recalls captured" val={String(recalls.length || 3)} delta={`+${recalls.length || 3}`} good />
          <StatRow label="Average match" val={`${avg}%`} delta="+8" good />
          <StatRow label="Streak" val="12 days" delta="+1" good />
        </div>
      </div>
      <div style={{ padding: '12px 20px 18px', borderTop: '1px solid var(--gk-hair)' }}>
        <button className="gk-btn gk-btn-primary" onClick={onDone}>
          Return home
        </button>
      </div>
    </div>
  );
}

function StatRow({ label, val, delta, good }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', fontSize: 13,
      borderTop: '1px solid var(--gk-hair-2)',
    }}>
      <span style={{ color: 'var(--gk-ink-2)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="gk-mono" style={{ fontWeight: 500 }}>{val}</span>
        <span className="gk-mono" style={{
          fontSize: 10, padding: '1px 5px', borderRadius: 3,
          color: good ? 'var(--gk-positive)' : 'var(--gk-negative)',
          background: 'var(--gk-paper)', border: '1px solid var(--gk-hair)',
        }}>{delta}</span>
      </span>
    </div>
  );
}

Object.assign(window, { ListenScreen, DictationScreen, FinishedScreen, checkRecall });
