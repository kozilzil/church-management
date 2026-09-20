import { describe, it, expect } from 'vitest';
import { parseCsv, csvCell } from './csv';
describe('CSV boundaries', () => {
  it('handles BOM, commas, embedded newlines, quotes and CRLF', () => {
    expect(parseCsv('\uFEFFa,b\r\n"a,b","two\n""lines"""')).toEqual([
      ['a', 'b'],
      ['a,b', 'two\n"lines"'],
    ]);
  });
  it('rejects ambiguous and malformed tables', () => {
    for (const x of ['a,a\n1,2', 'a,b\n1', 'a\n"unclosed', 'a\n"closed"x'])
      expect(() => parseCsv(x)).toThrow();
  });
  it('neutralizes spreadsheet formulas with leading controls', () => {
    for (const x of ['=1', ' +1', '\t@SUM(1)', '-1']) expect(csvCell(x)).toMatch(/^"'/);
  });
});
