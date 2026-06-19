import { useEffect, useRef } from 'react';

// The rail's dominant surface and the app's PRIMARY input. It is the onboarding
// interview, the ongoing conversation, and the re-scoring trigger all at once.
// A map click prefills `draft` here, so the viz feeds the same one input.
export default function CoachChat({
  messages, onSend, busy, started, draft, setDraft, onLoadDemo, llmReady, move, llmProgress, t,
}) {
  const threadRef = useRef(null);
  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages, busy]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    onSend(text);
  };

  const empty = !started && messages.length === 0;
  const badge = (m) => `${t(`move.${m.mode}`)} · ${t(`move.${m.submode}`)}`;

  return (
    <div className="coach-panel">
      <div className="coach-head">
        <span>{t('coach.title')}</span>
        {move && <span className={`move-badge ${move.mode}`}>● {badge(move)}</span>}
      </div>

      <div className="thread" ref={threadRef} role="log" aria-live="polite" aria-label={t('coach.title')}>
        {empty && (
          <div className="msg coach">
            {t('coach.empty').split('{demo}')[0]}
            <button className="link-demo" onClick={onLoadDemo} disabled={busy}>{t('coach.empty.demo')}</button>
            {t('coach.empty').split('{demo}')[1]}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'coach' && m.move && (
              <span className={`move-badge ${m.move.mode}`}>◆ {badge(m.move)}</span>
            )}
            <div>{m.text}</div>
          </div>
        ))}
        {llmProgress && (
          <div className="msg coach thinking">
            {t('llm.loading', { pct: Math.round((llmProgress.progress || 0) * 100) })}
          </div>
        )}
        {busy && !llmProgress && <div className="msg coach thinking">{t('coach.thinking')}</div>}
      </div>

      <div className="composer">
        <div className="cbox">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={busy} aria-label={t('coach.title')}
            placeholder={empty ? t('composer.placeholder.empty') : t('composer.placeholder.reply')} />
          <div className="cbox-row">
            <button className="chip" onClick={onLoadDemo} disabled={busy}>{t('composer.demo')}</button>
            <span className="chip hint" title={t('composer.clickmap.title')}>{t('composer.clickmap')}</span>
            <button className="send" onClick={send} disabled={busy || draft.trim().length === 0}
              aria-label={t('composer.send')}>↑</button>
          </div>
        </div>
        <div className="composer-tip">{llmReady ? t('composer.tip') : t('composer.tip.nollm')}</div>
      </div>
    </div>
  );
}
