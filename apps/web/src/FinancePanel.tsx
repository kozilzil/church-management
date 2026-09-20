import type { ExpenseBudgetStatus } from '@church/contracts';
import { BudgetControlSettings } from './BudgetControlSettings';
import { BudgetPanel } from './BudgetPanel';
import { FinanceReportPanel } from './FinanceReportPanel';
import { useState, useEffect, type FormEvent } from 'react';
import { api, uploadEvidence, evidenceBlob } from './api';
import { OperationForm } from './OperationForm';
type Account = { id: string; code: string; name: string; kind: string };
type Fund = { id: string; name: string };
type Period = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  closedAt: string | null;
};
type Catalog = { accounts: Account[]; funds: Fund[]; periods: Period[] };
type Candidate = { id: string; username: string };
type FileInfo = { id: string; filename: string; mime: string; size: number };
type Summary = {
  id: string;
  title: string;
  amount: number;
  state: string;
  requesterId: string;
  requester?: string;
  currentApproverId: string | null;
  version: number;
  round: number;
};
type Event = {
  id: string;
  action: string;
  reason: string;
  actorId: string;
  version: number;
  round: number;
  createdAt: string;
};
type Page<T> = { items: T[]; nextCursor: string | null };
type Submission = {
  id: string;
  round: number;
  title: string;
  purpose: string;
  payee: string;
  amount: number;
  evidenceReference: string;
  createdAt: string;
  attachments: FileInfo[];
  approvals: {
    position: number;
    username: string;
    userId: string;
    decision: string;
    reason: string;
    decidedAt: string | null;
  }[];
};
type Detail = Summary & {
  budgetYear: number | null;
  budgetCheck: ExpenseBudgetStatus | null;
  budgetChecks: {
    action: string;
    year: number | null;
    mode: string;
    status: string;
    createdAt: string;
  }[];
  purpose: string;
  payee: string;
  accountId: string;
  fundId: string;
  evidenceReference: string;
  approverIds: string[];
  attachments: FileInfo[];
  submissions: Submission[];
  olderSubmissionCount: number;
  events: Page<Event>;
  payment: null | {
    paidOn: string;
    payer?: string;
    reference: string;
    method: string;
    amount: number;
    journalId: string;
    reversal: null | { id: string; postedOn: string };
  };
};
type Journal = {
  id: string;
  postedOn: string;
  description: string;
  reversalOf: string | null;
  lines: { id: string; accountId: string; fundId: string; debit: number; credit: number }[];
};
const status: Record<string, string> = {
  DRAFT: '초안',
  IN_REVIEW: '결재 중',
  RETURNED: '반려',
  APPROVED: '승인 완료',
  PAID: '지급 기록 완료',
  CANCELLED: '취소',
  PENDING: '대기',
  REJECTED: '반려',
};
const actionNames: Record<string, string> = {
  create: '초안 작성',
  update: '내용 수정',
  submit: '상신',
  approve: '승인',
  reject: '반려',
  cancel: '취소',
  pay: '지급 기록',
  'attachment.add': '증빙 첨부',
  'attachment.remove': '증빙 제외',
};
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const options = (rows: { id: string; name: string }[]) =>
  rows.map((x) => ({ value: x.id, label: x.name }));
