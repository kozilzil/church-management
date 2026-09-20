import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { BudgetApprovalList } from './BudgetApprovalList';
import { BudgetControlSettings } from './BudgetControlSettings';
const item = {
  id: 'change',
  year: 2020,
  accountId: 'account',
  fundId: 'fund',
  baseVersion: 1,
  amount: '2000',
  reason: '합성 증액',
  requestedBy: 'writer',
  requester: '합성 작성자',
  createdAt: '2020-01-01T00:00:00Z',
  decision: null,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => ({
    ok: (void _url, void _options, true),
    json: async () => ({ items: [item], nextCursor: null }),
  }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function list(userId: string, permissions: string[], onApplied = async () => {}) {
  return (
    <BudgetApprovalList
      base="/churches/test/finance"
      year={2020}
      fundId={null}
      permissions={permissions}
      userId={userId}
      refresh={0}
      onApplied={onApplied}
      onBusy={() => {}}
      names={() => '교육비 · 일반'}
    />
  );
}
describe('Budget approval and control UI', () => {
  it('offers cancellation but never self approval even when the writer has both permissions', async () => {
    setup();
    render(list('writer', ['budget.write', 'budget.approve']));
    await screen.findByRole('button', { name: '요청 취소' });
    expect(screen.queryByRole('button', { name: '예산 승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '예산 반려' })).not.toBeInTheDocument();
  });
  it('shows independent approvers both decisions and submits the selected action with a reason', async () => {
    const fetcher = setup(),
      applied = vi.fn(async () => {});
    render(list('approver', ['budget.approve'], applied));
    fireEvent.click(await screen.findByRole('button', { name: '예산 반려' }));
    expect(screen.getByText('현재 승인된 예산액은 유지됩니다.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('처리 사유'), { target: { value: '합성 반려 의견' } });
    fireEvent.click(screen.getByRole('button', { name: '처리 확정' }));
    await screen.findByText('예산 요청을 처리했습니다.');
    const hit = fetcher.mock.calls.find(([u]) => u.endsWith('/decision'))!;
    expect(JSON.parse(String(hit[1]?.body))).toEqual({
      decision: 'REJECTED',
      reason: '합성 반려 의견',
    });
    expect(applied).toHaveBeenCalledOnce();
  });
  it('does not offer mutation to readers and cannot retry a decision after success followed by refresh failure', async () => {
    setup();
    const view = render(list('reader', []));
    await screen.findByText('합성 증액');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.rerender(
      list('approver', ['budget.approve'], async () => {
        throw new Error('조회 실패');
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '예산 승인' }));
    fireEvent.change(screen.getByLabelText('처리 사유'), { target: { value: '합성 승인' } });
    fireEvent.click(screen.getByRole('button', { name: '처리 확정' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('처리는 완료되었습니다');
    expect(screen.queryByRole('button', { name: '처리 확정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '예산 승인' })).not.toBeInTheDocument();
  });
  it('saves policy with the displayed optimistic version and explains legacy migration requirements', async () => {
    const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.body
          ? { mode: 'BLOCK', version: 3, legacyPending: 0 }
          : { mode: 'WARN', version: 2, legacyPending: 1 },
    }));
    vi.stubGlobal('fetch', fetcher);
    render(<BudgetControlSettings base="/churches/test/finance" />);
    await screen.findByText(/기존 건을 지급 완료/);
    fireEvent.change(screen.getByLabelText('예산 초과 처리'), { target: { value: 'BLOCK' } });
    fireEvent.change(screen.getByLabelText('설정 변경 사유'), { target: { value: '합성 전환' } });
    fireEvent.click(screen.getByRole('button', { name: '예산 통제 저장' }));
    await screen.findByText('예산 통제 설정을 저장했습니다.');
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({
      mode: 'BLOCK',
      version: 2,
      reason: '합성 전환',
    });
    await waitFor(() => expect(screen.getByLabelText('설정 변경 사유')).toHaveValue(''));
  });
});
