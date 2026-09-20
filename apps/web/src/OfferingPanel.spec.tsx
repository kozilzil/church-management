import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { OfferingPanel } from './OfferingPanel';
import { ReceiptPanel } from './ReceiptPanel';
import { receiptHtml, validPrintIdentity, type ReceiptDocument } from './receipt-print';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const donor = {
  id: 'donor',
  name: '가상 기부자',
  address: '가상 주소',
  version: 1,
  memberId: null,
};
const row = {
  id: 'offering',
  donorId: donor.id,
  donorName: donor.name,
  donor,
  typeId: 'type',
  assetAccountId: 'asset',
  givenOn: '2020-01-02',
  amount: 15000,
  reference: 'SYNTHETIC-ONE',
  source: 'BANK',
  state: 'REVIEWED',
  version: 2,
  createdBy: 'entry',
  editedBy: 'entry',
  events: [],
};
const doc: ReceiptDocument = {
  id: 'receipt',
  number: 'D-2026-000001',
  taxYear: 2020,
  donorName: donor.name,
  donorAddress: donor.address,
  issuerName: '가상 교회',
  issuerRegistrationNumber: '000-00-00000',
  issuerAddress: '가상 기관주소',
  issuerRepresentative: '가상 대표',
  issuerLegalBasis: '테스트 근거',
  totalAmount: 15000,
  issuedOn: '2026-09-20',
  items: [{ offeringId: row.id, givenOn: '2020-01-02', amount: 15000, typeName: '감사' }],
  cancellation: null,
};
function mock() {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => {
      if (url.endsWith('/offering-definitions'))
        return { accounts: [{ id: 'asset', name: '입금 통장', kind: 'ASSET' }], funds: [] };
      if (url.endsWith('/offering-types'))
        return { items: [{ id: 'type', name: '감사헌금', receiptEligible: true }] };
      if (url.includes('/offerings/offering')) return row;
      if (url.includes('/offerings'))
        return init?.body ? { id: row.id } : { items: [row], nextCursor: null };
      if (url.includes('/receipts/receipt')) return doc;
      if (url.includes('/receipts/preview'))
        return {
          donor,
          issuer: { name: '가상 교회', version: 1, electronicRequired: false },
          items: [{ id: row.id, givenOn: row.givenOn, amount: row.amount, typeName: '감사' }],
          totalAmount: 15000,
          taxYear: 2020,
          remainingCount: 0,
        };
      if (url.includes('/donors')) return { items: [donor], nextCursor: null };
      if (url.endsWith('/receipts'))
        return init?.body
          ? { id: doc.id }
          : { items: [{ ...doc, cancelled: false }], nextCursor: null };
      return { items: [], nextCursor: null };
    },
  }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('Individual offerings and receipts UI', () => {
  it('registers one anonymous offering without a batch or donor and blocks unsaved posting', async () => {
    const f = mock();
    render(
      <OfferingPanel
        root="/churches/test"
        permissions={['offering.read', 'offering.write', 'offering.post']}
        userId="entry"
      />,
    );
    await screen.findByRole('option', { name: '감사헌금' });
    fireEvent.click(screen.getByLabelText('익명 헌금 (영수증 발급 제외)'));
    fireEvent.change(screen.getByLabelText('헌금일'), { target: { value: '2020-01-02' } });
    fireEvent.change(screen.getByLabelText('금액 (원)'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('헌금 종류'), { target: { value: 'type' } });
    fireEvent.change(screen.getByLabelText('입금 계정'), { target: { value: 'asset' } });
    fireEvent.change(screen.getByLabelText('접수 참조 (중복 방지)'), {
      target: { value: 'TEST-ONE' },
    });
    fireEvent.click(screen.getByRole('button', { name: '헌금 저장' }));
    await waitFor(() =>
      expect(f.mock.calls.some(([u, i]) => u.endsWith('/offerings') && i?.body)).toBe(true),
    );
    const sent = JSON.parse(
      String(f.mock.calls.find(([u, i]) => u.endsWith('/offerings') && i?.body)![1]!.body),
    );
    expect(sent.amount).toBe(15000);
    expect(sent).not.toHaveProperty('batchId');
    expect(sent).not.toHaveProperty('donorId');
    const post = await screen.findByRole('button', { name: '회계 반영' });
    expect(post).toBeEnabled();
    fireEvent.change(screen.getByLabelText('금액 (원)'), { target: { value: '16000' } });
    expect(post).toBeDisabled();
  });
  it('requires acknowledgement, issues the previewed IDs, and clears acknowledgement on donor change', async () => {
    const f = mock();
    render(<ReceiptPanel base="/churches/test/finance" can={() => true} />);
    fireEvent.click(screen.getByRole('button', { name: '기부자 검색' }));
    fireEvent.click(await screen.findByRole('button', { name: '선택' }));
    const issue = await screen.findByRole('button', { name: '영수증 발급번호 생성' });
    expect(issue).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText('실제 기부자의 신원·이름·주소와 발급 대상 금액을 확인했습니다.'),
    );
    expect(issue).toBeEnabled();
    fireEvent.click(issue);
    await waitFor(() =>
      expect(f.mock.calls.some(([u, i]) => u.endsWith('/receipts') && i?.body)).toBe(true),
    );
    const sent = JSON.parse(
      String(f.mock.calls.find(([u, i]) => u.endsWith('/receipts') && i?.body)![1]!.body),
    );
    expect(sent.offeringIds).toEqual(['offering']);
    expect(sent.identityConfirmed).toBe(true);
  });
  it('keeps the print identifier out of every network request and clears the input immediately', async () => {
    const f = mock(),
      write = vi.fn(),
      close = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      opener: null,
      location: { pathname: '/receipt-print.html' },
      document: { readyState: 'complete', open: vi.fn(), write, close: vi.fn() },
      close,
    } as unknown as Window);
    render(<ReceiptPanel base="/churches/test/finance" can={() => true} />);
    fireEvent.click(await screen.findByRole('button', { name: '영수증 보기' }));
    const input = await screen.findByLabelText('실제 기부자의 주민등록번호');
    fireEvent.change(input, { target: { value: '900101-1000000' } });
    fireEvent.click(screen.getByLabelText('위 기부자 본인의 식별번호임을 확인했습니다.'));
    fireEvent.click(screen.getByRole('button', { name: '인쇄·PDF 저장 창 열기' }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(input).toHaveValue('');
    expect(JSON.stringify(f.mock.calls)).not.toContain('900101');
    expect(write.mock.calls[0]![0]).toContain('900101-1000000');
    expect(close).not.toHaveBeenCalled();
  });
  it('escapes printed content, paginates full receipts and refuses cancelled documents and invalid identity dates', () => {
    expect(validPrintIdentity('900230-1000000')).toBe(false);
    expect(validPrintIdentity('900101-0000000')).toBe(false);
    expect(validPrintIdentity('900101-1000000')).toBe(true);
    const items = Array.from({ length: 25 }, (_, i) => ({
      ...doc.items[0]!,
      offeringId: String(i),
    }));
    const html = receiptHtml(
      { ...doc, donorName: '<img src=x onerror=alert(1)>', items, totalAmount: 375000 },
      '9001011000000',
    );
    expect(html.match(/class="sheet"/g)).toHaveLength(3);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('375,000');
    expect(() =>
      receiptHtml({ ...doc, cancellation: { reason: '취소', createdAt: '' } }, '9001011000000'),
    ).toThrow();
  });
});
