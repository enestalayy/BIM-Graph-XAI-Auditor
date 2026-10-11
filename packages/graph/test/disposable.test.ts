import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readDisposableGraphConfig } from '../src/index.ts';

const base = { NEO4J_USER: 'neo4j', NEO4J_PASSWORD: 'secret' };

describe('readDisposableGraphConfig', () => {
  it('returns the test database configuration', () => {
    assert.equal(readDisposableGraphConfig({ ...base, NEO4J_URI: 'bolt://localhost:7687', NEO4J_TEST_URI: 'bolt://localhost:7688' }).uri, 'bolt://localhost:7688');
  });

  it('refuses when the test database is the working database', () => {
    assert.throws(() => readDisposableGraphConfig({ ...base, NEO4J_URI: 'bolt://localhost:7687', NEO4J_TEST_URI: 'BOLT://localhost:7687/' }), /refusing to wipe/);
  });

  it('requires NEO4J_TEST_URI', () => {
    assert.throws(() => readDisposableGraphConfig({ ...base }), /NEO4J_TEST_URI/);
  });
});
