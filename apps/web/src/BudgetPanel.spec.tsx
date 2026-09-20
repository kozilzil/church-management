import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { AnnualBudget } from '@church/contracts';
import { BudgetPanel } from './BudgetPanel';
import { FinancePanel } from './FinancePanel';
const report: AnnualBudget = {
  year: 2026,
  fundId: null,
  generatedAt: '2026-09-21T00:00:00Z',
  totals: { budget: '1000', actual: '1200', remaining: '-200', executionRate: '120.00' },
  overBudgetCount: 1,
  unbudgetedCount: 0,
  items: [
    {
      accountId: 'account',
      code: 'E1',
      name: '교육비',
      fundId: 'fund',
      fundName: '일반',
      version: 2,
      budget: '1000',
      actual: '1200',
      remaining: '-200',
      executionRate: '120.00',
      status: 'EXCEEDED',
      committed: '0',
      available: '-200',
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const current = structuredClone(report);
  const fetcher = vi.fn(async (url: string, _options?: RequestInit) => {
    void _options;
    let body: unknown = {};
    if (url.includes('/budgets/definitions'))
      body = {
        timezone: 'Asia/Seoul',
        accounts: [{ id: 'account', code: 'E1', name: '교육비' }],
        funds: [{ id: 'fund', name: '일반' }],
      };
    else if (url.includes('/budgets/history'))
      body = {
        items: [
          {
            id: url.includes('beforeVersion=') ? 'h1' : 'h2',
            version: url.includes('beforeVersion=') ? 1 : 2,
            amount: '1000',
            reason: '합성 사유',
            createdAt: '2026-09-21T00:00:00Z',
            createdBy: 'writer',
            createdByName: '가상 편성자',
          },
        ],
        nextBeforeVersion: url.includes('beforeVersion=') ? null : 2,
      };
    else if (url.includes('/budgets/changes')) body = { items: [], nextCursor: null };
    else if (url.includes('/budgets/revisions')) {
      body = { id: 'request', state: 'PENDING' };
    } else if (url.includes('/budgets?')) body = current;
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
async function query() {
  await waitFor(() => expect(screen.getByLabelText('예산 연도')).not.toHaveValue(null));
  fireEvent.change(screen.getByLabelText('예산 연도'), { target: { value: '2026' } });
  fireEvent.click(screen.getByRole('button', { name: '예산 조회' }));
  await screen.findByRole('heading', { name: '2026년 · 전체 기금' });
}
async function edit() {
  fireEvent.click(screen.getByRole('button', { name: '교육비 일반 예산 변경' }));
  fireEvent.change(screen.getByLabelText('연간 예산액 (원)'), {
    target: { value: '999999999999991' },
  });
  fireEvent.change(screen.getByLabelText('편성·변경 사유'), {
    target: { value: '합성 예산 조정' },
  });
}
describe('Annual budget screen', () => {
  it('lets budget-only readers see execution and history without exposing editing or fetching expense records', async () => {
    const fetcher = setup();
    render(<FinancePanel root="/churches/test" permissions={['budget.read']} userId="reader" />);
    await query();
    expect(screen.getByText('예산 초과')).toBeInTheDocument();
    expect(screen.getAllByText('-200원').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '예산 항목 편성' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '교육비 일반 변경 이력' }));
    await screen.findByRole('button', { name: '이력 더 보기' });
    expect(screen.getByText(/변경자 가상 편성자/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이력 더 보기' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '이력 더 보기' })).not.toBeInTheDocument(),
    );
    expect(fetcher.mock.calls.some(([u]) => u.includes('beforeVersion=2'))).toBe(true);
    expect(fetcher.mock.calls.some(([u]) => /\/expenses|\/journals|\/reports/.test(u))).toBe(false);
  });
  it('saves exact string amounts and the displayed year/version even after query filters change', async () => {
    const fetcher = setup();
    render(
      <BudgetPanel base="/churches/test/finance" permissions={['budget.read', 'budget.write']} />,
    );
    await query();
    fireEvent.change(screen.getByLabelText('예산 연도'), { target: { value: '2027' } });
    await edit();
    fireEvent.click(screen.getByRole('button', { name: '예산 승인 요청' }));
    await screen.findByText('예산 승인을 요청했습니다. 현재 편성액은 승인 후 변경됩니다.');
    const hit = fetcher.mock.calls.find(([u]) => u.endsWith('/budgets/revisions'))!;
    expect(JSON.parse(String(hit[1]?.body))).toEqual({
      year: 2026,
      accountId: 'account',
      fundId: 'fund',
      version: 2,
      amount: '999999999999991',
      reason: '합성 예산 조정',
    });
    expect(screen.queryByText('999,999,999,999,991원')).not.toBeInTheDocument();
    expect(screen.getAllByText('1,000원').length).toBeGreaterThan(0);
    expect(screen.queryByRole('form', { name: '예산 편성' })).not.toBeInTheDocument();
  });
  it('uses the existing allocation version when selecting a previously budgeted pair in the new-item form', async () => {
    const fetcher = setup();
    render(
      <BudgetPanel base="/churches/test/finance" permissions={['budget.read', 'budget.write']} />,
    );
    await query();
    fireEvent.click(screen.getByRole('button', { name: '예산 항목 편성' }));
    expect(screen.getByLabelText('연간 예산액 (원)')).toHaveValue('1000');
    fireEvent.change(screen.getByLabelText('연간 예산액 (원)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('편성·변경 사유'), { target: { value: '합성 철회' } });
    fireEvent.click(screen.getByRole('button', { name: '예산 승인 요청' }));
    await screen.findByText('예산 승인을 요청했습니다. 현재 편성액은 승인 후 변경됩니다.');
    const hit = fetcher.mock.calls.find(([u]) => u.endsWith('/budgets/revisions'))!;
    expect(JSON.parse(String(hit[1]?.body))).toMatchObject({ version: 2, amount: '0' });
  });
  it('preserves entered changes on a stale-version conflict', async () => {
    const fetcher = setup();
    render(
      <BudgetPanel base="/churches/test/finance" permissions={['budget.read', 'budget.write']} />,
    );
    await query();
    await edit();
    fetcher.mockImplementationOnce(async () => ({
      ok: false,
      json: async () => ({
        error: {
          message: '다른 작업으로 변경되었습니다. 다시 조회하세요.',
          code: 'VERSION_CONFLICT',
        },
      }),
    }));
    fireEvent.click(screen.getByRole('button', { name: '예산 승인 요청' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('다시 조회하세요');
    expect(screen.getByLabelText('연간 예산액 (원)')).toHaveValue('999999999999991');
  });
  it('prevents a second write when saving succeeded but refreshing the summary failed', async () => {
    const fetcher = setup();
    render(
      <BudgetPanel base="/churches/test/finance" permissions={['budget.read', 'budget.write']} />,
    );
    await query();
    await edit();
    fetcher
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ id: 'revision', version: 3 }),
      }))
      .mockImplementationOnce(async () => ({
        ok: false,
        json: async () => ({ error: { message: '조회 실패', code: 'UNAVAILABLE' } }),
      }));
    fireEvent.click(screen.getByRole('button', { name: '예산 승인 요청' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '승인 요청은 저장되었습니다. 조회를 다시 실행하세요.',
    );
    expect(screen.queryByRole('button', { name: '예산 승인 요청' })).not.toBeInTheDocument();
    expect(screen.queryByText('계정·기금별 예산과 집행')).not.toBeInTheDocument();
  });
});
