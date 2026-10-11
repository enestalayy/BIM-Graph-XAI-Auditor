import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { IFCDUCTSEGMENTTYPE, IFCFLOWSEGMENT, IFCPIPESEGMENTTYPE, IFCWALL, IFCWALLTYPE, IFCFLOWTERMINAL } from 'web-ifc';
import { isOfClass } from '@bim/core';
import { getIfcApi } from '../src/api.ts';
import { deriveOccurrenceClasses } from '../src/derived-classes.ts';
import { parseIfc } from '../src/index.ts';

describe('deriveOccurrenceClasses', () => {
  it('maps a generic IFC2x3 occurrence to the IFC4 class implied by its type object', async () => {
    const api = await getIfcApi();
    assert.deepEqual(deriveOccurrenceClasses(api, IFCFLOWSEGMENT, IFCDUCTSEGMENTTYPE), ['IfcDuctSegment']);
    assert.deepEqual(deriveOccurrenceClasses(api, IFCFLOWSEGMENT, IFCPIPESEGMENTTYPE), ['IfcPipeSegment']);
  });

  it('derives nothing when the occurrence already is that class or the type does not fit', async () => {
    const api = await getIfcApi();
    assert.deepEqual(deriveOccurrenceClasses(api, IFCWALL, IFCWALLTYPE), []);
    assert.deepEqual(deriveOccurrenceClasses(api, IFCFLOWTERMINAL, IFCDUCTSEGMENTTYPE), []);
  });
});

const DUPLEX_MEP = new URL('../../../data/duplex/Duplex_MEP_20110907.ifc', import.meta.url);

describe('IFC2x3 Duplex MEP model', { skip: existsSync(DUPLEX_MEP) ? false : 'data/duplex not downloaded (npm run datasets:duplex)' }, () => {
  it('exposes ducts and pipes under their IFC4 classes and records the type class', async () => {
    const model = await parseIfc(new Uint8Array(await readFile(DUPLEX_MEP)), { fileName: 'Duplex_MEP_20110907.ifc', discipline: 'MEP' });
    const segments = model.elements.filter((e) => e.ifcClass === 'IfcFlowSegment');
    assert.ok(segments.some((e) => isOfClass(e, 'IfcDuctSegment') && e.typeClass === 'IfcDuctSegmentType'));
    assert.ok(segments.some((e) => isOfClass(e, 'IfcPipeSegment')));
    assert.ok(segments.every((e) => isOfClass(e, 'IfcFlowSegment')));
  });
});
