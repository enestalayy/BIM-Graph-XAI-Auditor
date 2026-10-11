import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { RuleValidationError } from '@bim/core';
import { readServerConfig } from '../src/config.ts';
import { createFileRuleRepository } from '../src/services/rule-repository.ts';
import { assertSafeIfcFileName } from '../src/services/upload-store.ts';

describe('readServerConfig', () => {
  it('uses safe defaults resolved against the working directory', () => {
    const config = readServerConfig({}, '/repo');
    assert.equal(config.port, 3000);
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.rulesFile, '/repo/rules/default.json');
    assert.equal(config.clashTolerance, 0.001);
    assert.equal(config.defaultExplainer, 'template');
  });

  it('rejects invalid numbers and unknown explainers instead of guessing', () => {
    assert.throws(() => readServerConfig({ CLASH_TOLERANCE_M: 'abc' }), /CLASH_TOLERANCE_M/);
    assert.throws(() => readServerConfig({ EXPLAINER: 'gpt' }), /EXPLAINER/);
  });
});

describe('assertSafeIfcFileName', () => {
  it('accepts ordinary IFC file names', () => {
    assert.equal(assertSafeIfcFileName('Building-Hvac (v2).ifc'), 'Building-Hvac (v2).ifc');
  });

  it('rejects paths, traversal, hidden files and other extensions', () => {
    for (const bad of ['../etc/passwd.ifc', 'a/b.ifc', '.hidden.ifc', 'model.ifczip', 'model.exe']) {
      assert.throws(() => assertSafeIfcFileName(bad), /Invalid IFC file name/, bad);
    }
  });
});

describe('file rule repository', () => {
  const rule = {
    id: 'R-1', kind: 'property', title: 'Walls need a fire rating', severity: 'minor',
    regulation: { source: 'Test', article: null },
    target: { classes: ['IfcWall'] }, require: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }],
  };

  it('stores a validated rule set with defaults applied and loads it back', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'rules-')), 'rules.json');
    const repo = createFileRuleRepository(path);
    await repo.save({ version: 1, rules: [rule] });
    const loaded = await repo.load();
    assert.equal(loaded.rules[0]!.enabled, true);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).rules[0].regulation.verified, false);
  });

  it('refuses to overwrite the file with an invalid rule set', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'rules-')), 'rules.json');
    await writeFile(path, JSON.stringify({ version: 1, rules: [rule] }));
    const repo = createFileRuleRepository(path);
    await assert.rejects(repo.save({ version: 1, rules: [{ ...rule, target: { classes: ['Wall'] } }] }), RuleValidationError);
    const [stored] = (await repo.load()).rules;
    assert.ok(stored?.kind === 'property');
    assert.equal(stored.target.classes[0], 'IfcWall');
  });

  it('reports a missing rule file clearly', async () => {
    await assert.rejects(createFileRuleRepository('/nonexistent/rules.json').load(), /Cannot read rule file/);
  });
});
