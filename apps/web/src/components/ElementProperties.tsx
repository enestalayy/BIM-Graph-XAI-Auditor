import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { ElementDetail } from '../api/types.ts';
import { ErrorMessage } from './ErrorMessage.tsx';

interface ElementPropertiesProps {
  globalId: string;
  /** Property keys the rule checks; shown first and marked, also when missing. */
  checkedKeys: readonly string[];
}

/** Property sets of one element, for verifying property-rule labels (no geometry involved). */
export function ElementProperties({ globalId, checkedKeys }: ElementPropertiesProps) {
  const [element, setElement] = useState<ElementDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setElement(null);
    setError(null);
    api.getElement(globalId).then(setElement, setError);
  }, [globalId]);

  if (error) return <ErrorMessage error={error} />;
  if (!element) return <p className="muted">Özellikler yükleniyor…</p>;
  const psetKeys = Object.keys(element.properties).filter((k) => k.includes('.')).sort();
  const others = psetKeys.filter((k) => !checkedKeys.includes(k));
  const format = (v: unknown) => (v === undefined || v === null ? 'yok' : String(v));

  return (
    <div className="element-properties">
      <p className="small">
        <strong>{element.ref.ifcClass}</strong> {element.ref.name}
        {element.containers.length > 0 && <span className="muted"> · {element.containers.join(', ')}</span>}
      </p>
      <table>
        <tbody>
          {checkedKeys.map((k) => (
            <tr key={k} className="checked">
              <td><code>{k}</code> <span className="badge">kuralın aradığı</span></td>
              <td className={element.properties[k] == null ? 'missing' : ''}>{format(element.properties[k])}</td>
            </tr>
          ))}
          {others.map((k) => (
            <tr key={k}><td><code>{k}</code></td><td>{format(element.properties[k])}</td></tr>
          ))}
          {psetKeys.length === 0 && checkedKeys.length === 0 && <tr><td className="muted">Elemanda özellik seti yok.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
