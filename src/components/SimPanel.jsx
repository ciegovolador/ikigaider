import { ikigaiScore, classify } from '../lib/ikigai.js';
import { stateName } from '../i18n/index.js';

// Readout for a simulated/desired state (set by dragging the dot or picking a
// past state). Pure-math: current I vs simulated I + the resulting region. The
// two actions hand the simulation to the chat ("coach toward this") or drop it.
export default function SimPanel({ sim, current, onCoach, onClear, locale = 'en', t }) {
  if (!sim) return null;
  const simI = ikigaiScore(sim.scores);
  const curI = current ? ikigaiScore(current.scores) : 0;
  const delta = simI - curI;
  const st = classify(sim.scores);

  return (
    <div className="sim-panel" role="region" aria-label={t('sim.title')}>
      <div className="sim-head">{t('sim.title')}</div>
      <div className="sim-readout">
        <span className="sim-I">{simI.toFixed(2)}</span>
        <span className={`sim-delta ${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? '▲ +' : '▼ '}{delta.toFixed(2)} {t('sim.vsCurrent')}
        </span>
      </div>
      <div className="sim-state">{t('strip.state')} <b>{stateName(locale, st.key, st.name)}</b></div>
      <div className="sim-actions">
        <button className="primary" onClick={() => onCoach(sim.scores)}>{t('sim.coach')}</button>
        <button className="ghost" onClick={onClear}>{t('sim.clear')}</button>
      </div>
    </div>
  );
}
