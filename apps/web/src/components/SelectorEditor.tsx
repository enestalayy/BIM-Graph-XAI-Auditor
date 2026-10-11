import type { Condition, Selector } from '../api/types.ts';
import { ConditionList } from './ConditionList.tsx';

interface SelectorEditorProps {
  label: string;
  selector: { classes: string[]; where?: Condition[] };
  classListId: string;
  propertyListId: string;
  onChange: (selector: Selector) => void;
}

/** IFC classes (any of them, subtypes included) plus conditions that all must hold. */
export function SelectorEditor({ label, selector, classListId, propertyListId, onChange }: SelectorEditorProps) {
  const where = selector.where ?? [];
  const setClasses = (classes: string[]) => onChange({ classes, where });
  return (
    <fieldset className="selector">
      <legend>{label}</legend>
      <div className="classes">
        {selector.classes.map((cls, index) => (
          <span className="class-entry" key={index}>
            <input
              list={classListId}
              value={cls}
              onChange={(e) => setClasses(selector.classes.map((c, i) => (i === index ? e.target.value : c)))}
            />
            {selector.classes.length > 1 && (
              <button type="button" className="ghost" aria-label="Sınıfı sil" onClick={() => setClasses(selector.classes.filter((_, i) => i !== index))}>✕</button>
            )}
          </span>
        ))}
        <button type="button" className="ghost" onClick={() => setClasses([...selector.classes, ''])}>+ sınıf</button>
      </div>
      <ConditionList
        conditions={where}
        propertyListId={propertyListId}
        emptyText="Ek koşul yok (sınıfın tüm elemanları)."
        onChange={(next) => onChange({ classes: selector.classes, where: next })}
      />
    </fieldset>
  );
}
