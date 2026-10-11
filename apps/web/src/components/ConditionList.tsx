import type { Condition } from '../api/types.ts';
import { changeOperator, formatConditionValue, OPERATORS, parseConditionValue } from '../lib/rule-draft.ts';

interface ConditionListProps {
  conditions: readonly Condition[];
  propertyListId: string;
  onChange: (conditions: Condition[]) => void;
  emptyText: string;
}

export function ConditionList({ conditions, propertyListId, onChange, emptyText }: ConditionListProps) {
  const update = (index: number, next: Condition) => onChange(conditions.map((c, i) => (i === index ? next : c)));
  return (
    <div className="conditions">
      {conditions.length === 0 && <div className="muted">{emptyText}</div>}
      {conditions.map((condition, index) => (
        <div className="condition-row" key={index}>
          <input
            list={propertyListId}
            value={condition.property}
            placeholder="Pset_WallCommon.FireRating"
            onChange={(e) => update(index, { ...condition, property: e.target.value })}
          />
          <select value={condition.op} onChange={(e) => update(index, changeOperator(condition, e.target.value as Condition['op']))}>
            {OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
          </select>
          {'value' in condition && (
            <input
              defaultValue={formatConditionValue(condition.value)}
              key={`${index}-${condition.op}`}
              placeholder="değer"
              onBlur={(e) => update(index, { ...condition, value: parseConditionValue(condition.op, e.target.value) } as Condition)}
            />
          )}
          <button type="button" className="ghost" aria-label="Koşulu sil" onClick={() => onChange(conditions.filter((_, i) => i !== index))}>✕</button>
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => onChange([...conditions, { property: '', op: 'exists' }])}>+ koşul</button>
    </div>
  );
}
