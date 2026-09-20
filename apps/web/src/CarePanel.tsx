import { useEffect, useState } from 'react';
import { api } from './api';
import { OperationForm } from './OperationForm';
import { choices } from './operation-utils';
type Care = {
  id: string;
  memberId: string | null;
  householdId: string | null;
  name: string;
  assigneeId: string;
  assignee: string;
  kind: string;
  occurredAt: string;
  followUpOn: string | null;
  completedAt: string | null;
  version: number;
};
type Note = { id: string; text: string; visibility: string; createdAt: string; expiresAt: string };
type Policy = { enabled: boolean; retentionDays: number | null; reference: string | null };
type Page<T> = { items: T[]; nextCursor: string | null };
export function CarePanel({
  root,
  userId,
  permissions,
  full,
  households,
}: {
  root: string;
  userId: string;
  permissions: string[];
  full: boolean;
  households: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<Care[]>([]),
    [next, setNext] = useState<string | null>(null),
    [state, setState] = useState('open'),
    [selected, setSelected] = useState<Care | null>(null),
    [staff, setStaff] = useState<{ id: string; name: string }[]>([]),
    [people, setPeople] = useState<{ id: string; name: string }[]>([]),
    [q, setQ] = useState(''),
    [message, setMessage] = useState(''),
    [notes, setNotes] = useState<Note[]>([]),
    [noteNext, setNoteNext] = useState<string | null>(null),
    [text, setText] = useState(''),
    [visibility, setVisibility] = useState('ASSIGNEE'),
    [roleId, setRoleId] = useState(''),
    [roles, setRoles] = useState<{ id: string; name: string }[]>([]),
    [policy, setPolicy] = useState<Policy>({
      enabled: false,
      retentionDays: null,
      reference: null,
    }),
    [history, setHistory] = useState<
      {
        id: string;
        version: number;
        followUpOn: string | null;
        completedAt: string | null;
        createdAt: string;
      }[]
    >([]),
    [historyNext, setHistoryNext] = useState<string | null>(null);
  const base = root + '/operations',
    write = permissions.includes('care.write'),
    sensitive = permissions.includes('care.notes');
  async function run(fn: () => Promise<void>) {
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function load(cursor = '') {
    const p = await api<Page<Care>>(
      `${base}/care?state=${state}&limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setRows((r) => (cursor ? [...r, ...p.items] : p.items));
    setNext(p.nextCursor);
  }
  async function loadNotes(id: string, cursor = '') {
    const p = await api<Page<Note>>(
      `${base}/care/${id}/notes?limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setNotes((r) => (cursor ? [...r, ...p.items] : p.items));
    setNoteNext(p.nextCursor);
  }
  async function loadHistory(id: string, cursor = '') {
    const p = await api<Page<(typeof history)[number]>>(
      `${base}/care/${id}/history?limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setHistory((r) => (cursor ? [...r, ...p.items] : p.items));
    setHistoryNext(p.nextCursor);
  }
  useEffect(() => {
    let active = true;
    api<Policy>(`${base}/care-policy`)
      .then((p) => {
        if (active) setPolicy(p);
      })
      .catch((e) => {
        if (active) setMessage(String(e));
      });
    if (write)
      api<{ items: typeof staff }>(`${base}/assignees`)
        .then((p) => {
          if (active) setStaff(p.items);
        })
        .catch((e) => {
          if (active) setMessage(String(e));
        });
    if (sensitive)
      api<{ items: typeof roles }>(`${base}/care-roles`)
        .then((p) => {
          if (active) setRoles(p.items);
        })
        .catch((e) => {
          if (active) setMessage(String(e));
        });
    return () => {
      active = false;
    };
  }, [base, write, sensitive]);
  useEffect(() => {
    let active = true;
    api<Page<Care>>(`${base}/care?state=${state}&limit=100`)
      .then((p) => {
        if (active) {
          setRows(p.items);
          setNext(p.nextCursor);
          setSelected(null);
          setNotes([]);
        }
      })
      .catch((e) => {
        if (active) setMessage(String(e));
      });
    return () => {
      active = false;
    };
  }, [base, state]);
  return (
    <section className="panel">
      <h2>심방·목양 후속 조치</h2>
      <label>
        업무 상태
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {[
            ['open', '미완료'],
            ['overdue', '예정일 경과'],
            ['completed', '완료'],
            ['all', '전체'],
          ].map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <table>
        <thead>
          <tr>
            <th>대상</th>
            <th>유형·일시</th>
            <th>담당자</th>
            <th>후속 예정</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                {{ VISIT: '방문', CALL: '전화', MESSAGE: '연락', MEETING: '면담' }[r.kind]} ·{' '}
                {new Date(r.occurredAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              </td>
              <td>{r.assignee}</td>
              <td>{r.followUpOn}</td>
              <td>
                <button
                  onClick={() => {
                    setSelected(r);
                    setNotes([]);
                    setText('');
                    void run(() => loadHistory(r.id));
                  }}
                >
                  상세
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {next && <button onClick={() => void run(() => load(next))}>더 보기</button>}
      {write && (
        <>
          <label>
            교인 이름 검색
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button
            onClick={() =>
              void run(async () =>
                setPeople(
                  (
                    await api<Page<(typeof people)[number]>>(
                      `${root}/members?limit=100&q=${encodeURIComponent(q)}`,
                    )
                  ).items,
                ),
              )
            }
          >
            검색
          </button>
          <OperationForm
            title="방문·연락 기록 (교인 또는 가족 중 하나 선택)"
            fields={[
              { name: 'memberId', label: '교인', optional: true, options: choices(people) },
              { name: 'householdId', label: '가족', optional: true, options: choices(households) },
              { name: 'assigneeId', label: '담당자', options: choices(staff) },
              {
                name: 'kind',
                label: '유형',
                options: [
                  { value: 'VISIT', label: '방문' },
                  { value: 'CALL', label: '전화' },
                  { value: 'MESSAGE', label: '연락' },
                  { value: 'MEETING', label: '면담' },
                ],
              },
              {
                name: 'occurredAt',
                label: '실제 일시 (이 컴퓨터의 시간대)',
                type: 'datetime-local',
              },
              { name: 'followUpOn', label: '후속 예정일', type: 'date', optional: true },
            ]}
            submit={async (d) => {
              await api(`${base}/care`, {
                ...d,
                occurredAt: new Date(d.occurredAt!).toISOString(),
                followUpOn: d.followUpOn || null,
              });
              await load();
            }}
          />
        </>
      )}
      {selected && (
        <>
          <h3>{selected.name}</h3>
          {write && (
            <OperationForm
              key={`${selected.id}-${selected.version}`}
              title="후속 조치 변경"
              fields={[
                {
                  name: 'assigneeId',
                  label: '담당자',
                  value: selected.assigneeId,
                  options: choices(staff),
                },
                {
                  name: 'followUpOn',
                  label: '후속 예정일',
                  value: selected.followUpOn ?? '',
                  type: 'date',
                  optional: true,
                },
                {
                  name: 'completed',
                  label: '완료 여부',
                  value: String(!!selected.completedAt),
                  options: [
                    { value: 'false', label: '미완료' },
                    { value: 'true', label: '완료' },
                  ],
                },
              ]}
              submit={async (d) => {
                await api(
                  `${base}/care/${selected.id}`,
                  {
                    ...d,
                    followUpOn: d.followUpOn || null,
                    completed: d.completed === 'true',
                    version: selected.version,
                  },
                  'PATCH',
                );
                await load();
                setSelected(null);
                setNotes([]);
              }}
            />
          )}
          <h4>후속 변경 이력</h4>
          {history.map((h) => (
            <p key={h.id}>
              {h.version}차 · 예정 {h.followUpOn?.slice(0, 10) ?? '없음'} ·{' '}
              {h.completedAt ? '완료' : '미완료'} · {new Date(h.createdAt).toLocaleString('ko-KR')}
            </p>
          ))}
          {historyNext && (
            <button onClick={() => void run(() => loadHistory(selected.id, historyNext))}>
              이력 더 보기
            </button>
          )}
          {sensitive && policy.enabled && (
            <>
              <h4>제한 메모</h4>
              <button onClick={() => void run(() => loadNotes(selected.id))}>
                권한 있는 메모 조회
              </button>
              {notes.map((n) => (
                <article key={n.id}>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{n.text}</p>
                  <small>만료: {new Date(n.expiresAt).toLocaleString('ko-KR')}</small>
                </article>
              ))}
              {noteNext && (
                <button onClick={() => void run(() => loadNotes(selected.id, noteNext))}>
                  메모 더 보기
                </button>
              )}
              {write && selected.assigneeId === userId && (
                <>
                  <label>
                    메모 (정정은 새 메모로 추가)
                    <textarea
                      maxLength={5000}
                      rows={5}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                  <label>
                    공개 범위
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                      <option value="ASSIGNEE">작성자·현재 담당자</option>
                      <option value="ROLE">작성자·지정 역할</option>
                    </select>
                  </label>
                  {visibility === 'ROLE' && (
                    <label>
                      지정 역할
                      <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                        <option value="">선택하세요</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    disabled={!text.trim() || (visibility === 'ROLE' && !roleId)}
                    onClick={() =>
                      void run(async () => {
                        await api(`${base}/care/${selected.id}/notes`, {
                          text,
                          visibility,
                          ...(visibility === 'ROLE' ? { roleId } : {}),
                        });
                        setText('');
                        await loadNotes(selected.id);
                      })
                    }
                  >
                    제한 메모 추가
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
      {!policy.enabled && (
        <p>
          민감 메모는 비활성 상태입니다. 교회의 보존·파기 정책과 서버 암호화 키를 설정한 뒤 사용할
          수 있습니다.
        </p>
      )}
      {full && permissions.includes('care.policy') && permissions.includes('identity.manage') && (
        <OperationForm
          key={String(policy.retentionDays) + policy.reference}
          title="교회 메모 보존·파기 정책 설정"
          fields={[
            {
              name: 'reference',
              label: '확정한 보존·파기 정책명 또는 문서 위치',
              value: policy.reference ?? '',
            },
            {
              name: 'retentionDays',
              label: '보존 일수 (1–3650)',
              type: 'number',
              value: policy.retentionDays === null ? '' : String(policy.retentionDays),
            },
            {
              name: 'enabled',
              label: '정책 확인 후 메모 사용',
              value: String(policy.enabled),
              options: [
                { value: 'false', label: '비활성' },
                { value: 'true', label: '정책을 확인했고 활성화' },
              ],
            },
          ]}
          submit={async (d) => {
            await api(
              `${base}/care-policy`,
              { ...d, retentionDays: Number(d.retentionDays), enabled: d.enabled === 'true' },
              'PUT',
            );
            setPolicy(await api<Policy>(`${base}/care-policy`));
            setNotes([]);
          }}
        />
      )}
      <p role="status">{message}</p>
    </section>
  );
}
