import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { RuleInput, Vocabulary } from '../api/types.ts';
import { newRule } from '../lib/rule-draft.ts';
import { SEVERITY_LABEL } from '../lib/severity.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import { RuleEditor } from './RuleEditor.tsx';

interface RulesPanelProps {
  vocabulary: Vocabulary;
  onSaved: () => void;
}

export function RulesPanel({ vocabulary, onSaved }: RulesPanelProps) {
  const [rules, setRules] = useState<RuleInput[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRules((await api.getRules()).rules);
      setDirty(false);
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update(next: RuleInput[]) {
    setRules(next);
    setDirty(true);
    setNotice(null);
  }

  async function save() {
    if (!rules) return;
    setError(null);
    try {
      setRules((await api.saveRules({ version: 1, rules })).rules);
      setDirty(false);
      setNotice('Kural seti kaydedildi. Değişikliklerin etkisini görmek için denetimi yeniden çalıştırın.');
      onSaved();
    } catch (e) {
      setError(e);
    }
  }

  if (!rules) return <section className="panel"><h2>Kurallar</h2><ErrorMessage error={error} /></section>;
  const current = rules[selected];

  return (
    <section className="panel">
      <h2>Kurallar</h2>
      <div className="row">
        <button type="button" onClick={() => { update([...rules, newRule('property', rules.map((r) => r.id))]); setSelected(rules.length); }}>+ Özellik kuralı</button>
        <button type="button" onClick={() => { update([...rules, newRule('intersection', rules.map((r) => r.id))]); setSelected(rules.length); }}>+ Kesişim kuralı</button>
      </div>
      <ul className="rule-list">
        {rules.map((rule, index) => (
          <li key={index} className={index === selected ? 'selected' : ''}>
            <input
              type="checkbox"
              aria-label="Etkin"
              checked={rule.enabled ?? true}
              onChange={(e) => update(rules.map((r, i) => (i === index ? { ...r, enabled: e.target.checked } : r)))}
            />
            <button type="button" className="link" onClick={() => setSelected(index)}>
              <span className={`badge ${rule.severity}`}>{SEVERITY_LABEL[rule.severity]}</span> <code>{rule.id}</code> {rule.title}
            </button>
          </li>
        ))}
      </ul>
      <div className="row sticky">
        <button type="button" className="primary" disabled={!dirty} onClick={save}>Kaydet</button>
        <button type="button" disabled={!dirty} onClick={load}>Değişiklikleri geri al</button>
      </div>
      <ErrorMessage error={error} />
      {notice && <p className="notice">{notice}</p>}
      {current && (
        <RuleEditor
          key={selected}
          rule={current}
          vocabulary={vocabulary}
          onChange={(rule) => update(rules.map((r, i) => (i === selected ? rule : r)))}
          onDelete={() => { update(rules.filter((_, i) => i !== selected)); setSelected(Math.max(0, selected - 1)); }}
        />
      )}
    </section>
  );
}
