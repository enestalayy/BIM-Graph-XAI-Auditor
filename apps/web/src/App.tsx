import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client.ts';
import type { DatasetList, ModelSummary, Violation, ViolationDetail as Detail, Vocabulary } from './api/types.ts';
import { ErrorMessage } from './components/ErrorMessage.tsx';
import { ModelsPanel } from './components/ModelsPanel.tsx';
import { RulesPanel } from './components/RulesPanel.tsx';
import { ViolationDetail } from './components/ViolationDetail.tsx';
import { ViolationsPanel } from './components/ViolationsPanel.tsx';
import type { Highlight, ModelInput } from './viewer/scene.ts';
import { Viewer } from './viewer/Viewer.tsx';

type Tab = 'models' | 'rules' | 'violations';

function highlightOf(detail: Detail | null): Highlight | null {
  if (!detail) return null;
  const { violation } = detail;
  const nearest = violation.evidence.kind === 'intersection' ? violation.evidence.mitigation?.nearest?.globalId : undefined;
  return { subject: violation.subject.globalId, object: violation.object?.globalId, mitigation: nearest };
}

export function App() {
  const [tab, setTab] = useState<Tab>('violations');
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [modelInputs, setModelInputs] = useState<ModelInput[]>([]);
  const [vocabulary, setVocabulary] = useState<Vocabulary>({ classes: [], propertyKeys: [], propertyTypes: {} });
  const [violations, setViolations] = useState<Violation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [datasets, setDatasets] = useState<DatasetList | null>(null);

  const refreshDatasets = useCallback(async () => {
    try {
      setDatasets(await api.listDatasets());
    } catch (e) {
      setError(e);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const list = await api.listModels();
      setModels(list);
      setVocabulary(await api.vocabulary());
      setModelInputs(await Promise.all(list.map(async (m) => ({ fileName: m.fileName, bytes: await api.modelFile(m.fileName) }))));
    } catch (e) {
      setError(e);
    }
  }, []);

  const refreshViolations = useCallback(async () => {
    try {
      const list = await api.listViolations();
      setViolations(list);
      setSelectedId((id) => (id && list.some((v) => v.id === id) ? id : null));
    } catch (e) {
      setError(e);
    }
  }, []);

  const refreshDetail = useCallback(async (id: string | null) => {
    if (!id) return setDetail(null);
    try {
      setDetail(await api.getViolation(id));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void refreshModels();
    void refreshViolations();
    void refreshDatasets();
  }, [refreshModels, refreshViolations, refreshDatasets]);

  const onDatasetLoaded = useCallback(() => {
    setSelectedId(null);
    void refreshDatasets();
    void refreshModels();
    void refreshViolations();
    setTab('violations');
  }, [refreshDatasets, refreshModels, refreshViolations]);

  const activeTitle = datasets?.datasets.find((d) => d.id === datasets.active)?.title;

  useEffect(() => {
    void refreshDetail(selectedId);
  }, [selectedId, refreshDetail]);

  const highlight = useMemo(() => highlightOf(detail), [detail]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Dijital Denetçi</h1>
        <span className="muted">Grafik tabanlı ve açıklanabilir BIM çakışma denetimi</span>
        {activeTitle && <span className="badge active-dataset">Veri seti: {activeTitle}</span>}
      </header>
      <aside className="sidebar">
        <nav className="tabs">
          <button type="button" className={tab === 'models' ? 'active' : ''} onClick={() => setTab('models')}>Modeller</button>
          <button type="button" className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>Kurallar</button>
          <button type="button" className={tab === 'violations' ? 'active' : ''} onClick={() => setTab('violations')}>Bulgular ({violations.length})</button>
        </nav>
        <ErrorMessage error={error} />
        {tab === 'models' && (
          <ModelsPanel models={models} datasets={datasets} onChanged={() => void refreshModels()} onDatasetLoaded={onDatasetLoaded} />
        )}
        {tab === 'rules' && <RulesPanel vocabulary={vocabulary} onSaved={() => void refreshViolations()} />}
        {tab === 'violations' && (
          <ViolationsPanel violations={violations} selectedId={selectedId} onSelect={setSelectedId} onAudited={() => void refreshViolations()} />
        )}
      </aside>
      <main className="main">
        <Viewer models={modelInputs} highlight={highlight} />
        {detail && <ViolationDetail detail={detail} onExplained={() => void refreshDetail(selectedId)} />}
      </main>
    </div>
  );
}
