import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { hometaxFile, ksc5601, validHometaxIdentity } from '@church/contracts';
import { HometaxPanel } from './HometaxPanel';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const item = {
  id: '11111111-1111-4111-8111-111111111111',
  givenOn: '2020-01-02',
  amount: 15000,
  state: 'PENDING',
  results: [],
};
const data = {
  id: 'submission',
  donorName: '가상 기부자',
  issuerName: '가상 교회',
  issuerRegistrationNumber: '000-00-00015',
  contactName: '가상 담당',
  contactPhone: '02-0000-0000',
  preparedOn: '2026-09-20',
  taxYear: 2020,
  totalAmount: 15000,
  items: [item],
};
describe('Hometax official media contract', () => {
  it('writes exact KS X 1001 B/D byte offsets, trailing pipe, CRLF and official totals', () => {
    const file = hometaxFile(data, '000101-3000000');
    expect(file.filename).toBe('A0420_000000001520260920.D001');
    expect([...ksc5601('가상')]).toEqual([0xb0, 0xa1, 0xbb, 0xf3]);
    const text = new TextDecoder('euc-kr').decode(file.bytes),
      lines = text.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(ksc5601(lines[0]!).length).toBe(170);
    expect(ksc5601(lines[1]!).length).toBe(225);
    const b = file.bytes.slice(0, 170),
      d = file.bytes.slice(172, 397);
    const ascii = (s: Uint8Array) => new TextDecoder().decode(s);
    expect(ascii(b.slice(143, 153))).toBe('0000000001');
    expect(ascii(b.slice(154, 169))).toBe('000000000015000');
    expect(ascii(d.slice(13, 15))).toBe('01');
    expect(ascii(d.slice(16, 29))).toBe('0001013000000');
    expect(ascii(d.slice(61, 63))).toBe('41');
    expect(ascii(d.slice(64, 65))).toBe('1');
    expect(ascii(d.slice(117, 120))).toBe('405');
    expect(d[224]).toBe(124);
    expect(ascii(d.slice(146, 161))).toBe('000000000015000');
    expect(ascii(d.slice(162, 177))).toBe('000000000000000');
  });
  it('rejects delimiter injection, unsupported characters, byte overflow, invalid dates, IDs and registration numbers', () => {
    for (const patch of [
      { donorName: '가'.repeat(16) },
      { donorName: 'A|B' },
      { donorName: 'A\nB' },
      { donorName: '😀' },
      { donorName: '힣' },
      { issuerRegistrationNumber: '000-00-00000' },
      { preparedOn: '2026-02-30' },
      { items: [] },
      { items: [item, item] },
      { items: [{ ...item, amount: 1.1 }] },
      { items: [{ ...item, id: 'not-a-uuid' }] },
    ])
      expect(() => hometaxFile({ ...data, ...patch }, '0001013000000')).toThrow();
    expect(validHometaxIdentity('0002303000000')).toBe(false);
    expect(validHometaxIdentity('0001019000000')).toBe(false);
  });
  it('handles multiple records and exact maximum byte boundaries without silent truncation', () => {
    const file = hometaxFile(
      {
        ...data,
        donorName: '가'.repeat(15),
        items: [
          { ...item, givenOn: '2020-12-31' },
          {
            ...item,
            id: '22222222-2222-4222-8222-222222222222',
            givenOn: '2020-01-01',
            amount: 25000,
          },
        ],
      },
      '0001013000000',
    );
    const text = new TextDecoder('euc-kr').decode(file.bytes),
      b = text.split('\r\n')[0]!.split('|');
    expect(b.slice(7, 11)).toEqual(['20200101', '20201231', '0000000002', '000000000040000']);
    expect(file.bytes.length).toBe(172 + 227 * 2);
  });
});
describe('Hometax workflow UI', () => {
  function mock(state = 'PENDING') {
    const f = vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => {
        if (url.endsWith('/hometax-submissions') && !init?.body)
          return {
            items: [
              {
                ...data,
                itemCount: 1,
                pendingCount: state === 'PENDING' ? 1 : 0,
                issuedCount: state === 'ISSUED' ? 1 : 0,
              },
            ],
            nextCursor: null,
          };
        return { ...data, items: [{ ...item, state }] };
      },
    }));
    vi.stubGlobal('fetch', f);
    return f;
  }
  it('downloads without sending or retaining the resident identifier and requires non-submission acknowledgement', async () => {
    const f = mock(),
      create = vi.fn(() => 'blob:synthetic'),
      revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<HometaxPanel base="/churches/test/finance" can={() => true} />);
    fireEvent.click(await screen.findByRole('button', { name: '제출 내역 보기' }));
    const input = await screen.findByLabelText('제출용 기부자 주민등록번호');
    fireEvent.change(input, { target: { value: '000101-3000000' } });
    fireEvent.click(
      screen.getByLabelText(
        '이 기부자의 번호이며, 아직 제출하지 않았거나 홈택스의 기존 업로드를 삭제한 것을 확인했습니다.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '홈택스 제출 파일 다운로드' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(input).toHaveValue('');
    expect(JSON.stringify(f.mock.calls)).not.toContain('000101');
    const sent = f.mock.calls.find(([url]) => url.endsWith('/download'))!;
    expect(JSON.parse(String(sent[1]!.body))).toEqual({ notSubmittedConfirmed: true });
    expect(screen.getByText(/결과 미확인은 발급 완료를 뜻하지/)).toBeInTheDocument();
  });
  it('prevents redownload after issuance and offers cancellation confirmation rather than local issuance', async () => {
    mock('ISSUED');
    render(<HometaxPanel base="/churches/test/finance" can={() => true} />);
    fireEvent.click(await screen.findByRole('button', { name: '제출 내역 보기' }));
    await screen.findByText(/관리 식별자/);
    expect(
      screen.queryByRole('button', { name: '홈택스 제출 파일 다운로드' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: '취소 확인' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '미발급 확인' })).not.toBeInTheDocument();
  });
});
