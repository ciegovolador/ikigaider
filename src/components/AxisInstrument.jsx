import { AXES, bottleneckAxis } from '../lib/ikigai.js';

// A discreet, borderless flight-instrument readout of the four axis scores.
// This is the ONLY place per-axis bars live (the strip shows the rollup), so
// there's no duplication. Bottleneck row is amber with a ◂ marker — colour is
// not the only signal (the marker + footer carry it too, for a11y).
const AXIS_COLOR = { love: '#f2a93b', good: '#7b92d6', world: '#62cb8c', paid: '#ec7681' };

export default function AxisInstrument({ scores, t }) {
  if (!scores) return null;
  const weakest = bottleneckAxis(scores);

  return (
    <div className="axis-instrument" role="img"
      aria-label={`${t('instrument.title')}: ${AXES.map((a) => `${t(`axis.name.${a}`)} ${scores[a].toFixed(2)}`).join(', ')}`}>
      <div className="ai-head" aria-hidden="true"><span>{t('instrument.title')}</span><span>0 ·5 1</span></div>
      {AXES.map((a) => (
        <div key={a} className={`ai-row${a === weakest ? ' bn' : ''}`} aria-hidden="true">
          <span className="ai-name">{t(`axis.short.${a}`)}</span>
          <span className="ai-track">
            <span className="ai-fill" style={{ width: `${scores[a] * 100}%`, background: AXIS_COLOR[a] }} />
          </span>
          <span className="ai-val">{scores[a].toFixed(2).slice(1)}</span>
        </div>
      ))}
      <div className="ai-foot" aria-hidden="true">{t('instrument.foot', { axis: t(`axis.name.${weakest}`) })}</div>
    </div>
  );
}
