import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { Review, Verdict } from '../api/types.ts';
import type { Highlight } from '../viewer/scene.ts';
import { ErrorMessage } from './ErrorMessage.tsx';

const DATASET = 'duplex';

const VERDICTS: ReadonlyArray<{ verdict: Verdict; label: string }> = [
  { verdict: 'agree', label: 'Doğru' },
  { verdict: 'disagree', label: 'Yanlış' },
  { verdict: 'unsure', label: 'Emin değilim' },
];

interface ReviewPanelProps {
  activeDataset: string | null;
  onDatasetLoaded: () => void;
  onHighlight: (highlight: Highlight | null) => void;
}

/** Human spot-check of the reference labels: look at each sampled label in 3D and record a verdict. */
export function ReviewPanel({ activeDataset, onDatasetLoaded, onHighlight }: ReviewPanelProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [current, setCurrent] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.getReview(DATASET).then(setReview, setError);
  }, []);

  const item = review?.items[current];
  useEffect(() => {
    if (!item) return onHighlight(null);
    setComment(item.comment);
    onHighlight({ subject: item.elements[0], object: item.elements[1] });
    // Re-run only when the shown item changes, not when its verdict is updated.
  }, [item?.index]);

  async function loadDataset() {
    setBusy(true);
    setError(null);
    try {
      await api.activateDataset(DATASET);
      onDatasetLoaded();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function decide(verdict: Verdict) {
    if (!item || !review) return;
    setError(null);
    try {
      const next = await api.saveVerdict(DATASET, item.index, verdict, comment);
      setReview(next);
      const nextOpen = next.items.findIndex((i, n) => n > current && i.verdict === null);
      if (nextOpen >= 0) setCurrent(nextOpen);
    } catch (e) {
      setError(e);
    }
  }

  if (!review) return <section className="panel"><h2>Doğrulama</h2><ErrorMessage error={error} /></section>;
  const { summary } = review;

  return (
    <section className="panel">
      <h2>Doğrulama — Duplex etiketleri</h2>
      <p className="muted">{review.question}</p>
      {activeDataset !== DATASET && (
        <div className="dataset-card">
          <p>Etiketleri 3D'de görmek için Duplex veri seti yüklü olmalı.</p>
          <button type="button" className="primary" disabled={busy} onClick={loadDataset}>{busy ? 'Yükleniyor…' : "Duplex'i yükle"}</button>
        </div>
      )}
      <p>
        <strong>{summary.reviewed}/{summary.total}</strong> incelendi · doğru {summary.agree}, yanlış {summary.disagree}, emin değil {summary.unsure}
        {summary.agreement !== null && <> · uyum <strong>%{Math.round(summary.agreement * 100)}</strong></>}
      </p>
      <ErrorMessage error={error} />

      {item && (
        <div className="review-item">
          <div className="row">
            <button type="button" disabled={current === 0} onClick={() => setCurrent(current - 1)}>‹ Önceki</button>
            <strong>#{item.index}</strong> <code>{item.ruleId}</code>
            <button type="button" disabled={current === review.items.length - 1} onClick={() => setCurrent(current + 1)}>Sonraki ›</button>
          </div>
          <p>{item.note}</p>
          <p className="muted small">
            <span className="swatch subject" /> <code>{item.elements[0]}</code>
            {item.elements[1] && <> &nbsp; <span className="swatch object" /> <code>{item.elements[1]}</code></>}
          </p>
          <textarea rows={2} placeholder="Not (isteğe bağlı)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="row">
            {VERDICTS.map((v) => (
              <button key={v.verdict} type="button" className={item.verdict === v.verdict ? 'primary' : ''} onClick={() => decide(v.verdict)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="review-list">
        {review.items.map((i, n) => (
          <li key={i.index}>
            <button type="button" className={`link ${n === current ? 'current' : ''}`} onClick={() => setCurrent(n)}>
              <span className={`badge ${i.verdict === 'agree' ? 'ok' : i.verdict === 'disagree' ? 'critical' : ''}`}>
                {i.verdict === null ? '—' : VERDICTS.find((v) => v.verdict === i.verdict)!.label}
              </span>{' '}
              <code>{i.ruleId}</code> {i.note}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
