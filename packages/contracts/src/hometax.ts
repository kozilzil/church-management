/** NTS A0420 electronic donation receipt media specification (2024-02). */
export type HometaxFileData = {
  donorName: string;
  issuerName: string;
  issuerRegistrationNumber: string;
  contactName: string;
  contactPhone: string;
  preparedOn: string;
  items: { id: string; givenOn: string; amount: number }[];
};
let korean: Map<string, number[]> | undefined;
// The standard specifies KSC-5601, not the wider CP949 extension. Build only
// the two-byte KS X 1001 repertoire using the platform's standard decoder.
export function ksc5601(text: string): Uint8Array<ArrayBuffer> {
  if (!korean) {
    korean = new Map();
    const decoder = new TextDecoder('euc-kr', { fatal: true });
    for (let hi = 0xa1; hi <= 0xfe; hi++) {
      for (let lo = 0xa1; lo <= 0xfe; lo++) {
        try {
          const char = decoder.decode(new Uint8Array([hi, lo]));
          if ([...char].length === 1 && char !== '\ufffd' && !korean.has(char))
            korean.set(char, [hi, lo]);
        } catch {
          /* unassigned code point */
        }
      }
    }
  }
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (cp <= 0x7f) bytes.push(cp);
    else {
      const encoded = korean.get(char);
      if (!encoded)
        throw new Error(
          '홈택스 파일에서 지원하지 않는 문자가 있습니다. 이름·기관·담당자 정보를 확인하세요.',
        );
      bytes.push(...encoded);
    }
  }
  return new Uint8Array(bytes);
}
function chars(value: string, width: number) {
  if (
    !value.trim() ||
    [...value].some((c) => c === '|' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('제출 항목에 빈 값이나 구분자·제어문자가 있습니다.');
  const length = ksc5601(value).length;
  if (length > width) throw new Error(`제출 항목이 홈택스 규격 ${width}바이트를 초과했습니다.`);
  return value + ' '.repeat(width - length);
}
function number(value: number, width: number) {
  if (!Number.isSafeInteger(value) || value < 0 || String(value).length > width)
    throw new Error('제출 금액·건수 범위를 확인하세요.');
  return String(value).padStart(width, '0');
}
function date(value: string) {
  const d = new Date(value + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value
  )
    throw new Error('제출 날짜를 확인하세요.');
  return value.replaceAll('-', '');
}
export function validBusinessNumber(value: string) {
  if (!/^\d{10}$/.test(value) || /^0+$/.test(value)) return false;
  const d = [...value].map(Number),
    weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((n, w, i) => n + w * d[i]!, 0) + Math.floor((d[8]! * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}
export function validHometaxIdentity(value: string) {
  if (!/^\d{6}-?[1-8]\d{6}$/.test(value)) return false;
  const n = value.replace('-', '');
  const century = '1256'.includes(n[6]!) ? '19' : '20';
  try {
    date(`${century}${n.slice(0, 2)}-${n.slice(2, 4)}-${n.slice(4, 6)}`);
    return true;
  } catch {
    return false;
  }
}
export function hometaxFile(data: HometaxFileData, identity: string) {
  if (!validHometaxIdentity(identity))
    throw new Error('주민등록번호의 자리수와 생년월일을 확인하세요.');
  const reg = data.issuerRegistrationNumber.replaceAll('-', '');
  if (!validBusinessNumber(reg)) throw new Error('발급기관 고유번호/사업자번호를 확인하세요.');
  if (data.items.length < 1 || data.items.length > 500)
    throw new Error('한 파일에는 1~500건을 포함해야 합니다.');
  if (!/^[0-9-]{9,14}$/.test(data.contactPhone)) throw new Error('담당자 연락처를 확인하세요.');
  const ids = new Set<string>();
  const dates = data.items.map((x) => date(x.givenOn)).sort();
  const total = data.items.reduce((n, x) => n + x.amount, 0);
  const rows = [
    [
      'B',
      'A0420',
      reg,
      chars(data.issuerName, 50),
      chars(data.contactName, 30),
      chars(data.contactPhone, 14),
      date(data.preparedOn),
      dates[0],
      dates.at(-1),
      number(data.items.length, 10),
      number(total, 15),
      '',
    ].join('|'),
    ...data.items.map((x) => {
      const id = x.id.replaceAll('-', '');
      if (!/^[a-f0-9]{32}$/i.test(id) || ids.has(id) || x.amount < 1)
        throw new Error('제출 항목 식별자·금액을 확인하세요.');
      ids.add(id);
      return [
        'D',
        reg,
        '01',
        identity.replace('-', ''),
        chars(data.donorName, 30),
        '41',
        '1',
        chars(id, 50),
        '405',
        date(x.givenOn),
        number(x.amount, 15),
        number(x.amount, 15),
        number(0, 15),
        ' '.repeat(46),
        '',
      ].join('|');
    }),
  ];
  return {
    filename: `A0420_${reg}${date(data.preparedOn)}.D001`,
    bytes: ksc5601(rows.join('\r\n') + '\r\n'),
  };
}

/** Validate all non-identity fields before reserving any offerings. */
export function validateHometaxData(data: HometaxFileData) {
  hometaxFile(data, '0001013000000'); // synthetic format-only value; never stored or exported
}
