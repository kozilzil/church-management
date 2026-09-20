export function parseCsv(text: string): string[][] {
  if (text.length > 500000) throw new Error('CSV는 500KB 이하로 입력하세요.');
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw new Error('따옴표 형식이 잘못되었습니다.');
      quoted = true;
      continue;
    }
    if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell);
      cell = '';
      closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
        if (rows.length > 501) throw new Error('한 번에 500행까지 가져올 수 있습니다.');
      }
    } else {
      if (closed) throw new Error('닫는 따옴표 뒤에는 구분자가 필요합니다.');
      cell += c;
    }
  }
  if (quoted) throw new Error('닫히지 않은 따옴표입니다.');
  if (cell || closed || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length < 2 || rows.length > 501)
    throw new Error('머리글과 1–500개 데이터 행이 필요합니다.');
  if (new Set(rows[0]).size !== rows[0]!.length || rows[0]!.some((x) => !x.trim()))
    throw new Error('머리글은 비어 있거나 중복될 수 없습니다.');
  if (rows.some((r) => r.length !== rows[0]!.length))
    throw new Error('열 수가 다른 행이 있습니다.');
  return rows;
}
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  let offset = 0;
  while (offset < text.length && (text.charCodeAt(offset) <= 32 || /\s/.test(text[offset]!)))
    offset++;
  if (/^[=+@-]/.test(text.slice(offset)) || (text.length > 0 && text.charCodeAt(0) < 32))
    text = "'" + text;

  return '"' + text.replaceAll('"', '""') + '"';
}
