import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { TransferPanel } from './TransferPanel';
import { CarePanel } from './CarePanel';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const response = (data: unknown) => ({ ok: true, json: async () => data });
describe('Operational permission and confirmation flows', () => {
  it('requires a valid preview and acknowledgement before importing', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({
          batchId: 'batch',
          rows: [
            {
              row: 2,
              memberNumber: '1',
              name: 'Synthetic',
              status: 'ACTIVE',
              registeredOn: '2020-01-01',
            },
          ],
          errors: [],
          candidates: [{ row: 2, memberIds: ['duplicate'] }],
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(<TransferPanel root="/churches/test" permissions={['membership.import']} />);
    fireEvent.change(screen.getByLabelText('CSV 내용'), {
      target: { value: 'memberNumber,name,registeredOn,status\n1,Synthetic,2020-01-01,ACTIVE' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검증·미리보기' }));
    expect(await screen.findByText('확인 필요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인한 명부 등록' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: '확인한 명부 등록' })).toBeEnabled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not render note controls or fetch notes for metadata-only care readers', async () => {
    const fetcher = vi.fn(async (url: string) =>
      response(
        url.includes('care-policy')
          ? { enabled: true, retentionDays: 30, reference: 'Synthetic policy' }
          : {
              items: [
                {
                  id: 'record',
                  name: 'Synthetic member',
                  assignee: 'staff',
                  assigneeId: 'staff',
                  kind: 'CALL',
                  occurredAt: '2024-01-01T00:00:00Z',
                  followUpOn: null,
                  completedAt: null,
                  version: 1,
                },
              ],
              nextCursor: null,
            },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      <CarePanel
        root="/churches/test"
        userId="user"
        permissions={['care.read']}
        full={false}
        households={[]}
      />,
    );
    expect(await screen.findByText('Synthetic member')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '상세' }));
    expect(screen.queryByRole('button', { name: '권한 있는 메모 조회' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => url.includes('/notes'))).toBe(false);
    expect(screen.queryByText('교회 메모 보존·파기 정책 설정')).not.toBeInTheDocument();
  });
});
