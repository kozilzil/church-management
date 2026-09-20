import { BudgetApprovalList } from './BudgetApprovalList';
import { useEffect, useState, type FormEvent } from 'react';
import type { AnnualBudget, BudgetRow, BudgetHistory } from '@church/contracts';
import { api } from './api';
const won = (value: string | null) =>
  value === null ? '미편성' : BigInt(value).toLocaleString('ko-KR') + '원';
const status: Record<BudgetRow['status'], string> = {
  UNBUDGETED: '미편성',
  ZERO_BUDGET: '0원 예산',
  WITHIN: '예산 이내',
  EXCEEDED: '예산 초과',
};
type Catalog = {
  timezone: string;
  accounts: { id: string; code: string; name: string }[];
  funds: { id: string; name: string }[];
};
function BudgetEditor({
  report,
  catalog,
  row,
  save,
  cancel,
  busy,
}: {
  report: AnnualBudget;
  catalog: Catalog;
  row: BudgetRow | null;
  save: (body: object) => Promise<void>;
  cancel: () => void;
  busy: boolean;
}) {
  const firstAccount = row?.accountId ?? catalog.accounts[0]?.id ?? '',
    firstFund = row?.fundId ?? report.fundId ?? catalog.funds[0]?.id ?? '';
  const [accountId, setAccount] = useState(firstAccount),
    [fundId, setFund] = useState(firstFund);
  const find = (a: string, f: string) =>
    report.items.find((x) => x.accountId === a && x.fundId === f);
  const [amount, setAmount] = useState(find(firstAccount, firstFund)?.budget ?? ''),
    [reason, setReason] = useState('');
  const existing = find(accountId, fundId);
  function choose(a: string, f: string) {
    setAccount(a);
    setFund(f);
    setAmount(find(a, f)?.budget ?? '');
    setReason('');
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await save({
      year: report.year,
      accountId,
      fundId,
      version: existing?.version ?? 0,
      amount,
      reason,
    });
  }
  return (
    <form className="form" aria-label="예산 편성" onSubmit={(e) => void submit(e)}>
      <h4>{report.year}년 예산 편성·변경</h4>
      <p>
        승인을 요청하면 다른 예산 승인 담당자의 승인 후 연간 편성액에 반영됩니다. 기존 기록은
        보존됩니다.
      </p>
      <div className="fields">
        <label>
          지출 계정
          <select
            required
            disabled={busy || !!row}
            value={accountId}
            onChange={(e) => choose(e.target.value, fundId)}
          >
            {catalog.accounts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          편성 기금
          <select
            required
            disabled={busy || !!row}
            value={fundId}
            onChange={(e) => choose(accountId, e.target.value)}
          >
            {catalog.funds
              .filter((x) => !report.fundId || x.id === report.fundId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          연간 예산액 (원)
          <input
            required
            inputMode="numeric"
            pattern="(0|[1-9][0-9]{0,14})"
            maxLength={15}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          편성·변경 사유
          <textarea
            required
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      <p>
        현재 편성액: {won(existing?.budget ?? null)} · 변경 이력 {existing?.version ?? 0}회
      </p>
      <div className="actions">
        <button
          disabled={busy || !accountId || !fundId || !reason.trim() || amount === existing?.budget}
        >
          예산 승인 요청
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={cancel}>
          편성 취소
        </button>
      </div>
    </form>
  );
}
export function BudgetPanel({
  base,
  permissions,
  userId = '',
}: {
  base: string;
  permissions: string[];
  userId?: string;
}) {
  const [refresh, setRefresh] = useState(0);
  const [catalog, setCatalog] = useState<Catalog>({
    timezone: 'Asia/Seoul',
    accounts: [],
    funds: [],
  });
  const [year, setYear] = useState(''),
    [fundId, setFund] = useState(''),
    [report, setReport] = useState<AnnualBudget | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [editor, setEditor] = useState<{ row: BudgetRow | null } | null>(null);
  const [history, setHistory] = useState<{
    row: BudgetRow;
    year: number;
    data: BudgetHistory;
  } | null>(null);
  const canWrite = permissions.includes('budget.write');
  useEffect(() => {
    let active = true;
    api<Catalog>(`${base}/budgets/definitions`)
      .then((d) => {
        if (active) {
          setCatalog(d);
          setYear(
            new Intl.DateTimeFormat('en-CA', { timeZone: d.timezone, year: 'numeric' }).format(
              new Date(),
            ),
          );
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [base]);
  async function load(y: number, f: string | null) {
    return api<AnnualBudget>(
      `${base}/budgets?${new URLSearchParams({ year: String(y), ...(f ? { fundId: f } : {}) })}`,
    );
  }
  async function query(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    setEditor(null);
    setHistory(null);
    try {
      setReport(await load(Number(year), fundId));
      setRefresh((v) => v + 1);
    } catch (e) {
      setReport(null);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(body: object) {
    if (!report) return;
    setBusy(true);
    setError('');
    setMessage('');
    let saved = false;
    try {
      await api(`${base}/budgets/revisions`, body);
      saved = true;
      setEditor(null);
      setHistory(null);
      setReport(await load(report.year, report.fundId));
      setRefresh((v) => v + 1);
      setMessage('예산 승인을 요청했습니다. 현재 편성액은 승인 후 변경됩니다.');
    } catch (e) {
      if (saved) {
        setReport(null);
        setError('승인 요청은 저장되었습니다. 조회를 다시 실행하세요. ' + String(e));
      } else setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function openHistory(row: BudgetRow, beforeVersion?: number) {
    if (!report) return;
    setBusy(true);
    setError('');
    if (!beforeVersion) setHistory(null);
    try {
      const data = await api<BudgetHistory>(
        `${base}/budgets/history?${new URLSearchParams({ year: String(report.year), accountId: row.accountId, fundId: row.fundId, ...(beforeVersion ? { beforeVersion: String(beforeVersion) } : {}) })}`,
      );
      setHistory((previous) => ({
        row,
        year: report.year,
        data: {
          items: beforeVersion && previous ? [...previous.data.items, ...data.items] : data.items,
          nextBeforeVersion: data.nextBeforeVersion,
        },
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="financial-report budget-panel">
      <h3>연간 예산·집행률</h3>
      <p>
        1월 1일~12월 31일의 연간 예산과 게시된 순지출을 비교합니다. 미지급 요청·결재 중 금액은
        집행액에 포함하지 않습니다.
      </p>
      <form className="form" onSubmit={(e) => void query(e)}>
        <div className="fields">
          <label>
            예산 연도
            <input
              type="number"
              required
              min="1900"
              max="9999"
              step="1"
              value={year}
              disabled={busy}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label>
            조회 기금
            <select value={fundId} disabled={busy} onChange={(e) => setFund(e.target.value)}>
              <option value="">전체 기금</option>
              {catalog.funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button disabled={busy || !year}>예산 조회</button>
      </form>
      {busy && <p role="status">처리 중…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <div className="report-heading">
            <div>
              <h3>
                {report.year}년 ·{' '}
                {report.fundId
                  ? catalog.funds.find((f) => f.id === report.fundId)?.name
                  : '전체 기금'}
              </h3>
              <p>조회 시각 {new Date(report.generatedAt).toLocaleString('ko-KR')}</p>
            </div>
            {canWrite && (
              <button
                disabled={busy || !catalog.accounts.length || !catalog.funds.length}
                onClick={() => setEditor({ row: null })}
              >
                예산 항목 편성
              </button>
            )}
          </div>
          {(String(report.year) !== year || (report.fundId ?? '') !== fundId) && (
            <p role="status">
              조회 조건이 변경되었습니다. 다시 조회하기 전까지 표시된 연도·기금의 예산을 편성합니다.
            </p>
          )}
          <div className="report-totals">
            {[
              ['연간 예산', won(report.totals.budget)],
              ['게시 순지출', won(report.totals.actual)],
              ['잔여 예산', won(report.totals.remaining)],
              [
                '집행률',
                report.totals.executionRate === null
                  ? '계산 불가 (예산 0원)'
                  : report.totals.executionRate + '%',
              ],
            ].map(([label, value]) => (
              <div className="card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p>
            예약 포함 예산 초과 {report.overBudgetCount}건 · 미편성 항목 {report.unbudgetedCount}건.
            전체 잔여액이 있어도 특정 계정·기금에서 예산을 초과할 수 있습니다.
          </p>
          <p>
            가용 예산 = 잔여 예산 − 결재 중·승인 후 미지급 예약액. 잔여 예산 = 예산 − 순지출.
            역분개는 처리 연도에 차감되어 집행액·집행률이 음수가 될 수 있습니다. 집행률은 소수 둘째
            자리까지 버림하며 0원·미편성 예산은 계산하지 않습니다.
          </p>
          {editor && canWrite && (
            <BudgetEditor
              key={`${report.year}:${report.fundId}:${editor.row?.accountId ?? 'new'}:${editor.row?.fundId ?? ''}`}
              report={report}
              catalog={catalog}
              row={editor.row}
              save={save}
              cancel={() => setEditor(null)}
              busy={busy}
            />
          )}
          <div className="report-table" tabIndex={0} aria-label="예산 집행 내역 스크롤">
            <table>
              <caption>계정·기금별 예산과 집행</caption>
              <thead>
                <tr>
                  {[
                    '계정',
                    '기금',
                    '예산',
                    '순지출',
                    '잔여액',
                    '미지급 예약',
                    '가용 예산',
                    '집행률',
                    '상태',
                    '작업',
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.items.map((row) => (
                  <tr key={row.accountId + row.fundId}>
                    <th>
                      {row.code} {row.name}
                    </th>
                    <td>{row.fundName}</td>
                    <td>{won(row.budget)}</td>
                    <td>{won(row.actual)}</td>
                    <td>{won(row.remaining)}</td>
                    <td>{won(row.committed)}</td>
                    <td>
                      <span
                        className={
                          row.available !== null && BigInt(row.available) < 0n
                            ? 'budget-warning'
                            : ''
                        }
                      >
                        {won(row.available)}
                      </span>
                    </td>
                    <td>{row.executionRate === null ? '—' : row.executionRate + '%'}</td>
                    <td>
                      <span
                        className={
                          ['EXCEEDED', 'UNBUDGETED'].includes(row.status) ? 'budget-warning' : ''
                        }
                      >
                        {status[row.status]}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        {canWrite && (
                          <button
                            disabled={busy}
                            onClick={() => setEditor({ row })}
                            aria-label={`${row.name} ${row.fundName} 예산 변경`}
                          >
                            {row.version ? '변경' : '편성'}
                          </button>
                        )}
                        <button
                          className="secondary"
                          disabled={busy || !row.version}
                          onClick={() => void openHistory(row)}
                          aria-label={`${row.name} ${row.fundName} 변경 이력`}
                        >
                          이력
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.items.length && <p>편성된 예산과 게시된 순지출이 없습니다.</p>}
          {canWrite && (!catalog.accounts.length || !catalog.funds.length) && (
            <p>재정 설정 담당자가 지출 계정과 기금을 먼저 등록해야 합니다.</p>
          )}
          <BudgetApprovalList
            key={`${report.year}:${report.fundId}:${refresh}`}
            base={base}
            year={report.year}
            fundId={report.fundId}
            permissions={permissions}
            userId={userId}
            refresh={refresh}
            onBusy={setBusy}
            disabled={busy}
            onApplied={async () => {
              setReport(await load(report.year, report.fundId));
              setHistory(null);
              setEditor(null);
            }}
            names={(r) =>
              `${catalog.accounts.find((x) => x.id === r.accountId)?.name ?? r.accountId} · ${catalog.funds.find((x) => x.id === r.fundId)?.name ?? r.fundId}`
            }
          />
          {history && (
            <section aria-label="예산 변경 이력">
              <h4>
                {history.year}년 {history.row.name} · {history.row.fundName} 변경 이력
              </h4>
              <p>금액은 각 변경 시점의 연간 편성액입니다.</p>
              {history.data.items.map((h) => (
                <article key={h.id} className="budget-history">
                  <strong>
                    {h.version}차 · {won(h.amount)}
                  </strong>
                  <p>{h.reason}</p>
                  <p>
                    {new Date(h.createdAt).toLocaleString('ko-KR')} · 변경자 {h.createdByName}
                  </p>
                </article>
              ))}
              {history.data.nextBeforeVersion && (
                <button
                  disabled={busy}
                  onClick={() => void openHistory(history.row, history.data.nextBeforeVersion!)}
                >
                  이력 더 보기
                </button>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