function ExpenseEditor({
  initial,
  catalog,
  candidates,
  save,
  onDirty,
}: {
  initial: Detail | null;
  catalog: Catalog;
  candidates: Candidate[];
  save: (d: Record<string, unknown>) => Promise<void>;
  onDirty?: () => void;
}) {
  const [line, setLine] = useState<string[]>(initial?.approverIds ?? []),
    [candidate, setCandidate] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await save({
        ...d,
        budgetYear: Number(d.budgetYear),
        amount: Number(d.amount),
        approverIds: line,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit} onChange={() => onDirty?.()}>
      <h3>{initial ? '요청서 수정' : '새 지출 요청'}</h3>
      <div className="fields">
        <label>
          제목
          <input name="title" required maxLength={120} defaultValue={initial?.title} />
        </label>
        <label>
          수령인 표시명
          <input name="payee" required maxLength={100} defaultValue={initial?.payee} />
        </label>
        <label>
          금액 (원)
          <input
            name="amount"
            type="number"
            min="1"
            max="999999999999"
            step="1"
            required
            defaultValue={initial?.amount}
          />
        </label>
        <label>
          예산 연도
          <input
            name="budgetYear"
            type="number"
            required
            min="1900"
            max="9999"
            step="1"
            defaultValue={initial?.budgetYear ?? ''}
            placeholder="실제 지급 예정 연도"
          />
        </label>
        <label>
          비용 계정
          <select name="accountId" required defaultValue={initial?.accountId ?? ''}>
            <option value="">선택하세요</option>
            {catalog.accounts
              .filter((x) => x.kind === 'EXPENSE')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          기금
          <select name="fundId" required defaultValue={initial?.fundId ?? ''}>
            <option value="">선택하세요</option>
            {catalog.funds.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          증빙 문서 번호·보관 위치 (선택)
          <input
            name="evidenceReference"
            maxLength={300}
            defaultValue={initial?.evidenceReference}
          />
        </label>
      </div>
      <label>
        지출 용도
        <textarea
          name="purpose"
          required
          maxLength={2000}
          rows={3}
          defaultValue={initial?.purpose}
        />
      </label>
      <fieldset onClickCapture={() => onDirty?.()}>
        <legend>결재선 — 요청자가 순서를 정합니다</legend>
        <p>본인을 제외한 결재자 1–5명. 지급 담당자는 요청자·결재자와 달라야 합니다.</p>
        <ol>
          {line.map((id, i) => (
            <li key={id} className="approval-person">
              <span>
                {candidates.find((c) => c.id === id)?.username ??
                  initial?.submissions.flatMap((s) => s.approvals).find((a) => a.userId === id)
                    ?.username ??
                  id}
              </span>
              <button
                type="button"
                className="secondary"
                aria-label={`${i + 1}번째 결재자 위로`}
                disabled={i === 0}
                onClick={() =>
                  setLine((prev) => {
                    const n = [...prev];
                    [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
                    return n;
                  })
                }
              >
                ↑
              </button>
              <button
                type="button"
                className="secondary"
                aria-label={`${i + 1}번째 결재자 아래로`}
                disabled={i === line.length - 1}
                onClick={() =>
                  setLine((prev) => {
                    const n = [...prev];
                    [n[i], n[i + 1]] = [n[i + 1]!, n[i]!];
                    return n;
                  })
                }
              >
                ↓
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setLine(line.filter((x) => x !== id))}
              >
                제외
              </button>
            </li>
          ))}
        </ol>
        <label>
          추가할 결재자
          <select value={candidate} onChange={(e) => setCandidate(e.target.value)}>
            <option value="">선택하세요</option>
            {candidates
              .filter((c) => !line.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.username}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          disabled={!candidate || line.length >= 5}
          onClick={() => {
            setLine([...line, candidate]);
            setCandidate('');
          }}
        >
          결재선에 추가
        </button>
      </fieldset>
      <p>먼저 초안을 저장한 뒤 사진·PDF를 첨부하고 상신하세요.</p>
      <button disabled={busy}>{busy ? '저장 중…' : '초안 저장'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function FinancePanel({
  root,
  permissions,
  userId,
}: {
  root: string;
  permissions: string[];
  userId: string;
}) {
  const can = (p: string) => permissions.includes(p),
    base = `${root}/finance`;
  const [section, setSection] = useState(
    can('expense.read')
      ? 'expenses'
      : can('budget.read')
        ? 'budgets'
        : can('finance.report')
          ? 'reports'
          : can('finance.manage')
            ? 'settings'
            : 'ledger',
  );
  const [catalog, setCatalog] = useState<Catalog>({ accounts: [], funds: [], periods: [] }),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [candidateCursor, setCandidateCursor] = useState<string | null>(null);
  const [list, setList] = useState<Page<Summary>>({ items: [], nextCursor: null }),
    [filter, setFilter] = useState('mine'),
    [cursor, setCursor] = useState(''),
    [selected, setSelected] = useState<Detail | null>(null),
    [creating, setCreating] = useState(false),
    [revision, setRevision] = useState(0);
  const [journals, setJournals] = useState<Page<Journal>>({ items: [], nextCursor: null }),
    [journalCursor, setJournalCursor] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<{ url: string; file: FileInfo } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [round, setRound] = useState('1'),
    [oldSubmission, setOldSubmission] = useState<Submission | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (
          permissions.includes('expense.read') ||
          permissions.includes('finance.manage') ||
          permissions.includes('finance.readall')
        ) {
          const c = await api<Catalog>(
            `${base}/${permissions.includes('expense.read') ? 'definitions' : permissions.includes('finance.manage') ? 'settings' : 'ledger-definitions'}`,
          );
          if (active) setCatalog(c);
        }
        if (permissions.includes('expense.read')) {
          const p = await api<Page<Candidate>>(`${base}/approvers?limit=100`);
          if (active) {
            setCandidates(p.items);
            setCandidateCursor(p.nextCursor);
          }
        }
      } catch (e) {
        if (active) setMessage(String(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [base, permissions, revision]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (section === 'expenses' && permissions.includes('expense.read')) {
          const p = await api<Page<Summary>>(
            `${base}/expenses?state=${filter}${cursor ? `&cursor=${cursor}` : ''}`,
          );
          if (active) setList(p);
        }
        if (section === 'ledger' && permissions.includes('finance.readall')) {
          const p = await api<Page<Journal>>(
            `${base}/journals${journalCursor ? `?cursor=${journalCursor}` : ''}`,
          );
          if (active) setJournals(p);
        }
      } catch (e) {
        if (active) setMessage(String(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [base, permissions, section, filter, cursor, journalCursor, revision]);
  async function open(id: string) {
    const d = await api<Detail>(`${base}/expenses/${id}`);
    setSelected(d);
    setDirty(false);
    setCreating(false);
    setAck(false);
    setFile(null);
    setPreview(null);
    setOldSubmission(null);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setRevision((n) => n + 1);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function mutate(path: string, d: unknown, method = 'POST') {
    await api(`${base}${path}`, d, method);
    if (selected) await open(selected.id);
    setRevision((n) => n + 1);
  }
  async function viewFile(f: FileInfo) {
    if (!selected) return;
    const blob = await evidenceBlob(`${base}/expenses/${selected.id}/attachments/${f.id}`);
    setPreview({ url: URL.createObjectURL(blob), file: f });
  }
  const editable =
    selected &&
    selected.requesterId === userId &&
    ['DRAFT', 'RETURNED'].includes(selected.state) &&
    can('expense.write');
  const files = (items: FileInfo[]) => (
    <ul className="evidence-list">
      {items.map((f) => (
        <li key={f.id}>
          <span>
            {f.filename} · {(f.size / 1024).toFixed(0)} KB
          </span>
          <button disabled={busy} className="secondary" onClick={() => void run(() => viewFile(f))}>
            {f.mime.startsWith('image/') ? '사진 확인·다운로드' : 'PDF 다운로드 준비'}
          </button>
        </li>
      ))}
    </ul>
  );
  const submissionView = (s: Submission) => (
    <article className="submission" key={s.id}>
      <h4>
        {s.round}차 제출본 · {s.title} · {won(s.amount)}
      </h4>
      <p>
        수령인: {s.payee} · 용도: {s.purpose}
      </p>
      <p>증빙 참조: {s.evidenceReference || '첨부 증빙'}</p>
      <ol>
        {s.approvals.map((a) => (
          <li key={a.position}>
            {a.username} — {status[a.decision] ?? a.decision}
            {a.reason && ` · ${a.reason}`}
          </li>
        ))}
      </ol>
      {files(s.attachments)}
    </article>
  );
  return (
    <section className="panel finance-panel">
      <h2>지출 결재·재정</h2>
      <p>
        요청자가 결재선을 지정하고, 승인된 지출의 지급 사실을 기록합니다. 은행 송금은 별도로
        처리하세요.
      </p>
      <nav className="actions" aria-label="재정 메뉴">
        {can('budget.read') && (
          <button
            className={section === 'budgets' ? '' : 'secondary'}
            onClick={() => setSection('budgets')}
          >
            연간 예산
          </button>
        )}
        {can('finance.report') && (
          <button
            className={section === 'reports' ? '' : 'secondary'}
            onClick={() => setSection('reports')}
          >
            재정보고서
          </button>
        )}
        {can('expense.read') && (
          <button
            className={section === 'expenses' ? '' : 'secondary'}
            onClick={() => setSection('expenses')}
          >
            지출 요청·결재
          </button>
        )}
        {can('finance.readall') && (
          <button
            className={section === 'ledger' ? '' : 'secondary'}
            onClick={() => setSection('ledger')}
          >
            회계 원장
          </button>
        )}
        {can('finance.manage') && (
          <button
            className={section === 'settings' ? '' : 'secondary'}
            onClick={() => setSection('settings')}
          >
            재정 설정
          </button>
        )}
      </nav>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
      {section === 'budgets' && can('budget.read') && (
        <BudgetPanel base={base} permissions={permissions} userId={userId} />
      )}
      {section === 'reports' && can('finance.report') && (
        <FinanceReportPanel base={base} permissions={permissions} />
      )}
      {section === 'expenses' && (
        <>
          <div className="actions">
            <label>
              목록 조건
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setCursor('');
                }}
              >
                <option value="mine">내 요청</option>
                <option value="review">내 결재 대기</option>
                {can('expense.pay') && <option value="pay">지급 대기</option>}
                <option value="all">조회 가능한 전체</option>
                {Object.entries(status)
                  .filter(([k]) => !['PENDING', 'REJECTED'].includes(k))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            {can('expense.write') && (
              <button
                onClick={() => {
                  setCreating(true);
                  setSelected(null);
                  setPreview(null);
                }}
              >
                새 지출 요청
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>요청자</th>
                <th>금액</th>
                <th>상태</th>
                <th>열기</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((x) => (
                <tr key={x.id}>
                  <td>{x.title}</td>
                  <td>{x.requester}</td>
                  <td>{won(x.amount)}</td>
                  <td>{status[x.state]}</td>
                  <td>
                    <button className="secondary" onClick={() => void run(() => open(x.id))}>
                      요청서 보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.items.length && <p>해당 지출이 없습니다.</p>}
          <div className="actions">
            <button className="secondary" disabled={!cursor} onClick={() => setCursor('')}>
              처음
            </button>
            <button
              className="secondary"
              disabled={!list.nextCursor}
              onClick={() => setCursor(list.nextCursor ?? '')}
            >
              다음
            </button>
          </div>
          {candidateCursor && (
            <button
              className="secondary"
              onClick={() =>
                void run(async () => {
                  const p = await api<Page<Candidate>>(
                    `${base}/approvers?limit=100&cursor=${candidateCursor}`,
                  );
                  setCandidates([...candidates, ...p.items]);
                  setCandidateCursor(p.nextCursor);
                })
              }
            >
              결재자 더 불러오기
            </button>
          )}
          {creating && (
            <ExpenseEditor
              key="new"
              initial={null}
              catalog={catalog}
              candidates={candidates}
              save={async (d) => {
                const r = await api<{ id: string }>(`${base}/expenses`, d);
                await open(r.id);
                setRevision((n) => n + 1);
              }}
            />
          )}
          {selected && (
            <section className="expense-detail">
              <h3>
                {selected.title} <span className="status-pill">{status[selected.state]}</span>
              </h3>
              <p>
                요청자: {selected.requester} · 예산 연도:{' '}
                {selected.budgetYear ?? '미지정 (기존 요청)'}
              </p>
              {selected.budgetCheck && (
                <div className="notice" role="status">
                  <strong>
                    예산 확인:{' '}
                    {
                      {
                        WITHIN: '예산 이내',
                        UNBUDGETED: '미편성',
                        EXCEEDED: '예약액 포함 예산 초과',
                        LEGACY_YEAR: '기존 요청의 예산 연도 미지정',
                      }[selected.budgetCheck.status]
                    }
                  </strong>
                  <p>
                    {selected.budgetCheck.mode === 'BLOCK'
                      ? '초과·미편성 요청의 상신·승인·지급은 차단됩니다.'
                      : '경고 모드입니다. 예산 상태를 확인한 후 진행하세요.'}{' '}
                    다른 미지급 결재 예약액도 포함하며 처리 시 다시 확인합니다.
                  </p>
                  {selected.budgetCheck.status === 'LEGACY_YEAR' && (
                    <p>
                      새로 상신하려면 초안에 연도를 저장하세요. 기존 결재는 경고 모드에서 완료하거나
                      취소 후 새 연도로 다시 요청할 수 있습니다.
                    </p>
                  )}
                </div>
              )}
              <p className="expense-amount">{won(selected.amount)}</p>
              <p>
                수령인: {selected.payee} · 용도: {selected.purpose}
              </p>
              <p>
                비용 계정: {catalog.accounts.find((a) => a.id === selected.accountId)?.name} · 기금:{' '}
                {catalog.funds.find((f) => f.id === selected.fundId)?.name}
              </p>
              {editable && (
                <ExpenseEditor
                  key={`${selected.id}-${selected.version}`}
                  initial={selected}
                  onDirty={() => {
                    setDirty(true);
                    setAck(false);
                  }}
                  catalog={catalog}
                  candidates={candidates}
                  save={(d) =>
                    mutate(`/expenses/${selected.id}`, { ...d, version: selected.version }, 'PATCH')
                  }
                />
              )}
              <h4>현재 증빙</h4>
              <p>{selected.evidenceReference || '문서 참조 없음'}</p>
              {files(selected.attachments)}
              {editable && (
                <>
                  <div className="actions">
                    <label>
                      사진·영수증·PDF 첨부 (10 MiB 이하)
                      <input
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button
                      disabled={!file || busy}
                      onClick={() =>
                        void run(async () => {
                          if (!file) return;
                          if (file.size > 10 * 1024 * 1024)
                            throw new Error('파일당 최대 10 MiB입니다.');
                          await uploadEvidence(
                            `${base}/expenses/${selected.id}/attachments?version=${selected.version}`,
                            file,
                          );
                          await open(selected.id);
                        })
                      }
                    >
                      선택 파일 첨부
                    </button>
                  </div>
                  <p>최대 10개. 제출본에 포함된 원본은 이후에도 보존합니다.</p>
                  {selected.attachments.map((f) => (
                    <button
                      key={f.id}
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          mutate(
                            `/expenses/${selected.id}/attachments/${f.id}?version=${selected.version}`,
                            {},
                            'DELETE',
                          ),
                        )
                      }
                    >
                      {f.filename} 현재 증빙에서 제외
                    </button>
                  ))}
                  <div className="submit-review">
                    {dirty && <p role="status">수정한 내용과 결재선을 먼저 초안 저장하세요.</p>}
                    <p>
                      저장된 내용: {selected.title} · {won(selected.amount)} · 결재자{' '}
                      {selected.approverIds.length}명 · 첨부 {selected.attachments.length}개
                    </p>
                    <p>
                      저장된 결재선:{' '}
                      {selected.approverIds
                        .map((id) => candidates.find((c) => c.id === id)?.username ?? id)
                        .join(' → ')}
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={ack}
                        disabled={dirty}
                        onChange={(e) => setAck(e.target.checked)}
                      />{' '}
                      저장된 금액·결재선·증빙을 확인했습니다.
                    </label>
                    <button
                      disabled={!ack || busy || dirty}
                      onClick={() =>
                        void run(() =>
                          mutate(`/expenses/${selected.id}/submit`, { version: selected.version }),
                        )
                      }
                    >
                      상신
                    </button>
                  </div>
                </>
              )}
              {selected.state === 'IN_REVIEW' &&
                selected.currentApproverId === userId &&
                can('expense.approve') && (
                  <OperationForm
                    key={`decide-${selected.version}`}
                    title="내 결재 처리"
                    fields={[
                      {
                        name: 'decision',
                        label: '결재',
                        options: [
                          { value: 'APPROVED', label: '승인' },
                          { value: 'REJECTED', label: '반려' },
                        ],
                      },
                      { name: 'reason', label: '결재 의견·반려 사유' },
                    ]}
                    submit={(d) =>
                      mutate(`/expenses/${selected.id}/decisions`, {
                        ...d,
                        version: selected.version,
                      })
                    }
                  />
                )}
              {selected.state === 'APPROVED' &&
                can('expense.pay') &&
                selected.requesterId !== userId &&
                !selected.approverIds.includes(userId) && (
                  <OperationForm
                    title="실제 지급 후 지급 사실 기록"
                    fields={[
                      { name: 'paidOn', label: '실제 지급일', type: 'date' },
                      {
                        name: 'accountId',
                        label: '지급 자산 계정',
                        options: options(catalog.accounts.filter((x) => x.kind === 'ASSET')),
                      },
                      {
                        name: 'method',
                        label: '지급 방식',
                        options: [
                          { value: 'BANK', label: '계좌 이체' },
                          { value: 'CASH', label: '현금' },
                          { value: 'CARD', label: '체크카드 (즉시 출금)' },
                        ],
                      },
                      { name: 'reference', label: '고유 지급 참조 (이체·전표 번호)' },
                    ]}
                    submit={(d) =>
                      mutate(`/expenses/${selected.id}/payment`, {
                        ...d,
                        version: selected.version,
                      })
                    }
                  />
                )}
              {selected.payment && (
                <div className="notice">
                  <p>
                    지급일 {selected.payment.paidOn.slice(0, 10)} · {won(selected.payment.amount)} ·
                    참조 {selected.payment.reference}
                  </p>
                  <p>회계 전표: {selected.payment.journalId}</p>
                  {selected.payment.reversal && (
                    <p>
                      장부 역분개 완료: {selected.payment.reversal.postedOn.slice(0, 10)}. 실제 송금
                      취소 여부는 별도로 확인하세요.
                    </p>
                  )}
                </div>
              )}
              {selected.requesterId === userId &&
                can('expense.write') &&
                !['PAID', 'CANCELLED'].includes(selected.state) && (
                  <details>
                    <summary>요청 취소</summary>
                    <OperationForm
                      title="취소 사유"
                      fields={[{ name: 'reason', label: '사유' }]}
                      submit={(d) =>
                        mutate(`/expenses/${selected.id}/cancel`, {
                          ...d,
                          version: selected.version,
                        })
                      }
                    />
                  </details>
                )}
              <h4>예산 확인 이력 (최근 30건)</h4>
              {selected.budgetChecks?.map((x, i) => (
                <p key={i}>
                  {new Date(x.createdAt).toLocaleString('ko-KR')} ·{' '}
                  {{ SUBMIT: '상신', APPROVE: '승인', PAY: '지급' }[x.action]} ·{' '}
                  {x.year ?? '연도 미지정'} · {x.mode === 'BLOCK' ? '차단 모드' : '경고 모드'} ·{' '}
                  {
                    {
                      WITHIN: '예산 이내',
                      UNBUDGETED: '미편성',
                      EXCEEDED: '초과',
                      LEGACY_YEAR: '연도 미지정',
                    }[x.status]
                  }
                </p>
              ))}
              <h4>제출본·결재 이력</h4>
              {selected.submissions.map(submissionView)}
              {selected.olderSubmissionCount > 0 && (
                <>
                  <label>
                    이전 제출 회차
                    <input
                      type="number"
                      min="1"
                      max={selected.round}
                      value={round}
                      onChange={(e) => setRound(e.target.value)}
                    />
                  </label>
                  <button
                    onClick={() =>
                      void run(async () =>
                        setOldSubmission(
                          await api<Submission>(
                            `${base}/expenses/${selected.id}/submissions/${Number(round)}`,
                          ),
                        ),
                      )
                    }
                  >
                    회차 조회
                  </button>
                  {oldSubmission && submissionView(oldSubmission)}
                </>
              )}
              <h4>변경 이력</h4>
              <ul>
                {[...selected.events.items]
                  .sort((a, b) => b.version - a.version)
                  .map((e) => (
                    <li key={e.id}>
                      v{e.version} · {actionNames[e.action] ?? e.action} · {e.round}차 ·{' '}
                      {e.createdAt.slice(0, 10)}
                      {e.reason && ` · ${e.reason}`}
                    </li>
                  ))}
              </ul>
              {selected.events.nextCursor && (
                <button
                  onClick={() =>
                    void run(async () => {
                      const p = await api<Page<Event>>(
                        `${base}/expenses/${selected.id}/history?cursor=${selected.events.nextCursor}`,
                      );
                      setSelected({
                        ...selected,
                        events: {
                          items: [...selected.events.items, ...p.items],
                          nextCursor: p.nextCursor,
                        },
                      });
                    })
                  }
                >
                  변경 이력 더 보기
                </button>
              )}
            </section>
          )}
          {preview && (
            <section className="evidence-preview">
              <h4>{preview.file.filename}</h4>
              {preview.file.mime.startsWith('image/') && (
                <img src={preview.url} alt="선택한 지출 증빙" />
              )}
              <a href={preview.url} download={preview.file.filename}>
                원본 다운로드
              </a>
              <button className="secondary" onClick={() => setPreview(null)}>
                미리보기 닫기
              </button>
            </section>
          )}
        </>
      )}
      {section === 'settings' && (
        <>
          <BudgetControlSettings base={base} />
          <p>
            재정 설정 권한만으로 지출 상세를 열람하거나 승인·지급할 수 없습니다. 계정·권한 메뉴에서
            별도의 재정 역할을 만들어 담당자에게 부여하세요.
          </p>
          <OperationForm
            title="계정과목 추가"
            fields={[
              { name: 'code', label: '코드 (영문 대문자·숫자)' },
              { name: 'name', label: '이름' },
              {
                name: 'kind',
                label: '유형',
                options: [
                  { value: 'ASSET', label: '자산' },
                  { value: 'LIABILITY', label: '부채' },
                  { value: 'NET_ASSETS', label: '순자산' },
                  { value: 'REVENUE', label: '수익' },
                  { value: 'EXPENSE', label: '비용' },
                ],
              },
            ]}
            submit={(d) => mutate('/accounts', d)}
          />
          <ul>
            {catalog.accounts.map((a) => (
              <li key={a.id}>
                {a.code} · {a.name} · {a.kind}
              </li>
            ))}
          </ul>
          <OperationForm
            title="기금 추가"
            fields={[{ name: 'name', label: '기금명' }]}
            submit={(d) => mutate('/funds', d)}
          />
          <ul>
            {catalog.funds.map((f) => (
              <li key={f.id}>{f.name}</li>
            ))}
          </ul>
          <OperationForm
            title="회계기간 생성"
            fields={[
              { name: 'name', label: '기간 이름' },
              { name: 'startsOn', label: '시작일', type: 'date' },
              { name: 'endsOn', label: '종료일', type: 'date' },
            ]}
            submit={(d) => mutate('/periods', d)}
          />
        </>
      )}
      {(section === 'settings' || section === 'ledger') && (
        <>
          <h3>회계기간</h3>
          <ul>
            {catalog.periods.map((p) => (
              <li key={p.id}>
                {p.name} · {p.startsOn.slice(0, 10)} ~ {p.endsOn.slice(0, 10)} ·{' '}
                {p.closedAt ? '마감' : '열림'}
                {can('finance.close') && !p.closedAt && (
                  <details>
                    <summary>기간 마감</summary>
                    <p>
                      마감하면 해당 기간으로 지급·정정 전표를 게시할 수 없으며 다시 열 수 없습니다.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() => void run(() => mutate(`/periods/${p.id}/close`, {}))}
                    >
                      이 기간 마감 확정
                    </button>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {section === 'ledger' && (
        <>
          <h3>게시 원장</h3>
          {journals.items.map((j) => (
            <article className="submission" key={j.id}>
              <h4>
                {j.postedOn.slice(0, 10)} · {j.description}
              </h4>
              <p>
                전표 {j.id}
                {j.reversalOf && ` · 원전표 ${j.reversalOf}`}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>계정</th>
                    <th>기금</th>
                    <th>차변</th>
                    <th>대변</th>
                  </tr>
                </thead>
                <tbody>
                  {j.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {catalog.accounts.find((a) => a.id === l.accountId)?.name ?? l.accountId}
                      </td>
                      <td>{catalog.funds.find((f) => f.id === l.fundId)?.name ?? l.fundId}</td>
                      <td>{won(l.debit)}</td>
                      <td>{won(l.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {can('finance.reverse') && !j.reversalOf && (
                <details>
                  <summary>장부 정정 (역분개)</summary>
                  <p>실제 송금은 취소되지 않습니다. 원전표는 유지됩니다.</p>
                  <OperationForm
                    title="역분개 게시"
                    fields={[
                      { name: 'postedOn', label: '정정일 (열린 기간)', type: 'date' },
                      { name: 'reason', label: '정정 사유' },
                    ]}
                    submit={(d) => mutate(`/journals/${j.id}/reverse`, d)}
                  />
                </details>
              )}
            </article>
          ))}
          <button disabled={!journalCursor} onClick={() => setJournalCursor('')}>
            처음
          </button>
          <button
            disabled={!journals.nextCursor}
            onClick={() => setJournalCursor(journals.nextCursor ?? '')}
          >
            다음
          </button>
        </>
      )}
    </section>
  );
}
