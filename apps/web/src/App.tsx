import type { HealthResponse } from '@church/contracts';
import { useEffect, useState } from 'react';

type ConnectionState = 'checking' | 'connected' | 'unavailable';

const modules = [
  {
    name: '교적 Core',
    description: '교인, 가족, 조직, 직분과 모든 변화 이력을 관리합니다.',
    phase: 'Phase 1',
  },
  {
    name: '출석·목양',
    description: '예배 출석, 새가족 정착 과정과 심방 업무를 연결합니다.',
    phase: 'Phase 2',
  },
  {
    name: '헌금·회계',
    description: '헌금 접수부터 복식부기 원장과 감사 가능한 정정까지 다룹니다.',
    phase: 'Phase 3–4',
  },
] as const;

export function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi(): Promise<void> {
      try {
        const response = await fetch('/api/v1/health/liveness', {
          signal: controller.signal,
        });

        if (!response.ok) {
          setConnection('unavailable');
          return;
        }

        const health = (await response.json()) as HealthResponse;
        setConnection(health.status === 'ok' ? 'connected' : 'unavailable');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setConnection('unavailable');
      }
    }

    void checkApi();
    return () => controller.abort();
  }, []);

  const connectionLabel = {
    checking: 'API 연결 확인 중',
    connected: 'API 연결 정상',
    unavailable: 'API 연결 필요',
  }[connection];

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">CHURCH OPERATIONS PLATFORM</div>
        <h1>
          교적과 재정을
          <br />
          신뢰할 수 있는 하나의 흐름으로
        </h1>
        <p className="hero-copy">
          교인의 변화 이력부터 조직, 출석, 목양, 헌금과 회계까지 단계적으로 연결합니다.
        </p>
        <div className={`connection connection--${connection}`} role="status">
          <span aria-hidden="true" />
          {connectionLabel}
        </div>
      </section>

      <section className="module-grid" aria-label="개발 단계">
        {modules.map((module) => (
          <article className="module-card" key={module.name}>
            <div className="module-phase">{module.phase}</div>
            <h2>{module.name}</h2>
            <p>{module.description}</p>
          </article>
        ))}
      </section>

      <footer>
        <span>Phase 0 기반 구축</span>
        <span>개인정보 최소 수집 · 역할 기반 권한 · 감사 가능한 이력</span>
      </footer>
    </main>
  );
}
