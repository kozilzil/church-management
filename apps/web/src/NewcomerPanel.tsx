import { useState, useEffect } from 'react';
import { api } from './api';
import { OperationForm } from './OperationForm';
import { choices } from './operation-utils';
type Stage = { id: string; name: string; sortOrder: number; terminal: boolean; active: boolean };
type Journey = {
  id: string;
  memberId: string;
  name: string;
  stageId: string;
  stage: string;
  assigneeId: string;
  assignee: string;
  dueOn: string | null;
  completedAt: string | null;
  version: number;
};
type Page<T> = { items: T[]; nextCursor: string | null };
export function NewcomerPanel({
  root,
  canWrite,
  canConfigure,
}: {
  root: string;
  canWrite: boolean;
  canConfigure: boolean;
}) {
  const [stages, setStages] = useState<Stage[]>([]),
    [stageNext, setStageNext] = useState<string | null>(null),
    [editStage, setEditStage] = useState<Stage | null>(null),
    [rows, setRows] = useState<Journey[]>([]),
    [next, setNext] = useState<string | null>(null),
    [state, setState] = useState('open'),
    [selected, setSelected] = useState<Journey | null>(null),
    [people, setPeople] = useState<{ id: string; name: string }[]>([]),
    [staff, setStaff] = useState<{ id: string; name: string }[]>([]),
    [q, setQ] = useState(''),
    [message, setMessage] = useState(''),
    [history, setHistory] = useState<
      {
        id: string;
        fromStage: string | null;
        toStage: string;
        version: number;
        createdAt: string;
      }[]
    >([]),
    [hNext, setHNext] = useState<string | null>(null);
  const base = root + '/operations';
  async function run(fn: () => Promise<void>) {
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function load(cursor = '') {
    const p = await api<Page<Journey>>(
      `${base}/newcomers?state=${state}&limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setRows((r) => (cursor ? [...r, ...p.items] : p.items));
    setNext(p.nextCursor);
  }
  async function loadStages(cursor = '') {
    const p = await api<Page<Stage>>(
      `${base}/newcomer-stages?limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setStages((r) => (cursor ? [...r, ...p.items] : p.items));
    setStageNext(p.nextCursor);
  }
  async function loadHistory(id: string, cursor = '') {
    const p = await api<Page<(typeof history)[number]>>(
      `${base}/newcomers/${id}/history?limit=100${cursor ? '&cursor=' + cursor : ''}`,
    );
    setHistory((r) => (cursor ? [...r, ...p.items] : p.items));
    setHNext(p.nextCursor);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Page<Stage>>(`${base}/newcomer-stages?limit=100`),
      api<{ items: typeof staff }>(`${base}/assignees`),
    ])
      .then(([s, u]) => {
        if (active) {
          setStages(s.items);
          setStageNext(s.nextCursor);
          setStaff(u.items);
        }
      })
      .catch((e) => {
        if (active) setMessage(String(e));
      });
    return () => {
      active = false;
    };
  }, [base]);
  useEffect(() => {
    let active = true;
    api<Page<Journey>>(`${base}/newcomers?state=${state}&limit=100`)
      .then((p) => {
        if (active) {
          setRows(p.items);
          setNext(p.nextCursor);
          setSelected(null);
          setHistory([]);
        }
      })
      .catch((e) => {
        if (active) setMessage(String(e));
      });
    return () => {
      active = false;
    };
  }, [base, state]);
  const fields = [
    {
      name: 'stageId',
      label: '정착 단계',
      options: choices(stages.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder)),
      ...(selected ? { value: selected.stageId } : {}),
    },
    {
      name: 'assigneeId',
      label: '담당자',
      options: choices(staff),
      ...(selected ? { value: selected.assigneeId } : {}),
    },
    {
      name: 'dueOn',
      label: '다음 조치 예정일',
      type: 'date',
      optional: true,
      ...(selected?.dueOn ? { value: selected.dueOn } : {}),
    },
  ];
  return (
    <section className="panel">
      <h2>새가족 정착 관리</h2>
      <p>
        단계를 바꾸어도 교적 상태는 자동 변경되지 않습니다. 완료 단계에서 열린 단계로 이동하면 정착
        업무를 재개합니다.
      </p>
      <label>
        목록 조건
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
            <th>교인</th>
            <th>단계</th>
            <th>담당자</th>
            <th>예정일</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.stage}</td>
              <td>{r.assignee}</td>
              <td>{r.dueOn}</td>
              <td>
                <button
                  onClick={() => {
                    setSelected(r);
                    void run(() => loadHistory(r.id));
                  }}
                >
                  상세·이력
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {next && <button onClick={() => void run(() => load(next))}>더 보기</button>}
      {selected && (
        <>
          <h3>{selected.name}</h3>
          {canWrite && (
            <OperationForm
              key={`${selected.id}-${selected.version}`}
              title="단계·담당자·일정 변경"
              fields={fields}
              submit={async (d) => {
                await api(
                  `${base}/newcomers/${selected.id}`,
                  { ...d, dueOn: d.dueOn || null, version: selected.version },
                  'PATCH',
                );
                await load();
                setSelected(null);
              }}
            />
          )}
          {history.map((h) => (
            <p key={h.id}>
              {h.version}차: {h.fromStage ?? '시작'} → {h.toStage} ·{' '}
              {new Date(h.createdAt).toLocaleString('ko-KR')}
            </p>
          ))}
          {hNext && (
            <button onClick={() => void run(() => loadHistory(selected.id, hNext))}>
              이력 더 보기
            </button>
          )}
        </>
      )}
      {canWrite && (
        <>
          <h3>새 정착 과정 등록</h3>
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
                      `${root}/members?q=${encodeURIComponent(q)}&limit=100`,
                    )
                  ).items,
                ),
              )
            }
          >
            검색
          </button>
          <OperationForm
            title="정착 과정 시작"
            fields={[
              { name: 'memberId', label: '교인', options: choices(people) },
              ...fields.map((f) => ({ ...f, value: '' })),
            ]}
            submit={async (d) => {
              await api(`${base}/newcomers`, { ...d, dueOn: d.dueOn || null });
              await load();
            }}
          />
        </>
      )}
      {stageNext && (
        <button onClick={() => void run(() => loadStages(stageNext))}>단계 더 보기</button>
      )}
      {canConfigure && (
        <>
          <h3>교회별 단계 설정</h3>
          <select
            aria-label="수정할 정착 단계"
            value={editStage?.id ?? ''}
            onChange={(e) => setEditStage(stages.find((s) => s.id === e.target.value) ?? null)}
          >
            <option value="">새 단계</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <OperationForm
            key={editStage?.id ?? 'new-stage'}
            title={editStage ? '단계 수정' : '단계 생성'}
            fields={[
              { name: 'name', label: '단계명', value: editStage?.name ?? '' },
              {
                name: 'sortOrder',
                label: '표시 순서',
                type: 'number',
                value: String(editStage?.sortOrder ?? 0),
              },
              {
                name: 'terminal',
                label: '완료 단계',
                value: String(editStage?.terminal ?? false),
                options: [
                  { value: 'false', label: '진행 중' },
                  { value: 'true', label: '완료' },
                ],
              },
              {
                name: 'active',
                label: '사용 여부',
                value: String(editStage?.active ?? true),
                options: [
                  { value: 'true', label: '사용' },
                  { value: 'false', label: '비활성' },
                ],
              },
            ]}
            submit={async (d) => {
              await api(
                `${base}/newcomer-stages${editStage ? '/' + editStage.id : ''}`,
                {
                  ...d,
                  sortOrder: Number(d.sortOrder),
                  terminal: d.terminal === 'true',
                  active: d.active === 'true',
                },
                editStage ? 'PATCH' : 'POST',
              );
              await loadStages();
              setEditStage(null);
            }}
          />
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
