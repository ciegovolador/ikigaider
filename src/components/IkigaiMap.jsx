import { useRef, useState } from 'react';
import {
  project, ikigaiScore, bottleneckAxis, clamp01,
} from '../lib/ikigai.js';

// The map is illustrative: the 4D->2D projection only shows the good<->world
// and love<->paid balances, so two different score vectors can land near the
// same spot. The instrument numbers (strip + axis cluster) are the truth.

const R = 108;
const C = {
  love: { cx: 200, cy: 132, fill: 'var(--c-love)' },
  good: { cx: 132, cy: 200, fill: 'var(--c-good)' },
  world: { cx: 268, cy: 200, fill: 'var(--c-world)' },
  paid: { cx: 200, cy: 268, fill: 'var(--c-paid)' },
};

// score-space [0,1] -> svg coords (viewBox 0 0 400 400)
const toSvg = (p) => ({ cx: 40 + p.x * 320, cy: 40 + p.y * 320 });

// Inverse of project(): a click at (svgX,svgY) seeds a plausible score vector.
// Only the good<->world and love<->paid balances are recoverable, so the other
// magnitudes are centred at 0.5 — intentionally lossy; the chat refines it.
function svgPointToScores({ cx, cy }) {
  const x = (cx - 40) / 320; // = 0.5 + (world-good)/2
  const y = (cy - 40) / 320; // = 0.5 - (love-paid)/2
  const dWG = (x - 0.5) * 2;
  const dLP = (0.5 - y) * 2;
  return {
    love: clamp01(0.5 + dLP / 2),
    paid: clamp01(0.5 - dLP / 2),
    world: clamp01(0.5 + dWG / 2),
    good: clamp01(0.5 - dWG / 2),
  };
}

// Named pairs sit in the gaps between circles, off the fills.
const REGIONS = [
  { t: 'Passion', sub: 'love ∩ good', x: 158, y: 160 },
  { t: 'Mission', sub: 'love ∩ world', x: 242, y: 160 },
  { t: 'Profession', sub: 'good ∩ paid', x: 158, y: 244 },
  { t: 'Vocation', sub: 'world ∩ paid', x: 242, y: 244 },
];

// Pole each axis pulls toward: raising that axis moves the dot this way.
const POLE = { love: [0, -1], paid: [0, 1], good: [-1, 0], world: [1, 0] };

