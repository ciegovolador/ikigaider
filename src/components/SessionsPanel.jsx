import { useRef, useState } from 'react';

// SessionsPanel — the in-app session library, shown inside the ⚙ popover. Each
// session is a separate journey on this device; one is active. Switch by clicking
// a name; New starts a clean session; rename is inline; delete confirms (with an
// export-first nudge). Export saves the active journey; Import restores a file as
// a NEW session. All session controls disable while a coach turn is in flight.
function SessionRow({ s, active, onSwitch, onRename, onDelete, busy, t }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);

  const submit = () => {
    const next = name.trim();
    if (next && next !== s.name) onRename(s.id, next);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="session-row editing">
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { setName(s.name); setEditing(false); }
          }}
          onBlur={submit} aria-label={t('session.rename')} />
      </li>
    );
  }

  return (
    <li className={`session-row ${active ? 'active' : ''}`}>
      <button className="session-name" onClick={() => !active && onSwitch(s.id)}
        disabled={busy || active} title={s.name}>
        <span className="session-label">{s.name || t('session.untitled')}</span>
        {active && <span className="session-active">{t('session.active')}</span>}
      </button>
      <span className="session-actions">
        <button className="ghost" onClick={() => setEditing(true)} disabled={busy}
          aria-label={t('session.rename')} title={t('session.rename')}>✎</button>
        <button className="ghost" onClick={() => {
          if (window.confirm(t('session.delete.confirm', { name: s.name }))) onDelete(s.id);
        }} disabled={busy} aria-label={t('session.delete')} title={t('session.delete')}>🗑</button>
      </span>
    </li>
  );
}

export default function SessionsPanel({
  sessions, activeId, busy, onNew, onSwitch, onRename, onDelete, onExport, onImport, t,
}) {
  const fileRef = useRef(null);
  return (
    <div className="sessions">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{t('session.title')}</strong>
        <button className="ghost" onClick={() => onNew()} disabled={busy}>＋ {t('session.new.btn')}</button>
      </div>
      <ul className="session-list">
        {sessions.map((s) => (
          <SessionRow key={s.id} s={s} active={s.id === activeId}
            onSwitch={onSwitch} onRename={onRename} onDelete={onDelete} busy={busy} t={t} />
        ))}
      </ul>
      <div className="row">
        <button onClick={onExport} disabled={busy}>{t('config.export')}</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy}>{t('config.import')}</button>
        <input ref={fileRef} type="file" accept=".sqlite,.db,application/octet-stream"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) { onImport(e.target.files[0]); e.target.value = ''; } }} />
      </div>
      <span className="muted">{t('session.note')}</span>
    </div>
  );
}
