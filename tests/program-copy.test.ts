import { describe, expect, it } from 'vitest';
import packageCopy from '../program.json';
import bundledCopy from '../src/program/program.json';

// CLAUDE.md rule 5: src/program/program.json is an unchanged copy.
describe('program.json', () => {
  it('the bundled copy matches the package copy', () => {
    expect(bundledCopy).toEqual(packageCopy);
  });
});
