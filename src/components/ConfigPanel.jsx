import { useEffect, useRef, useState } from 'react';
import { LOCALES, LOCALE_LABELS } from '../i18n/index.js';
import {
  BROWSER_MODELS, DEFAULT_BROWSER_MODEL, webgpuAvailable, isBrowserProvider, modelFromBase,
} from '../lib/webllm.js';

// BYO-LLM config + language + portable-SQLite import/export, tucked behind the ⚙
// in the instrument strip. Config is the quietest thing in the app. Open state
// is owned by App. Accessible dialog: Escape closes, focus is trapped + restored.
export default function ConfigPanel({
  config, onSave, onExport, onImport, open, onClose, locale, setLocale, t,
}) {
  const [form, setForm] = useState(config || { base_url: '', api_key: '', model: '' });
  const browserCfg = isBrowserProvider(config?.base_url);
  // Cold-start: a fresh user (no endpoint configured yet) defaults to the
  // zero-setup in-browser engine; an existing BYO URL keeps BYO selected.
  const [engine, setEngine] = useState(
    browserCfg ? 'browser' : (config?.base_url ? 'byo' : 'browser'));
  const [browserModel, setBrowserModel] = useState(browserCfg ? modelFromBase(config.base_url) : DEFAULT_BROWSER_MODEL);
  const hasGpu = webgpuAvailable();
  const fileRef = useRef(null);
  const popRef = useRef(null);
  const firstRef = useRef(null);
  const restoreRef = useRef(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Focus management + Escape, only while open.
  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    firstRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      // Simple focus trap within the dialog.
      const f = popRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f || !f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const save = () => {
    const next = engine === 'browser'
      ? { base_url: `browser:${browserModel}`, api_key: '', model: browserModel }
      : form;
    onSave(next);
    onClose();
  };

  return (
    <div className="config-overlay" onClick={onClose}>
      <div className="config-pop panel stack" ref={popRef} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="config-title">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong id="config-title">{t('config.title')}</strong>
          <button className="ghost" onClick={onClose} aria-label={t('config.close')}>{t('config.close')}</button>
        </div>

        <div className="field">
          <label htmlFor="cfg-lang">{t('config.language')}</label>
          <select id="cfg-lang" ref={firstRef} value={locale}
            onChange={(e) => setLocale(e.target.value)}>
            {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cfg-engine">{t('config.engine')}</label>
          <select id="cfg-engine" value={engine} onChange={(e) => setEngine(e.target.value)}>
            <option value="browser">{t('config.engine.browser')}</option>
            <option value="byo">{t('config.engine.byo')}</option>
          </select>
        </div>

        {engine === 'browser' ? (
          <>
            <div className="field">
              <label htmlFor="cfg-bmodel">{t('config.engine.model')}</label>
              <select id="cfg-bmodel" value={browserModel} onChange={(e) => setBrowserModel(e.target.value)}>
                {BROWSER_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <span className={`muted webgpu ${hasGpu ? 'ok' : 'no'}`}>
              {hasGpu ? t('config.webgpu.ok') : t('config.webgpu.no')}
            </span>
            <span className="muted">{t('config.engine.note')}</span>
          </>
        ) : (
          <>
            <strong>{t('config.byo')}</strong>
            <div className="field">
              <label htmlFor="cfg-base">{t('config.baseUrl')}</label>
              <input id="cfg-base" value={form.base_url} onChange={set('base_url')} placeholder="http://localhost:8080/v1" />
            </div>
            <div className="field">
              <label htmlFor="cfg-key">{t('config.apiKey')}</label>
              <input id="cfg-key" value={form.api_key} onChange={set('api_key')} placeholder={t('config.apiKey.ph')} />
            </div>
            <div className="field">
              <label htmlFor="cfg-model">{t('config.model')}</label>
              <input id="cfg-model" value={form.model} onChange={set('model')} placeholder={t('config.model.ph')} />
            </div>
          </>
        )}
        <button className="primary" onClick={save}>{t('config.save')}</button>

        <hr style={{ borderColor: 'var(--line, #2a2a38)', width: '100%' }} />
        <strong>{t('config.journey')}</strong>
        <div className="row">
          <button onClick={onExport}>{t('config.export')}</button>
          <button onClick={() => fileRef.current?.click()}>{t('config.import')}</button>
          <input ref={fileRef} type="file" accept=".sqlite,.db,application/octet-stream"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && (onImport(e.target.files[0]), onClose())} />
        </div>
        <span className="muted">{t('config.journey.note')}</span>

        <hr style={{ borderColor: 'var(--line, #2a2a38)', width: '100%' }} />
        <strong>{t('config.skill')}</strong>
        <div className="row">
          <a className="button" href={`${import.meta.env.BASE_URL}ikigaider-skill.zip`} download>
            {t('config.skill.get')}
          </a>
        </div>
        <span className="muted">{t('config.skill.note')}</span>
      </div>
    </div>
  );
}
