import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { FinancePanel } from './FinancePanel';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const catalog = {
  accounts: [{ id: 'cost', code: 'E1', name: '가상 비용', kind: 'EXPENSE' }],
  funds: [{ id: 'fund', name: '일반' }],
  periods: [],
};
const detail = {
  id: 'request',
  title: '교육 물품',
  purpose: '가상 목적',
  payee: '가상 상점',
  amount: 10000,
  accountId: 'cost',
  fundId: 'fund',
  evidenceReference: '문서-1',
  approverIds: ['first', 'second'],
  state: 'DRAFT',
  round: 0,
  version: 1,
  requesterId: 'requester',
  currentApproverId: null,
  attachments: [],
  submissions: [],
  olderSubmissionCount: 0,
  events: { items: [], nextCursor: null },
  payment: null,
};
function setup() {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => (
      void init,
      url.includes('/definitions') || url.includes('/settings')
        ? catalog
        : url.includes('/approvers')
          ? {
              items: [
                { id: 'first', username: '첫 결재자' },
                { id: 'second', username: '다음 결재자' },
              ],
              nextCursor: null,
            }
          : url.endsWith('/expenses/request')
            ? detail
            : { items: [detail], nextCursor: null }
    ),
  }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('Requester-defined expense flow', () => {
  it('saves the requested approver order and requires acknowledgement before submission', async () => {
    const fetcher = setup();
    render(
      <FinancePanel
        root="/churches/test"
        permissions={['expense.read', 'expense.write']}
        userId="requester"
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '요청서 보기' }));
    const submit = await screen.findByRole('button', { name: '상신' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '2번째 결재자 위로' }));
    expect(screen.getByRole('button', { name: '상신' })).toBeDisabled();
    expect(screen.getByText('수정한 내용과 결재선을 먼저 초안 저장하세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => {
      const hit = fetcher.mock.calls.find(
        ([, opts]) => (opts as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(hit).toBeDefined();
      expect(JSON.parse(String((hit![1] as RequestInit).body)).approverIds).toEqual([
        'second',
        'first',
      ]);
    });
    expect(screen.getByLabelText('사진·영수증·PDF 첨부 (10 MiB 이하)')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '상신' })).toBeDisabled());
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: '상신' })).toBeEnabled();
  });
  it('does not show expense records to a settings-only administrator', async () => {
    const fetcher = setup();
    render(<FinancePanel root="/churches/test" permissions={['finance.manage']} userId="admin" />);
    expect(await screen.findByRole('heading', { name: '계정과목 추가' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '지출 요청·결재' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => url.includes('/expenses'))).toBe(false);
  });
});