export default function IkigaiMap({
  focal, portfolio = [], trajectory = [], focalUncertainty = 0, glide, hint,
  onPlace, sim, onSimulate, onPickHistory, t = (k) => k,
}) {
  const svgRef = useRef(null);
  const [ghost, setGhost] = useState(null);   // hover crosshair (place affordance)
  const [aim, setAim] = useState(null);        // live drag target
  const dragging = useRef(false);
  const moved = useRef(false);                 // did the cursor move during a drag?
  const suppressClick = useRef(false);         // swallow the click that trails a drag

  const focalPt = focal ? toSvg(project(focal.scores)) : null;
  const trajPts = trajectory.map((s) => toSvg(project(s)));
  const polyline = trajPts.map((p) => `${p.cx},${p.cy}`).join(' ');

  // Desired/simulated state (set by drag or by picking a past state).
  const simPt = sim ? toSvg(project(sim.scores)) : null;
  const simI = sim ? ikigaiScore(sim.scores) : 0;

  const I = focal ? ikigaiScore(focal.scores) : 0;
  const bottleneck = focal ? bottleneckAxis(focal.scores) : null;
  // Center glow scales with how close you are to ikigai (progress meter).
  const glowR = 30 + Math.sqrt(I) * 66;

  const evtToSvg = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      cx: ((e.clientX - rect.left) / rect.width) * 400,
      cy: ((e.clientY - rect.top) / rect.height) * 400,
    };
  };

  const onMove = (e) => {
    const p = evtToSvg(e);
    if (dragging.current) {
      moved.current = true;
      setAim(p);
      onSimulate?.(svgPointToScores(p)); // live what-if readout while dragging
    } else setGhost(p);
  };
  const onLeave = () => { if (!dragging.current) setGhost(null); };
  const onClick = (e) => {
    if (suppressClick.current) { suppressClick.current = false; return; } // trailed a drag
    if (dragging.current) return;
    onPlace?.(svgPointToScores(evtToSvg(e)));
  };
  const startDrag = (e) => { e.stopPropagation(); dragging.current = true; moved.current = false; setGhost(null); };
  // On drop the simulated state persists (store already holds it from onSimulate).
  // If the cursor actually moved, swallow the trailing click so it doesn't also
  // fire onPlace and clobber the composer draft.
  const endDrag = () => {
    if (moved.current) suppressClick.current = true;
    dragging.current = false;
    setAim(null);
  };

  // Gradient vector: from the focal dot a fixed step toward the weakest axis.
  let vec = null;
  if (focalPt && bottleneck) {
    const [dx, dy] = POLE[bottleneck];
    vec = { x2: focalPt.cx + dx * 44, y2: focalPt.cy + dy * 44 };
  }

  return (
    <svg ref={svgRef} className="ikigai-map" viewBox="0 0 400 400" role="img"
      aria-label={t('map.aria')}
      onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick} onMouseUp={endDrag}
      style={{
        width: '100%',
        '--c-love': '#f2a93b', '--c-good': '#7b92d6',
        '--c-world': '#62cb8c', '--c-paid': '#ec7681',
      }}>
      <defs>
        <radialGradient id="ikigai-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff7e6" stopOpacity="0.95" />
          <stop offset="34%" stopColor="#f7d488" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f2a93b" stopOpacity="0" />
        </radialGradient>
        <marker id="vec-head" markerWidth="7" markerHeight="7" refX="4" refY="3.5"
          orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="var(--c-love)" /></marker>
      </defs>

      {Object.entries(C).map(([k, c]) => (
        <circle key={k} className="axis-circle" cx={c.cx} cy={c.cy} r={R}
          fill={c.fill} stroke={c.fill} />
      ))}

      {/* bright readable center target = the destination + the progress meter */}
      <circle className="ikigai-glow" cx={200} cy={206} r={glowR} fill="url(#ikigai-glow)" />
      <circle className="reticle" cx={200} cy={206} r={26} />
      <circle className="reticle dash" cx={200} cy={206} r={40} />

      <text className="axis-label" x={200} y={22} textAnchor="middle">{t('axis.love')}</text>
      <text className="axis-label" x={10} y={204} textAnchor="start">{t('axis.good')}</text>
      <text className="axis-label" x={390} y={204} textAnchor="end">{t('axis.world')}</text>
      <text className="axis-label" x={200} y={392} textAnchor="middle">{t('axis.paid')}</text>

      {REGIONS.map((r) => (
        <g key={r.t}>
          <text className="region-label" x={r.x} y={r.y} textAnchor="middle">{t(`region.${r.t}`)}</text>
          <text className="region-sub" x={r.x} y={r.y + 11} textAnchor="middle">{r.sub}</text>
        </g>
      ))}
      <text className="ikigai-label" x={200} y={210} textAnchor="middle">IKIGAI</text>

      {polyline && <polyline className="trajectory" points={polyline} />}

      {/* previous discrete states: every past snapshot of the focal activity is
          a clickable dot. Click one to simulate revisiting it. The last point is
          the current state (shown as the focal dot below), so skip it. */}
      {trajPts.slice(0, -1).map((p, i) => (
        <circle key={`h${i}`} className="history-dot" cx={p.cx} cy={p.cy} r={5}
          style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onPickHistory?.(trajectory[i]); }}>
          <title>{t('map.history')}</title>
        </circle>
      ))}

      {portfolio.filter((a) => !focal || a.id !== focal.id).map((a) => {
        const p = toSvg(project(a.scores));
        return <circle key={a.id} className="portfolio-dot" cx={p.cx} cy={p.cy} r={6} />;
      })}

      {/* viz-as-input: ghost crosshair under the cursor */}
      {ghost && (
        <g className="ghost" pointerEvents="none">
          <circle cx={ghost.cx} cy={ghost.cy} r={7} />
          <line x1={ghost.cx - 12} y1={ghost.cy} x2={ghost.cx + 12} y2={ghost.cy} />
          <line x1={ghost.cx} y1={ghost.cy - 12} x2={ghost.cx} y2={ghost.cy + 12} />
          <text className="ghost-tip" x={ghost.cx + 16} y={ghost.cy + 4}>{t('map.clickToPlace')}</text>
        </g>
      )}

      {/* live drag target */}
      {aim && (
        <g className="aim" pointerEvents="none">
          <circle cx={aim.cx} cy={aim.cy} r={11} />
          <circle cx={aim.cx} cy={aim.cy} r={3} />
        </g>
      )}

      {!focalPt && hint && (
        <text className="map-hint" x={200} y={344} textAnchor="middle">{t('map.hint')}</text>
      )}

      {focalPt && (
        <>
          {vec && (
            <line className="gradient-vec" x1={focalPt.cx} y1={focalPt.cy}
              x2={vec.x2} y2={vec.y2} markerEnd="url(#vec-head)" />
          )}
          {focalUncertainty > 0 && (
            <circle className="uncertainty-halo" cx={focalPt.cx} cy={focalPt.cy}
              r={10 + focalUncertainty * 40} />
          )}
          {/* draggable ring + core: current state AND target-setter */}
          <circle className="focal-ring" cx={focalPt.cx} cy={focalPt.cy} r={18} />
          <circle className={`focal-dot${glide ? ' glide' : ''}`} cx={focalPt.cx}
            cy={focalPt.cy} r={9} onMouseDown={startDrag} style={{ cursor: 'grab' }}>
            <title>{`${t('map.youarehere')} · ${t('map.dragToAim')}`}</title>
          </circle>
          {/* Label pushed OUTWARD from the dense center so it never sits on the
              IKIGAI / region labels, whichever quadrant the dot lands in. */}
          <text className="you-are-here"
            x={focalPt.cx < 200 ? focalPt.cx - 13 : focalPt.cx + 13}
            y={focalPt.cy < 206 ? focalPt.cy + 22 : focalPt.cy - 13}
            textAnchor={focalPt.cx < 200 ? 'end' : 'start'}>
            {t('map.youarehere')}
          </text>

          {/* simulated desired state: animated transition + a hollow target dot */}
          {simPt && (
            <g className="sim">
              <line className="sim-link" x1={focalPt.cx} y1={focalPt.cy} x2={simPt.cx} y2={simPt.cy} />
              <circle className="sim-dot" cx={simPt.cx} cy={simPt.cy} r={9} />
              <circle className="sim-core" cx={simPt.cx} cy={simPt.cy} r={2.5} />
              <text className="sim-tag"
                x={simPt.cx < 200 ? simPt.cx - 13 : simPt.cx + 13}
                y={simPt.cy < 206 ? simPt.cy - 11 : simPt.cy + 20}
                textAnchor={simPt.cx < 200 ? 'end' : 'start'}>
                {t('map.desired')} · I {simI.toFixed(2)}
              </text>
            </g>
          )}
        </>
      )}
    </svg>
  );
}

export { svgPointToScores };
