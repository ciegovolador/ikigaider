import { ikigaiScore, bottleneckAxis, classify } from '../lib/ikigai.js';
import { stateName } from '../i18n/index.js';

// The instrument strip: the one-line rollup that sits atop the chat rail.
// Big I (the target metric), the 16-state label, the bottleneck axis, and the
// last-move delta. The per-axis bars live in AxisInstrument (no duplication);
// the move rationale lives in the coach thread.
export default function MathPanel({ focal, trajectory = [], onGear, locale = 'en', t }) {
  const s = focal?.scores;
  const I = s ? ikigaiScore(s) : null;
  const st = s ? classify(s) : null;
  const weakest = s ? bottleneckAxis(s) : null;

  // delta vs the previous snapshot of this activity.
  let delta = null;
  if (trajectory.length >= 2) {
    delta = I - ikigaiScore(trajectory[trajectory.length - 2]);
  }

  return (
    <div className="strip">
      <div className="strip-I">
        {I === null ? '—' : I.toFixed(2)}<small>{t('strip.of')}</small>
      </div>
      <div className="strip-meta">
        {st ? (
          <>
            {t('strip.state')} <b>{stateName(locale, st.key, st.name)}</b><br />
            {t('strip.bottleneck')} <b className="bn-axis">{t(`axis.name.${weakest}`)}</b>
          </>
        ) : (
          <span className="muted">{t('strip.empty')}</span>
        )}
      </div>
      {delta !== null && delta !== 0 && (
        <div className={`strip-delta ${delta > 0 ? 'up' : 'down'}`}>
          {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta.toFixed(2)}
        </div>
      )}
      <button className="gear" aria-label={t('strip.settings')} onClick={onGear}>⚙</button>
    </div>
  );
}
