import { useEffect, useState } from 'react';
import { api } from './api';
import { OperationForm } from './OperationForm';
import { choices } from './operation-utils';
type Page<T> = { items: T[]; nextCursor: string | null };
type Gathering = { id: string; name: string; schedule: string };
type Session = { id: string; startsAt: string };
type RecordRow = {
  id: string;
  memberId: string;
  name: string;
  status: string;
  source: string;
  version: number;
};
const statuses = [
  ['PRESENT', '출석'],
  ['ABSENT', '결석'],
  ['LATE', '지각'],
  ['EXCUSED', '사유 있음'],
  ['UNKNOWN', '미확인'],
];
export function AttendancePanel({
  root,
  canWrite,
  organizations,
}: {
  root: string;
  canWrite: boolean;
  organizations: { id: string; name: string }[];
}) {
  const [gatherings, setGatherings] = useState<Gathering[]>([]),
    [gNext, setGNext] = useState<string | null>(null),
    [selected, setSelected] = useState(''),
    [sessions, setSessions] = useState<Session[]>([]),
    [sNext, setSNext] = useState<string | null>(null),
    [session, setSession] = useState(''),
    [records, setRecords] = useState<RecordRow[]>([]),
    [rNext, setRNext] = useState<string | null>(null),
    [members, setMembers] = useState<{ id: string; name: string }[]>([]),
    [q, setQ] = useState(''),
    [selection, setSelection] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(''),
    [history, setHistory] = useState<
      {
        id: string;
        fromStatus: string | null;
        toStatus: string;
        version: number;
        createdAt: string;
      }[]
    >([]),
    [summary, setSummary] = useState<Record<string, number>>({});
  const base = root + '/operations';
  async function run(fn: () => Promise<void>) {
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function loadGatherings(cursor = '') {
    const p = await api<Page<Gathering>>(
      `${base}/gatherings?limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setGatherings((x) => (cursor ? [...x, ...p.items] : p.items));
    setGNext(p.nextCursor);
  }
  async function loadSessions(id: string, cursor = '') {
    const p = await api<Page<Session>>(
      `${base}/gatherings/${id}/sessions?limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setSessions((x) => (cursor ? [...x, ...p.items] : p.items));
    setSNext(p.nextCursor);
  }
  async function loadRecords(id: string, cursor = '') {
    const p = await api<Page<RecordRow>>(
      `${base}/sessions/${id}/attendance?limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setRecords((x) => (cursor ? [...x, ...p.items] : p.items));
    setRNext(p.nextCursor);
  }
  useEffect(() => {
    let active = true;
    api<Page<Gathering>>(`${base}/gatherings?limit=100`)
      .then((p) => {
        if (active) {
          setGatherings(p.items);
          setGNext(p.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setMessage(String(e));
      });
    return () => {
      active = false;
    };
  }, [base]);
  return (
    <section className="panel">
      <h2>모임·출석</h2>
      <label>
        모임
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setSession('');
            setRecords([]);
            setSelection({});
            if (e.target.value) void run(() => loadSessions(e.target.value));
          }}
        >
          <option value="">선택하세요</option>
          {gatherings.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {g.schedule}
            </option>
          ))}
        </select>
      </label>
      {gNext && <button onClick={() => void run(() => loadGatherings(gNext))}>모임 더 보기</button>}
      {canWrite && (
        <OperationForm
          title="모임 정의"
          fields={[
            { name: 'name', label: '모임명' },
            { name: 'schedule', label: '반복 일정 설명 (예: 매주 주일 10:00)' },
            {
              name: 'organizationId',
              label: '대상 조직 (비우면 전체 교회)',
              optional: true,
              options: choices(organizations),
            },
          ]}
          submit={async (d) => {
            await api(`${base}/gatherings`, d);
            await loadGatherings();
          }}
        />
      )}
      {selected && (
        <>
          <label>
            회차
            <select
              value={session}
              onChange={(e) => {
                setSession(e.target.value);
                setSelection({});
                setHistory([]);
                if (e.target.value) void run(() => loadRecords(e.target.value));
              }}
            >
              <option value="">선택하세요</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.startsAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </option>
              ))}
            </select>
          </label>
          {sNext && (
            <button onClick={() => void run(() => loadSessions(selected, sNext))}>
              회차 더 보기
            </button>
          )}
          {canWrite && (
            <OperationForm
              key={selected}
              title="실제 회차 만들기"
              fields={[
                {
                  name: 'startsAt',
                  label: '회차 일시 (이 컴퓨터의 시간대)',
                  type: 'datetime-local',
                },
              ]}
              submit={async (d) => {
                await api(`${base}/gatherings/${selected}/sessions`, {
                  startsAt: new Date(d.startsAt!).toISOString(),
                });
                await loadSessions(selected);
              }}
            />
          )}
        </>
      )}
      {session && (
        <>
          <h3>출석 기록</h3>
          <table>
            <thead>
              <tr>
                <th>교인</th>
                <th>상태</th>
                <th>입력</th>
                <th>이력</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{statuses.find((s) => s[0] === r.status)?.[1]}</td>
                  <td>{r.source}</td>
                  <td>
                    <button
                      onClick={() =>
                        void run(async () =>
                          setHistory(
                            (
                              await api<{ items: typeof history }>(
                                `${base}/attendance/${r.id}/history?limit=100`,
                              )
                            ).items,
                          ),
                        )
                      }
                    >
                      이력 조회
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rNext && (
            <button onClick={() => void run(() => loadRecords(session, rNext))}>
              기록 더 보기
            </button>
          )}
          {history.map((h) => (
            <p key={h.id}>
              {h.version}차: {h.fromStatus ?? '최초'} → {h.toStatus} ·{' '}
              {new Date(h.createdAt).toLocaleString('ko-KR')}
            </p>
          ))}
          {canWrite && (
            <>
              <label>
                교인 이름 검색
                <input value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <button
                onClick={() =>
                  void run(async () =>
                    setMembers(
                      (
                        await api<Page<{ id: string; name: string }>>(
                          `${root}/members?limit=100&q=${encodeURIComponent(q)}`,
                        )
                      ).items,
                    ),
                  )
                }
              >
                교인 검색 (최대 100명)
              </button>
              {members.map((m) => (
                <label key={m.id}>
                  {m.name}
                  <select
                    value={selection[m.id] ?? ''}
                    onChange={(e) => setSelection({ ...selection, [m.id]: e.target.value })}
                  >
                    <option value="">변경 안 함</option>
                    {statuses.map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                disabled={!Object.values(selection).some(Boolean)}
                onClick={() =>
                  void run(async () => {
                    const entries = Object.entries(selection)
                      .filter(([, v]) => v)
                      .map(([memberId, status]) => ({
                        memberId,
                        status,
                        version: records.find((r) => r.memberId === memberId)?.version ?? 0,
                      }));
                    await api(`${base}/sessions/${session}/attendance`, {
                      source: entries.length === 1 ? 'MANUAL' : 'BULK',
                      records: entries,
                    });
                    setSelection({});
                    await loadRecords(session);
                    setMessage('출석을 저장했습니다.');
                  })
                }
              >
                선택 출석 저장
              </button>
            </>
          )}
        </>
      )}
      <OperationForm
        title="기간 집계 (최대 1년)"
        fields={[
          { name: 'from', label: '시작일', type: 'date' },
          { name: 'to', label: '종료일', type: 'date' },
        ]}
        submit={async (d) => {
          const result = await api<{ counts: Record<string, number> }>(
            `${base}/attendance-summary?from=${d.from}&to=${d.to}${selected ? '&gatheringId=' + selected : ''}`,
          );
          setSummary(result.counts);
        }}
      />
      <p>{statuses.map(([v, n]) => `${n} ${summary[v!] ?? 0}`).join(' · ')}</p>
      <p role="status">{message}</p>
    </section>
  );
}
