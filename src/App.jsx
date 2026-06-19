import { useState } from 'react';
import { useIkigaider } from './state/store.js';
import { useLocale } from './i18n/provider.jsx';
import IkigaiMap from './components/IkigaiMap.jsx';
import AxisInstrument from './components/AxisInstrument.jsx';
import MathPanel from './components/MathPanel.jsx';
import CoachChat from './components/CoachChat.jsx';
import ConfigPanel from './components/ConfigPanel.jsx';
import SimPanel from './components/SimPanel.jsx';

export default function App() {
  const { locale, setLocale, t } = useLocale();
  const ik = useIkigaider({ t, locale });
  const [gearOpen, setGearOpen] = useState(false);

  if (ik.initError) return <div className="app-loading err">{t('app.initFailed', { msg: ik.initError })}</div>;
  if (!ik.ready) return <div className="app-loading">{t('app.loading')}</div>;

  const llmReady = !!(ik.config && ik.config.base_url);
  const onSend = (text) => (ik.started ? ik.send(text) : ik.start(text));

  return (
    <div className="shell">
      <div className="mapwrap">
        <div className="brand">
          <h1>ikiga<i>i</i>der</h1>
          <small>{t('brand.tagline')}</small>
        </div>

        <div className="stage">
          <IkigaiMap
            focal={ik.focal}
            portfolio={ik.portfolio}
            trajectory={ik.trajectory}
            focalUncertainty={ik.focalUncertainty}
            glide={ik.glide}
            hint={!ik.started}
            onPlace={ik.placeFromMap}
            sim={ik.sim}
            onSimulate={ik.simulate}
            onPickHistory={ik.pickHistory}
            t={t}
          />
          {ik.focal && <AxisInstrument scores={ik.focal.scores} t={t} />}
          {ik.sim
            ? <SimPanel sim={ik.sim} current={ik.focal} onCoach={ik.coachToward}
                onClear={ik.clearSim} locale={locale} t={t} />
            : (
              <div className="maptip">
                <b>{t('map.tip.lead')}</b> {t('map.tip.body')}
              </div>
            )}
        </div>
      </div>

      <div className="rail">
        {ik.error && <div className="error-banner" role="alert">{ik.error}</div>}
        <MathPanel focal={ik.focal} trajectory={ik.trajectory} locale={locale} t={t}
          onGear={() => setGearOpen(true)} />
        <CoachChat
          messages={ik.messages}
          onSend={onSend}
          busy={ik.busy}
          started={ik.started}
          draft={ik.draft}
          setDraft={ik.setDraft}
          onLoadDemo={ik.loadDemo}
          llmReady={llmReady}
          move={ik.move}
          llmProgress={ik.llmProgress}
          t={t}
        />
      </div>

      <ConfigPanel
        config={ik.config}
        onSave={ik.saveConfig}
        onExport={ik.exportDb}
        onImport={ik.importDb}
        open={gearOpen}
        onClose={() => setGearOpen(false)}
        locale={locale}
        setLocale={setLocale}
        t={t}
      />
    </div>
  );
}
