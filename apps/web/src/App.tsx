import { CarePanel } from './CarePanel';
import { NewcomerPanel } from './NewcomerPanel';
import { AttendancePanel } from './AttendancePanel';
import { TransferPanel } from './TransferPanel';
import { ScopePanel } from './ScopePanel';
import type {
  SessionResponse as Session,
  MemberResponse as Member,
  MembershipPeriod as Period,
  CursorPage,
} from '@church/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { api, setCsrf } from './api';
import './styles.css';
type Named = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  activeMembers?: number;
  archived?: boolean;
  parentId?: string | null;
  type?: string;
  closedOn?: string | null;
  sortOrder?: number;
  allowConcurrent?: boolean;
  active?: boolean;
};
type Definitions = {
  statuses: { code: string; name: string; allowedNext: string[] }[];
  organizationTypes: { code: string; name: string }[];
};
type Page<T> = CursorPage<T>;
type Choice = { value: string; label: string };
type Field = {
  name: string;
  label: string;
  type?: 'text' | 'password' | 'date' | 'number' | 'checkbox' | 'select';
  optional?: boolean;
  options?: Choice[];
  value?: string | number | boolean;
};
type Payload = Record<string, string | number | boolean | null>;
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const named = (items: Named[]): Choice[] => items.map((x) => ({ value: x.id, label: x.name }));
function Form({
  title,
  fields,
  submit,
  label = '저장',
}: {
  title: string;
  fields: Field[];
  submit: (value: Payload) => Promise<void>;
  label?: string;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Payload = {};
    for (const f of fields) {
      const value = String(data.get(f.name) ?? '');
      if (f.type === 'checkbox') payload[f.name] = data.has(f.name);
      else if (value !== '' || !f.optional || ['phone', 'address'].includes(f.name))
        payload[f.name] = f.type === 'number' ? Number(value) : value;
    }
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await submit(payload);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={send}>
      <h3>{title}</h3>
      <div className="fields">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.type === 'select' ? (
              <select name={f.name} required={!f.optional} defaultValue={String(f.value ?? '')}>
                <option value="">선택하세요</option>
                {f.options?.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type ?? 'text'}
                required={!f.optional && f.type !== 'checkbox'}
                defaultValue={f.type === 'checkbox' ? undefined : String(f.value ?? '')}
                defaultChecked={f.type === 'checkbox' ? Boolean(f.value) : undefined}
                autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                maxLength={f.type === 'password' ? 128 : 300}
              />
            )}
          </label>
        ))}
      </div>
      <button disabled={busy}>{busy ? '처리 중…' : label}</button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && <p role="status">저장했습니다.</p>}
    </form>
  );
}
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('members');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState('');
  const [households, setHouseholds] = useState<Named[]>([]);
  const [masterNext, setMasterNext] = useState<Record<string, string | null>>({});
  const [organizations, setOrganizations] = useState<Named[]>([]);
  const [positions, setPositions] = useState<Named[]>([]);
  const [definitions, setDefinitions] = useState<Definitions>({
    statuses: [],
    organizationTypes: [],
  });
  const [selected, setSelected] = useState<Member | null>(null);
  const [household, setHousehold] = useState<Named | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<Period[]>([]);
  const [at, setAt] = useState('');
  const [audit, setAudit] = useState<
    { id: string; action: string; createdAt: string; outcome: string }[]
  >([]);
  const [auditCursor, setAuditCursor] = useState('');
  const [auditNext, setAuditNext] = useState<string | null>(null);
  const [admin, setAdmin] = useState<{
    users: { id: string; username: string; active: boolean }[];
    roles: { id: string; name: string }[];
    grantablePermissions: string[];
  }>({ users: [], roles: [], grantablePermissions: [] });
  const [mfaSecret, setMfaSecret] = useState('');
  const refresh = () => setRevision((x) => x + 1);
  const can = (p: string) => session?.permissions.includes(p);
  const full = session?.scopeMode === 'ALL';
  const root = session ? `/churches/${session.churchId}` : '';
  async function loadSession() {
    const result = await api<Session>('/auth/me');
    setCsrf(result.csrfToken);
    setSession(result);
    return result;
  }
  useEffect(() => {
    api<Session>('/auth/me')
      .then((result) => {
        setCsrf(result.csrfToken);
        setSession(result);
      })
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    async function load() {
      try {
        if (session!.permissions.includes('membership.read')) {
          const [page, h, o, p, d] = await Promise.all([
            api<Page<Member>>(
              `${root}/members?limit=30&q=${encodeURIComponent(search)}${cursor ? `&cursor=${cursor}` : ''}`,
            ),
            api<Page<Named>>(`${root}/households?limit=100`),
            api<Page<Named>>(`${root}/organizations?limit=100`),
            api<Page<Named>>(`${root}/positions?limit=100`),
            api<Definitions>(`${root}/definitions`),
          ]);
          if (!active) return;
          setMembers(page.items);
          setNext(page.nextCursor);
          setHouseholds(h.items);
          setOrganizations(o.items);
          setPositions(p.items);
          setDefinitions(d);
          setMasterNext({
            households: h.nextCursor,
            organizations: o.nextCursor,
            positions: p.nextCursor,
          });
        }
        if (tab === 'audit' && session!.permissions.includes('audit.read')) {
          const result = await api<
            Page<{ id: string; action: string; createdAt: string; outcome: string }>
          >(`${root}/audit-events?limit=30${auditCursor ? `&cursor=${auditCursor}` : ''}`);
          if (active) {
            setAudit(result.items);
            setAuditNext(result.nextCursor);
          }
        }
        if (tab === 'admin' && session!.permissions.includes('identity.manage')) {
          const a = await api<typeof admin>(`${root}/identity`);
          if (active) setAdmin(a);
        }
      } catch (e) {
        if (active) setMessage(e instanceof Error ? e.message : '조회하지 못했습니다.');
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [session, root, search, cursor, revision, tab, auditCursor]);
  async function openMember(id: string) {
    try {
      setSelected(await api<Member>(`${root}/members/${id}`));
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function mutate(path: string, payload: unknown, method = 'POST') {
    await api(`${root}${path}`, payload, method);
    refresh();
    if (selected) await openMember(selected.id);
  }
  async function loadHousehold(item: Named, date = '') {
    setHousehold(item);
    try {
      const page = await api<{ items: Period[] }>(
        `${root}/households/${item.id}/members${date ? `?at=${date}` : ''}`,
      );
      setHouseholdMembers(page.items);
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function loadMore(kind: 'households' | 'organizations' | 'positions') {
    try {
      const page = await api<Page<Named>>(`${root}/${kind}?limit=100&cursor=${masterNext[kind]}`);
      const setter =
        kind === 'households'
          ? setHouseholds
          : kind === 'organizations'
            ? setOrganizations
            : setPositions;
      setter((items) => [...items, ...page.items]);
      setMasterNext((old) => ({ ...old, [kind]: page.nextCursor }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '조회하지 못했습니다.');
    }
  }
  const statusChoices = definitions.statuses.map((x) => ({ value: x.code, label: x.name }));
  const statusLabel = (code: string) =>
    definitions.statuses.find((x) => x.code === code)?.name ?? code;
  if (checking)
    return (
      <main>
        <p>로그인 상태를 확인합니다…</p>
      </main>
    );
  if (!session)
    return (
      <main className="login">
        <div className="eyebrow">CHURCH MANAGEMENT</div>
        <h1>교적 관리</h1>
        <p>교회 계정으로 로그인하세요.</p>
        <Form
          title="로그인"
          label="로그인"
          fields={[
            { name: 'churchId', label: '교회 식별자' },
            { name: 'username', label: '사용자명' },
            { name: 'password', label: '비밀번호', type: 'password' },
            { name: 'code', label: '인증 앱의 6자리 코드', optional: true },
          ]}
          submit={async (value) => {
            await api('/auth/login', value);
            await loadSession();
            setMessage('');
          }}
        />
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <div className="eyebrow">CHURCH MANAGEMENT</div>
          <h1>교적 관리</h1>
          <p>{session.username}님 · 변화 이력을 함께 관리합니다</p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            void api('/auth/logout', {})
              .then(() => {
                setSession(null);
                setCsrf('');
                setSelected(null);
                setMembers([]);
              })
              .catch((e) => setMessage(String(e)))
          }
        >
          로그아웃
        </button>
      </header>
      <nav aria-label="업무 메뉴">
        {[
          ['members', '교인'],
          ['households', '가족'],
          ['organizations', '조직'],
          ['positions', '직분'],
          ['audit', '감사 기록'],
          ['admin', '계정·권한'],
          ['care', '심방·목양'],
          ['newcomers', '새가족'],
          ['attendance', '모임·출석'],
          ['transfers', '가져오기·내보내기'],
          ['account', '내 계정'],
        ]
          .filter(([key]) => {
            if (key === 'account') return true;
            if (key === 'attendance') return can('attendance.read');
            if (key === 'newcomers') return can('newcomer.read');
            if (key === 'care') return can('care.read');
            if (key === 'transfers') return can('membership.import') || can('membership.export');
            if (key === 'audit') return can('audit.read') && session.scopeMode === 'ALL';
            if (key === 'admin') return can('identity.manage') && session.scopeMode === 'ALL';
            return can('membership.read');
          })
          .map(([key, label]) => (
            <button
              className={tab === key ? 'active' : 'secondary'}
              key={key}
              onClick={() => {
                setTab(key!);
                setMessage('');
              }}
            >
              {label}
            </button>
          ))}
      </nav>
      {message && (
        <p role="alert" className="notice">
          {message}
        </p>
      )}
      {!session.mfaVerified && can('identity.manage') && (
        <p className="notice">
          운영 관리자는 내 계정에서 MFA를 등록한 뒤 인증 코드를 사용해 다시 로그인하세요.
        </p>
      )}
      {tab === 'members' && (
        <>
          <section className="panel">
            <h2>교인 목록</h2>
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query);
                setCursor('');
              }}
            >
              <label>
                이름·교인번호{can('membership.pii') ? '·연락처' : ''}
                <input value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <button>검색</button>
            </form>
            <table>
              <thead>
                <tr>
                  <th>교인번호</th>
                  <th>이름</th>
                  <th>상태</th>
                  <th>등록일</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.memberNumber}</td>
                    <td>
                      <button className="link" onClick={() => void openMember(m.id)}>
                        {m.name}
                      </button>
                    </td>
                    <td>{statusLabel(m.status)}</td>
                    <td>{m.registeredOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {members.length === 0 && (
              <p className="empty">등록된 교인이 없거나 검색 결과가 없습니다.</p>
            )}
            <div className="actions">
              <button className="secondary" onClick={() => setCursor('')} disabled={!cursor}>
                처음
              </button>
              <button className="secondary" disabled={!next} onClick={() => setCursor(next ?? '')}>
                다음
              </button>
            </div>
          </section>
          {full && can('membership.write') && (
            <Form
              title="교인 등록"
              fields={[
                { name: 'memberNumber', label: '교인번호' },
                { name: 'name', label: '이름' },
                { name: 'registeredOn', label: '등록일', type: 'date', value: today() },
                { name: 'status', label: '교적 상태', type: 'select', options: statusChoices },
                ...(can('membership.pii')
                  ? [
                      { name: 'phone', label: '연락처 (선택)', optional: true },
                      { name: 'address', label: '주소 (선택)', optional: true },
                    ]
                  : []),
              ]}
              submit={async (d) => {
                await mutate('/members', d);
              }}
            />
          )}
          {selected && (
            <section className="panel" key={`${selected.id}-${selected.version}`}>
              <h2>{selected.name} · 상세와 이력</h2>
              <p>
                {selected.memberNumber} · {statusLabel(selected.status)} · {selected.phone ?? ''}{' '}
                {selected.address ?? ''}
              </p>
              <h3>개인 간 가족 관계</h3>
              <ul>
                {selected.relations?.map((x) => (
                  <li key={x.id}>
                    {x.name} · {x.relationship} · {x.effectiveFrom} ~ {x.effectiveTo ?? '현재'}
                    {can('membership.write') && !x.effectiveTo && (
                      <Form
                        title="관계 종료"
                        fields={[
                          { name: 'effectiveTo', label: '종료일', type: 'date', value: today() },
                        ]}
                        submit={async (d) => {
                          await mutate(`/member-relations/${x.id}/end`, d);
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {can('membership.write') && (
                <Form
                  title="개인 간 가족 관계 등록"
                  fields={[
                    {
                      name: 'relatedMemberId',
                      label: '관련 교인 (현재 검색 결과)',
                      type: 'select',
                      options: members
                        .filter((m) => m.id !== selected.id)
                        .map((m) => ({ value: m.id, label: `${m.name} (${m.memberNumber})` })),
                    },
                    {
                      name: 'relationship',
                      label: '선택한 교인은 이 교인의 누구인가요? (예: 부모)',
                    },
                    { name: 'effectiveFrom', label: '관계 시작일', type: 'date', value: today() },
                  ]}
                  submit={async (d) => {
                    await mutate(`/members/${selected.id}/relations`, d);
                  }}
                />
              )}
              <h3>상태 이력</h3>
              <ul>
                {selected.statusHistory?.map((x) => (
                  <li key={x.id}>
                    {x.effectiveFrom} · {statusLabel(x.toStatus)} {x.reason ? `· ${x.reason}` : ''}
                  </li>
                ))}
              </ul>
              {[
                ['가족', selected.households],
                ['조직 소속', selected.organizations],
                ['직분', selected.positions],
              ].map(([label, rows]) => (
                <div key={String(label)}>
                  <h3>{String(label)} 이력</h3>
                  <ul>
                    {(rows as Period[] | undefined)?.map((x) => (
                      <li key={x.id}>
                        {x.name ??
                          households.find((h) => h.id === x.householdId)?.name ??
                          organizations.find((o) => o.id === x.organizationId)?.name ??
                          '이전 소속'}{' '}
                        · {x.effectiveFrom} ~ {x.effectiveTo ?? '현재'}{' '}
                        {x.relationship ?? x.role ?? ''}
                        {!x.effectiveTo &&
                          full &&
                          can('membership.write') &&
                          (label === '조직 소속' || label === '직분') && (
                            <Form
                              title="종료"
                              fields={[
                                {
                                  name: 'effectiveTo',
                                  label: '종료일',
                                  type: 'date',
                                  value: today(),
                                },
                              ]}
                              submit={async (d) => {
                                await mutate(
                                  `/${label === '직분' ? 'position-appointments' : 'organization-memberships'}/${x.id}/end`,
                                  d,
                                );
                              }}
                            />
                          )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {can('membership.write') && (
                <div className="grid">
                  <Form
                    title="기본 정보 수정"
                    fields={[
                      { name: 'name', label: '이름', value: selected.name },
                      ...(can('membership.pii')
                        ? [
                            {
                              name: 'phone',
                              label: '연락처',
                              value: selected.phone ?? '',
                              optional: true,
                            },
                            {
                              name: 'address',
                              label: '주소',
                              value: selected.address ?? '',
                              optional: true,
                            },
                          ]
                        : []),
                    ]}
                    submit={async (d) => {
                      await mutate(
                        `/members/${selected.id}`,
                        { ...d, version: selected.version },
                        'PATCH',
                      );
                    }}
                  />
                  <Form
                    title="상태 변경"
                    fields={[
                      {
                        name: 'status',
                        label: '변경할 상태',
                        type: 'select',
                        options: statusChoices.filter((x) =>
                          definitions.statuses
                            .find((y) => y.code === selected.status)
                            ?.allowedNext.includes(x.value),
                        ),
                      },
                      { name: 'effectiveFrom', label: '적용일', type: 'date', value: today() },
                      { name: 'reason', label: '변경 사유' },
                    ]}
                    submit={async (d) => {
                      await mutate(`/members/${selected.id}/status-changes`, {
                        ...d,
                        version: selected.version,
                      });
                    }}
                  />
                  {full && (
                    <>
                      <Form
                        title="가족 배정·이동"
                        fields={[
                          {
                            name: 'householdId',
                            label: '가족',
                            type: 'select',
                            options: named(households.filter((x) => !x.archived)),
                          },
                          { name: 'relationship', label: '가족 내 관계' },
                          { name: 'effectiveFrom', label: '시작일', type: 'date', value: today() },
                        ]}
                        submit={async (d) => {
                          await mutate('/household-moves', { ...d, memberId: selected.id });
                        }}
                      />
                      <Form
                        title="조직 소속 등록"
                        fields={[
                          {
                            name: 'organizationId',
                            label: '조직',
                            type: 'select',
                            options: named(organizations.filter((x) => !x.closedOn)),
                          },
                          { name: 'role', label: '역할' },
                          { name: 'primary', label: '주 소속', type: 'checkbox' },
                          { name: 'effectiveFrom', label: '시작일', type: 'date', value: today() },
                        ]}
                        submit={async (d) => {
                          await mutate('/organization-memberships', {
                            ...d,
                            memberId: selected.id,
                          });
                        }}
                      />
                      <Form
                        title="직분 임명"
                        fields={[
                          {
                            name: 'positionId',
                            label: '직분',
                            type: 'select',
                            options: named(positions.filter((x) => x.active)),
                          },
                          {
                            name: 'organizationId',
                            label: '임명 조직 (선택)',
                            type: 'select',
                            optional: true,
                            options: named(organizations.filter((x) => !x.closedOn)),
                          },
                          { name: 'effectiveFrom', label: '임명일', type: 'date', value: today() },
                        ]}
                        submit={async (d) => {
                          await mutate('/position-appointments', { ...d, memberId: selected.id });
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
      {tab === 'households' && (
        <>
          <section className="panel">
            <h2>가족</h2>
            {masterNext.households && (
              <button className="secondary" onClick={() => void loadMore('households')}>
                더 보기
              </button>
            )}
            {households.map((h) => (
              <div className="list-row" key={h.id}>
                <button className="link" onClick={() => void loadHousehold(h)}>
                  {h.name}
                </button>
                <span>{h.archived ? '보관됨' : `${h.activeMembers}명`}</span>
                {full && can('membership.write') && !h.archived && h.activeMembers === 0 && (
                  <button
                    className="secondary"
                    onClick={() =>
                      void mutate(`/households/${h.id}/archive`, {}).catch((e) =>
                        setMessage(String(e)),
                      )
                    }
                  >
                    빈 가족 보관
                  </button>
                )}
              </div>
            ))}
          </section>
          {full && can('membership.write') && (
            <Form
              title="가족 만들기"
              fields={[
                { name: 'name', label: '가족 이름' },
                ...(can('membership.pii')
                  ? [
                      { name: 'phone', label: '공통 연락처', optional: true },
                      { name: 'address', label: '공통 주소', optional: true },
                    ]
                  : []),
              ]}
              submit={async (d) => {
                await mutate('/households', d);
              }}
            />
          )}
          {household && (
            <section className="panel">
              <h2>{household.name} 구성원</h2>
              <form
                className="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadHousehold(household, at);
                }}
              >
                <label>
                  특정 날짜 (비우면 현재)
                  <input type="date" value={at} onChange={(e) => setAt(e.target.value)} />
                </label>
                <button>조회</button>
              </form>
              <ul>
                {householdMembers.map((x) => (
                  <li key={x.id}>
                    {x.name ?? x.relationship} · {x.relationship}{' '}
                    {x.representative ? '· 대표자' : ''}
                  </li>
                ))}
              </ul>
              {full && can('membership.write') && (
                <Form
                  title="대표자 지정"
                  fields={[
                    {
                      name: 'memberId',
                      label: '현재 구성원',
                      type: 'select',
                      options: householdMembers
                        .filter((x) => !x.effectiveTo && x.memberId)
                        .map((x) => ({
                          value: x.memberId!,
                          label: x.name ?? x.relationship ?? '구성원',
                        })),
                    },
                  ]}
                  submit={async (d) => {
                    await mutate(`/households/${household.id}/representative`, d);
                    await loadHousehold(household);
                  }}
                />
              )}
            </section>
          )}
        </>
      )}
      {tab === 'organizations' && (
        <>
          <section className="panel">
            <h2>조직</h2>
            {masterNext.organizations && (
              <button className="secondary" onClick={() => void loadMore('organizations')}>
                더 보기
              </button>
            )}
            {organizations.map((o) => (
              <details key={o.id}>
                <summary>
                  {o.name} ·{' '}
                  {definitions.organizationTypes.find((t) => t.code === o.type)?.name ?? o.type}{' '}
                  {o.closedOn ? `· 폐쇄 ${o.closedOn}` : ''}{' '}
                  {o.parentId
                    ? ` / ${organizations.find((x) => x.id === o.parentId)?.name ?? '상위 조직'}`
                    : ''}
                </summary>
                {full && can('membership.write') && !o.closedOn && (
                  <div className="grid">
                    <Form
                      title="상위 조직 변경"
                      fields={[
                        {
                          name: 'parentId',
                          label: '상위 조직 (비우면 최상위)',
                          type: 'select',
                          optional: true,
                          options: named(organizations.filter((x) => x.id !== o.id && !x.closedOn)),
                        },
                      ]}
                      submit={async (d) => {
                        await mutate(`/organizations/${o.id}/parent`, {
                          parentId: d.parentId || null,
                        });
                      }}
                    />
                    <Form
                      title="조직 폐쇄"
                      fields={[
                        { name: 'effectiveTo', label: '폐쇄일', type: 'date', value: today() },
                      ]}
                      submit={async (d) => {
                        await mutate(`/organizations/${o.id}/close`, d);
                      }}
                    />
                  </div>
                )}
              </details>
            ))}
          </section>
          {full && can('membership.write') && (
            <Form
              title="조직 만들기"
              fields={[
                { name: 'name', label: '조직명' },
                {
                  name: 'type',
                  label: '유형',
                  type: 'select',
                  options: definitions.organizationTypes.map((x) => ({
                    value: x.code,
                    label: x.name,
                  })),
                },
                {
                  name: 'parentId',
                  label: '상위 조직 (선택)',
                  type: 'select',
                  optional: true,
                  options: named(organizations.filter((x) => !x.closedOn)),
                },
              ]}
              submit={async (d) => {
                await mutate('/organizations', d);
              }}
            />
          )}
        </>
      )}
      {tab === 'positions' && (
        <>
          <section className="panel">
            <h2>직분</h2>
            {masterNext.positions && (
              <button className="secondary" onClick={() => void loadMore('positions')}>
                더 보기
              </button>
            )}
            {[...positions]
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((p) => (
                <details key={p.id}>
                  <summary>
                    {p.name} · {p.active ? '사용 중' : '비활성'}
                  </summary>
                  {full && can('membership.write') && (
                    <Form
                      title="직분 설정"
                      fields={[
                        { name: 'name', label: '직분명', value: p.name },
                        {
                          name: 'sortOrder',
                          label: '표시 순서',
                          type: 'number',
                          value: p.sortOrder ?? 0,
                        },
                        {
                          name: 'allowConcurrent',
                          label: '동일 교인의 중복 임명 허용',
                          type: 'checkbox',
                          value: p.allowConcurrent ?? false,
                        },
                        {
                          name: 'active',
                          label: '사용',
                          type: 'checkbox',
                          value: p.active ?? true,
                        },
                      ]}
                      submit={async (d) => {
                        await mutate(`/positions/${p.id}`, d, 'PATCH');
                      }}
                    />
                  )}
                </details>
              ))}
          </section>
          {full && can('membership.write') && (
            <Form
              title="직분 만들기"
              fields={[
                { name: 'name', label: '직분명' },
                { name: 'sortOrder', label: '표시 순서', type: 'number', value: 0 },
                { name: 'allowConcurrent', label: '동일 교인의 중복 임명 허용', type: 'checkbox' },
                { name: 'active', label: '사용', type: 'checkbox', value: true },
              ]}
              submit={async (d) => {
                await mutate('/positions', d);
              }}
            />
          )}
        </>
      )}
      {tab === 'audit' && (
        <section className="panel">
          <h2>감사 기록</h2>
          <table>
            <thead>
              <tr>
                <th>기록 시각</th>
                <th>작업</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((x) => (
                <tr key={x.id}>
                  <td>{new Date(x.createdAt).toLocaleString('ko-KR')}</td>
                  <td>{x.action}</td>
                  <td>{x.outcome === 'success' ? '성공' : '거부'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <button className="secondary" onClick={() => setAuditCursor('')}>
              처음
            </button>
            <button disabled={!auditNext} onClick={() => setAuditCursor(auditNext ?? '')}>
              다음
            </button>
          </div>
        </section>
      )}
      {tab === 'admin' && (
        <>
          <section className="panel">
            <h2>계정과 역할</h2>
            <ScopePanel
              root={root}
              users={admin.users.filter((u) => u.id !== session.userId)}
              organizations={organizations}
              members={members}
            />
            <p>
              권한 변경은 로그인 후 15분 이내에 가능합니다. 새 계정은 역할과 데이터 범위 지정 후
              업무에 접근할 수 있습니다.
            </p>
            {admin.users.map((u) => (
              <p key={u.id}>
                {u.username} · {u.active ? '활성' : '비활성'}
              </p>
            ))}
          </section>
          <div className="grid">
            <Form
              title="사용자 만들기"
              fields={[
                { name: 'username', label: '사용자명' },
                { name: 'password', label: '초기 비밀번호 (12자 이상)', type: 'password' },
              ]}
              submit={async (d) => {
                await mutate('/identity/users', d);
              }}
            />
            <Form
              title="역할 만들기"
              fields={[
                { name: 'name', label: '역할 이름' },
                ...admin.grantablePermissions
                  .filter((x) => x !== 'session.read')
                  .map((x) => ({ name: x, label: x, type: 'checkbox' as const })),
              ]}
              submit={async (d) => {
                await mutate('/identity/roles', {
                  name: d.name,
                  permissions: Object.keys(d).filter((k) => k !== 'name' && d[k] === true),
                });
              }}
            />
            <Form
              title="사용자 역할·활성 상태 설정"
              fields={[
                {
                  name: 'userId',
                  label: '사용자',
                  type: 'select',
                  options: admin.users
                    .filter((u) => u.id !== session.userId)
                    .map((u) => ({ value: u.id, label: u.username })),
                },
                { name: 'roleId', label: '역할', type: 'select', options: named(admin.roles) },
                { name: 'active', label: '활성', type: 'checkbox', value: true },
              ]}
              submit={async (d) => {
                await mutate(
                  `/identity/users/${d.userId}`,
                  { roleIds: [d.roleId], active: d.active },
                  'PATCH',
                );
              }}
            />
            <Form
              title="교적 상태 설정"
              fields={[
                { name: 'code', label: '상태 코드 (영문 대문자)' },
                { name: 'name', label: '표시 이름' },
                { name: 'allowedNext', label: '다음 상태 코드 (쉼표 구분)', optional: true },
              ]}
              submit={async (d) => {
                await mutate('/member-statuses', {
                  code: d.code,
                  name: d.name,
                  allowedNext: String(d.allowedNext ?? '')
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                });
              }}
            />
            <Form
              title="조직 유형 설정"
              fields={[
                { name: 'code', label: '유형 코드 (영문 대문자)' },
                { name: 'name', label: '유형 이름' },
              ]}
              submit={async (d) => {
                await mutate('/organization-types', d);
              }}
            />
          </div>
        </>
      )}
      {tab === 'care' && (
        <CarePanel
          root={root}
          userId={session.userId}
          permissions={session.permissions}
          full={session.scopeMode === 'ALL'}
          households={households}
        />
      )}
      {tab === 'newcomers' && (
        <NewcomerPanel
          root={root}
          canWrite={!!can('newcomer.write')}
          canConfigure={!!can('identity.manage') && session.scopeMode === 'ALL'}
        />
      )}
      {tab === 'attendance' && (
        <AttendancePanel
          root={root}
          canWrite={!!can('attendance.write')}
          organizations={organizations}
        />
      )}
      {tab === 'transfers' && <TransferPanel root={root} permissions={session.permissions} />}
      {tab === 'account' && (
        <div className="grid">
          <Form
            title="비밀번호 변경"
            fields={[
              { name: 'currentPassword', label: '현재 비밀번호', type: 'password' },
              { name: 'password', label: '새 비밀번호 (12자 이상)', type: 'password' },
            ]}
            submit={async (d) => {
              await api('/auth/password', d);
              setSession(null);
              setCsrf('');
            }}
          />
          <section className="panel">
            <h2>인증 앱 MFA</h2>
            {session.totpEnabled ? (
              <p>MFA가 설정되어 있습니다.</p>
            ) : (
              <>
                <p>인증 앱에 설정 키를 등록하고 생성되는 6자리 코드를 입력하세요.</p>
                <button
                  onClick={() =>
                    void api<{ secret: string }>('/auth/mfa/enroll', {})
                      .then((x) => setMfaSecret(x.secret))
                      .catch((e) => setMessage(String(e)))
                  }
                >
                  설정 키 생성
                </button>
                {mfaSecret && (
                  <>
                    <p className="secret">{mfaSecret}</p>
                    <Form
                      title="MFA 등록 확인"
                      fields={[{ name: 'code', label: '6자리 인증 코드' }]}
                      submit={async (d) => {
                        await api('/auth/mfa/confirm', d);
                        setMfaSecret('');
                        setSession(null);
                        setCsrf('');
                      }}
                    />
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <footer>교적 Core · 권한에 따라 조회 가능한 정보와 작업이 달라집니다.</footer>
    </main>
  );
}
