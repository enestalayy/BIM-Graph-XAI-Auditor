import { useState } from 'react';
import { api } from '../api/client.ts';
import type { RuleInput, Vocabulary } from '../api/types.ts';
import { ConditionList } from './ConditionList.tsx';
import { ErrorMessage } from './ErrorMessage.tsx';
import { SelectorEditor } from './SelectorEditor.tsx';

interface RuleEditorProps {
  rule: RuleInput;
  vocabulary: Vocabulary;
  onChange: (rule: RuleInput) => void;
  onDelete: () => void;
}

const CLASS_LIST = 'vocabulary-classes';
const PROPERTY_LIST = 'vocabulary-properties';
const FIXED_KEYS = ['name', 'predefinedType', 'ifcClass', 'category'];

export function RuleEditor({ rule, vocabulary, onChange, onDelete }: RuleEditorProps) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState('');
  const [cypher, setCypher] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const set = (patch: Partial<RuleInput>) => onChange({ ...rule, ...patch } as RuleInput);
  const regulation = rule.regulation;

  async function preview() {
    setError(null);
    try {
      setCypher((await api.compileRule(rule)).cypher);
    } catch (e) {
      setCypher(null);
      setError(e);
    }
  }

  function openJson() {
    setJsonText(JSON.stringify(rule, null, 2));
    setMode('json');
  }

  function applyJson() {
    try {
      onChange(JSON.parse(jsonText) as RuleInput);
      setError(null);
      setMode('form');
    } catch (e) {
      setError(new Error(`JSON okunamadı: ${(e as Error).message}`));
    }
  }

  return (
    <div className="rule-editor">
      <datalist id={CLASS_LIST}>{vocabulary.classes.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id={PROPERTY_LIST}>{[...FIXED_KEYS, ...vocabulary.propertyKeys].map((k) => <option key={k} value={k} />)}</datalist>

      <div className="tabs small">
        <button type="button" className={mode === 'form' ? 'active' : ''} onClick={() => setMode('form')}>Form</button>
        <button type="button" className={mode === 'json' ? 'active' : ''} onClick={openJson}>JSON</button>
      </div>

      {mode === 'json' ? (
        <div className="stack">
          <textarea className="code" rows={22} value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
          <button type="button" onClick={applyJson}>JSON'u uygula</button>
        </div>
      ) : (
        <div className="stack">
          <div className="grid-2">
            <label>Kimlik<input value={rule.id} onChange={(e) => set({ id: e.target.value })} /></label>
            <label>
              Önem
              <select value={rule.severity} onChange={(e) => set({ severity: e.target.value as RuleInput['severity'] })}>
                <option value="critical">Kritik</option>
                <option value="major">Majör</option>
                <option value="minor">Minör</option>
              </select>
            </label>
          </div>
          <label>Başlık<input value={rule.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label>Açıklama<textarea rows={2} value={rule.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} /></label>
          <label className="inline"><input type="checkbox" checked={rule.enabled ?? true} onChange={(e) => set({ enabled: e.target.checked })} /> Etkin</label>

          <fieldset>
            <legend>Yönetmelik dayanağı</legend>
            <label>Kaynak<input value={regulation.source} onChange={(e) => set({ regulation: { ...regulation, source: e.target.value } })} /></label>
            <div className="grid-2">
              <label>
                Madde
                <input
                  value={regulation.article ?? ''}
                  placeholder="doğrulanmadı"
                  onChange={(e) => set({ regulation: { ...regulation, article: e.target.value || null } })}
                />
              </label>
              <label className="inline">
                <input type="checkbox" checked={regulation.verified ?? false} onChange={(e) => set({ regulation: { ...regulation, verified: e.target.checked } })} />
                Mevzuat metninden doğrulandı
              </label>
            </div>
          </fieldset>

          {rule.kind === 'property' ? (
            <>
              <SelectorEditor label="Hedef elemanlar" selector={rule.target} classListId={CLASS_LIST} propertyListId={PROPERTY_LIST} onChange={(target) => set({ target })} />
              <fieldset>
                <legend>Zorunlu koşullar (hepsi sağlanmalı)</legend>
                <ConditionList conditions={rule.require} propertyListId={PROPERTY_LIST} emptyText="En az bir koşul gerekli." onChange={(require) => set({ require })} />
              </fieldset>
            </>
          ) : (
            <>
              <SelectorEditor label="Konu (kesen eleman)" selector={rule.subject} classListId={CLASS_LIST} propertyListId={PROPERTY_LIST} onChange={(subject) => set({ subject })} />
              <SelectorEditor label="Nesne (kesilen eleman)" selector={rule.object} classListId={CLASS_LIST} propertyListId={PROPERTY_LIST} onChange={(object) => set({ object })} />
              <label>
                En küçük kesişim hacmi (m³)
                <input type="number" min={0} step={0.001} value={rule.minVolume ?? 0} onChange={(e) => set({ minVolume: Number(e.target.value) })} />
              </label>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={Boolean(rule.mitigation)}
                  onChange={(e) => set({ mitigation: e.target.checked ? { classes: ['IfcDamper'], where: [], maxDistance: 0.5 } : undefined })}
                />
                Koruyucu eleman varsa ihlal sayma
              </label>
              {rule.mitigation && (
                <>
                  <SelectorEditor
                    label="Koruyucu eleman"
                    selector={rule.mitigation}
                    classListId={CLASS_LIST}
                    propertyListId={PROPERTY_LIST}
                    onChange={(m) => set({ mitigation: { ...m, maxDistance: rule.mitigation!.maxDistance } })}
                  />
                  <label>
                    Kesişim merkezine en büyük mesafe (m)
                    <input
                      type="number" min={0} step={0.1} value={rule.mitigation.maxDistance}
                      onChange={(e) => set({ mitigation: { ...rule.mitigation!, maxDistance: Number(e.target.value) } })}
                    />
                  </label>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="row">
        <button type="button" onClick={preview}>Cypher önizle</button>
        <button type="button" className="danger" onClick={onDelete}>Kuralı sil</button>
      </div>
      <ErrorMessage error={error} />
      {cypher && <pre className="code">{cypher}</pre>}
    </div>
  );
}
