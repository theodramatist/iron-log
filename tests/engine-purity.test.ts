// SPEC.md acceptance criterion 2: src/engine/ imports nothing from the DOM,
// storage, or the clock. (tsconfig.engine.json and ESLint enforce this too.)
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('../src/engine/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('engine purity', () => {
  it('finds the engine sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
  });

  for (const [file, raw] of Object.entries(sources)) {
    it(`${file.replace('../src/', '')} never touches the clock, DOM, or storage`, () => {
      const src = stripComments(raw);
      expect(src).not.toMatch(/new Date\(\s*\)/);
      expect(src).not.toMatch(/Date\.now\s*\(/);
      expect(src).not.toMatch(/\b(window|document|localStorage|sessionStorage|indexedDB|navigator)\b/);
      expect(src).not.toMatch(/from\s+['"](idb|preact[^'"]*|\.\.\/ui\/[^'"]*|\.\.\/data\/[^'"]*)['"]/);
    });
  }
});
