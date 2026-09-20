import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { FinancePanel } from './FinancePanel';
import { FinanceReportPanel } from './FinanceReportPanel';
import type { FinancialReport } from '@church/contracts';
const totals = {
  income: '9999999999999991',
  expense: '120',
  net: '9999999999999871',
  openingAssets: '1000',
  assetMovement: '9999999999999871',
  closingAssets: '10000000000000871',
};
const report: FinancialReport = {
  selection: { from: '2020-02-01', to: '2020-03-31', ledgerVersion: '123' },
  generatedAt: '2020-04-01T00:00:00Z',
  fundName: '전체 기금',
  totals,
  months: [{ month: '2020-02', ...totals }],
  funds: [{ id: 'f', name: '일반', ...totals }],
  accounts: [
    {
      accountId: 'a',
      code: 'A1',
      name: '통장',
      kind: 'ASSET',
      fundId: 'f',
      fundName: '일반',
      opening: '1000',
      debit: '9999999999999991',
      credit: '120',
      closing: '10000000000000871',
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const createObjectURL = vi.fn(() => 'blob:synthetic'),
    revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const fetcher = vi.fn(async (url: string, opts?: RequestInit) => {
    let value: unknown = {};
    if (url.includes('/reports/definitions'))
      value = { funds: [{ id: 'f', name: '일반' }], timezone: 'Asia/Seoul' };
    else if (url.includes('/reports/export'))
      value = { filename: 'report.csv', csv: '\uFEFFsynthetic' };
    else if (url.includes('/reports/lines'))
      value = {
        items: [
          {
            id: url.includes('cursor=') ? 'line2' : 'line',
            journalId: 'j',
            postedOn: '2020-02-01',
            reversalOf: null,
            debit: '20',
            credit: '0',
            source: { kind: 'expense', id: 'expense' },
          },
        ],
        nextCursor: url.includes('cursor=') ? null : 'line',
      };
    else if (url.includes('/reports?')) value = report;
    else if (url.includes('/attachments/'))
      return { ok: true, blob: async () => new Blob(['synthetic'], { type: 'image/png' }) };
    else if (url.includes('/expenses/expense'))
      value = {
        title: '합성 지출',
        payee: '합성 수령인',
        purpose: '합성 목적',
        amount: 20,
        attachments: [{ id: 'file', filename: 'synthetic.png', mime: 'image/png' }],
        payment: { paidOn: '2020-02-01', reference: 'SYNTHETIC' },
      };
    void opts;
    return { ok: true, json: async () => value };
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, createObjectURL, revokeObjectURL };
}
async function query() {
  await waitFor(() => expect(screen.getByLabelText('시작일')).not.toHaveValue(''));
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2020-02-01' } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2020-03-31' } });
  fireEvent.click(screen.getByRole('button', { name: '보고서 조회' }));
  await screen.findByRole('heading', { name: '2020-02-01 ~ 2020-03-31 · 전체 기금' });
}
describe('Financial reports', () => {
  it('opens reports for report-only users without querying raw ledgers or showing export controls', async () => {
    const { fetcher } = setup();
    render(<FinancePanel root="/churches/test" permissions={['finance.report']} userId="reader" />);
    await query();
    expect(screen.getAllByText('9,999,999,999,999,991원').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /CSV 내보내기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /거래 보기/ })).not.toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([u]) => /\/journals|\/expenses|\/ledger-definitions/.test(u)),
    ).toBe(false);
  });
  it('exports the visible snapshot when form filters have changed', async () => {
    const { fetcher, createObjectURL } = setup();
    render(
      <FinanceReportPanel
        base="/churches/test/finance"
        permissions={['finance.report', 'finance.export']}
      />,
    );
    await query();
    fireEvent.change(screen.getByLabelText('기금'), { target: { value: 'f' } });
    expect(screen.getByText(/조건이 변경되었습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '조회 결과 CSV 내보내기' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const hit = fetcher.mock.calls.find(([u]) => u.endsWith('/reports/export'))!;
    expect(JSON.parse(String(hit[1]?.body))).toEqual(report.selection);
  });
  it('keeps the report watermark during pagination and opens an authorized source and photo', async () => {
    const { fetcher, revokeObjectURL } = setup();
    render(
      <FinanceReportPanel
        base="/churches/test/finance"
        permissions={['finance.report', 'finance.readall', 'expense.read']}
      />,
    );
    await query();
    fireEvent.click(screen.getByRole('button', { name: '통장 일반 거래 보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '지출·증빙 보기' }));
    expect(await screen.findByText('합성 지출 · 합성 수령인')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '증빙: synthetic.png' }));
    expect(await screen.findByAltText('synthetic.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '증빙 닫기' }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
    fireEvent.click(screen.getByRole('button', { name: '거래 더 보기' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '거래 더 보기' })).not.toBeInTheDocument(),
    );
    const hit = fetcher.mock.calls.find(([u]) => u.includes('cursor=line'))!;
    const q = new URL(hit[0], 'http://localhost').searchParams;
    expect(q.get('ledgerVersion')).toBe('123');
    expect(q.get('fundId')).toBe('f');
    expect(q.get('accountId')).toBe('a');
  });
  it('shows authorization failures and removes stale report data after a failed refresh', async () => {
    const { fetcher } = setup();
    render(<FinanceReportPanel base="/churches/test/finance" permissions={['finance.report']} />);
    await query();
    fetcher.mockImplementationOnce(async () => ({
      ok: false,
      json: async () => ({
        error: { message: '조회 권한이 없습니다.', code: 'PERMISSION_DENIED' },
      }),
    }));
    fireEvent.click(screen.getByRole('button', { name: '보고서 조회' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('조회 권한이 없습니다.');
    expect(screen.queryByText('계정·기금별 원장 대조')).not.toBeInTheDocument();
  });
});
