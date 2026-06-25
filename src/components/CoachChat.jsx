import { useEffect, useRef, useState } from 'react';

// The rail's dominant surface and the app's PRIMARY input. It is the onboarding
// interview, the ongoing conversation, and the re-scoring trigger all at once.
// A map click prefills `draft` here, so the viz feeds the same one input.
// Typing "/" opens a command palette (like Claude / Slack / Telegram); the head
// carries copy + export of the conversation.
export default function CoachChat({
  messages, onSend, busy, started, draft, setDraft, onLoadDemo, llmReady, move, llmProgress, t, commands = [],
}) {
  const threadRef = useRef(null);
  const taRef = useRef(null);
  const [active, setActive] = useState(0);   // highlighted row in the slash menu
  const [dismissed, setDismissed] = useState(false); // Esc / after-pick: keep the menu closed
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages, busy]);

  // Slash-command palette: filter the catalog by what's typed on the first line.
  const q = draft.split('\n')[0];
  const isSlash = q.startsWith('/');
  const typed = q.trimEnd();
  const exact = commands.some((c) => c.cmd === typed);
  const filtered = isSlash ? commands.filter((c) => c.cmd.toLowerCase().startsWith(typed.toLowerCase())) : [];
  const menuOpen = isSlash && !exact && !dismissed && filtered.length > 0 && !busy;
  const safeActive = Math.min(active, Math.max(0, filtered.length - 1));

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft(''); setDismissed(false); setActive(0);
    onSend(text);
  };

  const pick = (cmd) => {
    setDraft(cmd); setDismissed(true); setActive(0);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const onChange = (e) => { setDraft(e.target.value); setDismissed(false); setActive(0); };

  const onKeyDown = (e) => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); pick(filtered[safeActive].cmd); return; }
      if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Copy / export the rendered conversation (user + coach turns only).
  const lines = () => messages.filter((m) => m.role === 'user' || m.role === 'coach')
    .map((m) => ({ who: m.role === 'user' ? 'You' : 'Coach', text: m.text }));
  const copyConvo = async () => {
    try {
      await navigator.clipboard.writeText(lines().map((l) => `${l.who}: ${l.text}`).join('\n\n'));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked (insecure context) — no-op */ }
  };
  const exportConvo = () => {
    const md = `# ikigaider conversation\n\n${lines().map((l) => `**${l.who}:** ${l.text}`).join('\n\n')}\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ikigaider-conversation-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const empty = !started && messages.length === 0;
  const hasConvo = messages.some((m) => m.role === 'user' || m.role === 'coach');
  const badge = (m) => `${t(`move.${m.mode}`)} · ${t(`move.${m.submode}`)}`;

  return (
    <div className="coach-panel">
      <div className="coach-head">
        <span>{t('coach.title')}</span>
        {move && <span className={`move-badge ${move.mode}`}>● {badge(move)}</span>}
        {hasConvo && (
          <span className="coach-tools">
            <button className="tool" onClick={copyConvo} title={t('coach.copy')}>{copied ? t('coach.copied') : t('coach.copy')}</button>
            <button className="tool" onClick={exportConvo} title={t('coach.export')}>{t('coach.export')}</button>
          </span>
        )}
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
        {busy && !llmProgress && (
          <div className="msg coach thinking" role="status" aria-live="polite">
            <span>{t('coach.thinking')}</span>
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="cbox">
          {menuOpen && (
            <ul className="slash-menu" role="listbox" aria-label="commands">
              {filtered.map((c, i) => (
                <li key={c.cmd} role="option" aria-selected={i === safeActive}
                  className={i === safeActive ? 'on' : ''}
                  onMouseDown={(e) => { e.preventDefault(); pick(c.cmd); }}
                  onMouseEnter={() => setActive(i)}>
                  <span className="cmd">{c.cmd}</span>
                  <span className="desc">{c.desc}</span>
                </li>
              ))}
            </ul>
          )}
          <textarea ref={taRef} value={draft} onChange={onChange} onKeyDown={onKeyDown}
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
