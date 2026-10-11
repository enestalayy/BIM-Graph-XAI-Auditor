import { useState } from 'react';
import { api } from '../api/client.ts';
import type { ActivationResult, DatasetList } from '../api/types.ts';
import { ErrorMessage } from './ErrorMessage.tsx';

interface DatasetPickerProps {
  datasets: DatasetList | null;
  onLoaded: () => void;
}

/** Switches the working graph to a catalog dataset and audits it in one step. */
export function DatasetPicker({ datasets, onLoaded }: DatasetPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ActivationResult | null>(null);
  if (!datasets) return null;
  const chosenId = selected ?? datasets.active ?? datasets.datasets[0]?.id ?? null;
  const chosen = datasets.datasets.find((d) => d.id === chosenId);

  async function load() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.activateDataset(chosen.id));
      onLoaded();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack dataset-picker">
      <label>
        Veri seti
        <select value={chosenId ?? ''} onChange={(e) => setSelected(e.target.value)}>
          {datasets.datasets.map((d) => (
            <option key={d.id} value={d.id} disabled={!d.available}>
              {d.title}{d.id === datasets.active ? ' (yüklü)' : ''}{d.available ? '' : ' — indirilmemiş'}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <div className="dataset-card">
          <p>{chosen.description}</p>
          <p className="muted">
            {chosen.schema} · {chosen.files.map((f) => `${f.discipline}`).join(' + ')} · {chosen.license}
          </p>
          <p className="muted small">Kaynak: {chosen.attribution}</p>
          {!chosen.available && (
            <p className="error">Eksik dosyalar: {chosen.missingFiles.join(', ')}. Komut: <code>npm run datasets:fetch -- {chosen.id}</code></p>
          )}
        </div>
      )}
      <button type="button" className="primary" disabled={!chosen?.available || busy} onClick={load}>
        {busy ? 'Yükleniyor ve denetleniyor…' : 'Bu veri setini yükle ve denetle'}
      </button>
      <p className="muted small">Çalışma grafı bu veri setiyle değiştirilir; kurallar korunur.</p>
      <ErrorMessage error={error} />
      {result && (
        <p className="notice">
          {result.models.reduce((n, m) => n + m.elements, 0)} eleman, {result.intersections} kesişim,{' '}
          {result.audit.violations.length} bulgu — {(result.durationMs / 1000).toFixed(1)} sn.
        </p>
      )}
    </div>
  );
}
