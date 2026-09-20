import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the project phases and a healthy API connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'ok',
          service: 'church-management-api',
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('교적과 재정을');
    expect(screen.getByText('교적 Core')).toBeInTheDocument();
    expect(await screen.findByText('API 연결 정상')).toBeInTheDocument();
  });
});
