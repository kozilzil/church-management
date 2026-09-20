import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const reply = (data: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 401,
  json: async () => data,
});
describe('Membership interface', () => {
  it('shows a login form and presents rejected credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          reply(
            { error: { message: '로그인 정보를 확인하세요.', code: 'INVALID_CREDENTIALS' } },
            false,
          ),
        ),
    );
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('교적 관리');
    fireEvent.change(screen.getByLabelText('교회 식별자'), { target: { value: 'church' } });
    fireEvent.change(screen.getByLabelText('사용자명'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인 정보를 확인하세요.');
  });
  it('shows scoped member data and hides write actions for readers', async () => {
    const fetcher = vi.fn(async (url: string) =>
      reply(
        url.endsWith('/auth/me')
          ? {
              churchId: 'church',
              userId: 'user',
              username: 'reader',
              permissions: ['membership.read'],
              csrfToken: 'csrf',
              totpEnabled: false,
              mfaVerified: false,
            }
          : url.includes('/members?')
            ? {
                items: [
                  {
                    id: 'member',
                    memberNumber: '001',
                    name: '가상 교인',
                    registeredOn: '2020-01-01',
                    status: 'ACTIVE',
                    version: 1,
                  },
                ],
                nextCursor: null,
              }
            : url.endsWith('/definitions')
              ? {
                  statuses: [{ code: 'ACTIVE', name: '재적', allowedNext: [] }],
                  organizationTypes: [],
                }
              : { items: [], nextCursor: null },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<App />);
    expect(await screen.findByText('가상 교인')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '교인 등록' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계정·권한' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('이름·교인번호'), { target: { value: '가상' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('q=%EA%B0%80%EC%83%81'),
        expect.anything(),
      ),
    );
  });
});
