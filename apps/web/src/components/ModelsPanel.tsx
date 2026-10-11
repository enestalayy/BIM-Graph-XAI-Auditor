import { useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import type { IngestOutcome, ModelSummary } from '../api/types.ts';
import { ErrorMessage } from './ErrorMessage.tsx';

interface ModelsPanelProps {
  models: readonly ModelSummary[];
  onChanged: () => void;
}

export function ModelsPanel({ models, onChanged }: ModelsPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [discipline, setDiscipline] = useState('ARCH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [last, setLast] = useState<IngestOutcome | null>(null);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setLast(await api.uploadModel(file, discipline));
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Modeller</h2>
      <form className="stack" onSubmit={upload}>
        <input type="file" accept=".ifc" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <label>
          Disiplin
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
            <option value="ARCH">Mimari (ARCH)</option>
            <option value="MEP">Mekanik/Elektrik/Tesisat (MEP)</option>
            <option value="STR">Taşıyıcı sistem (STR)</option>
          </select>
        </label>
        <button type="submit" disabled={!file || busy}>{busy ? 'Yükleniyor…' : 'Yükle ve grafa aktar'}</button>
      </form>
      <ErrorMessage error={error} />
      {last && (
        <p className="muted">
          {last.fileName}: {last.elements} eleman, {last.relations} ilişki; federe modelde {last.intersections} kesişim.
          {last.warnings.length > 0 && ` Uyarılar: ${last.warnings.join('; ')}`}
        </p>
      )}
      <table>
        <thead><tr><th>Dosya</th><th>Disiplin</th><th>Şema</th><th>Eleman</th></tr></thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.fileName}><td>{m.fileName}</td><td>{m.discipline}</td><td>{m.schema}</td><td>{m.elementCount}</td></tr>
          ))}
          {models.length === 0 && <tr><td colSpan={4} className="muted">Henüz model yüklenmedi.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
