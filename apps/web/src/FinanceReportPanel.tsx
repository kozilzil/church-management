import { useEffect, useState, type FormEvent } from 'react';
import type { FinancialReport, ReportAccountRow, ReportLine, CursorPage } from '@church/contracts';
import { api, evidenceBlob } from './api';
const won = (s: string) => BigInt(s).toLocaleString('ko-KR') + '원';
const kinds: Record<string, string> = {
  ASSET: '자산',
  LIABILITY: '부채',
  EQUITY: '순자산',
  REVENUE: '수입',
  EXPENSE: '지출',
};
const params = (q: object) =>
  new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '')).toString();
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Evidence = { id: string; filename: string; mime: string };
type SourceDetail = {
  givenOn?: string;
  amount: number;
  donor?: { name: string } | null;
  title?: string;
  purpose?: string;
  payee?: string;
  attachments?: Evidence[];
  payment?: { paidOn: string; reference: string } | null;
};
function SourceView({ base, source }: { base: string; source: NonNullable<ReportLine['source']> }) {
  const [detail, setDetail] = useState<SourceDetail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);
  useEffect(() => {
    let active = true;
    api<SourceDetail>(
      `${base}/${source.kind === 'offering' ? 'offerings' : 'expenses'}/${source.id}`,
    )
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [base, source.id, source.kind]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  async function file(f: Evidence) {
    setBusy(true);
    setError('');
    try {
      const blob = await evidenceBlob(`${base}/expenses/${source.id}/attachments/${f.id}`);
      if (['image/jpeg', 'image/png'].includes(f.mime))
        setPreview({ url: URL.createObjectURL(blob), filename: f.filename });
      else download(blob, f.filename);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card report-source" aria-label="원거래 상세">
      <h4>{source.kind === 'offering' ? '헌금 원거래' : '지출 원거래'}</h4>
      <p>현재 원거래 정보입니다. 보고서의 역분개 여부와 함께 확인하세요.</p>
      {error && <p role="alert">{error}</p>}
      {!detail && !error && <p role="status">원거래 조회 중…</p>}
      {detail && (
        <>
          <p>
            {source.kind === 'offering'
              ? `${detail.donor?.name ?? '무기명'} · ${detail.givenOn?.slice(0, 10)}`
              : `${detail.title} · ${detail.payee}`}
          </p>
          <p>{won(String(detail.amount))}</p>
          {detail.purpose && <p>{detail.purpose}</p>}
          {detail.payment && (
            <p>
              지급일 {detail.payment.paidOn.slice(0, 10)} · 지급 참조 {detail.payment.reference}
            </p>
          )}
          {detail.attachments?.length ? (
            <div className="actions">
              {detail.attachments.map((f) => (
                <button key={f.id} disabled={busy} onClick={() => void file(f)}>
                  증빙: {f.filename}
                </button>
              ))}
            </div>
          ) : (
            source.kind === 'expense' && <p>첨부 증빙 없음</p>
          )}
        </>
      )}
      {preview && (
        <figure>
          <img src={preview.url} alt={preview.filename} />
          <figcaption>{preview.filename}</figcaption>
          <button onClick={() => setPreview(null)}>증빙 닫기</button>
        </figure>
      )}
    </article>
  );
}
export function FinanceReportPanel({ base, permissions }: { base: string; permissions: string[] }) {
  const [funds, setFunds] = useState<{ id: string; name: string }[]>([]),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [fundId, setFundId] = useState('');
  const [report, setReport] = useState<FinancialReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [account, setAccount] = useState<ReportAccountRow | null>(null),
    [lines, setLines] = useState<CursorPage<ReportLine>>({ items: [], nextCursor: null });
  const [source, setSource] = useState<ReportLine['source']>(null);
  const canDrill = permissions.includes('finance.readall'),
    canExport = permissions.includes('finance.export');
  useEffect(() => {
    let active = true;
    api<{ funds: { id: string; name: string }[]; timezone: string }>(`${base}/reports/definitions`)
      .then((d) => {
        if (!active) return;
        setFunds(d.funds);
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: d.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        setFrom(today.slice(0, 7) + '-01');
        setTo(today);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [base]);
  async function query(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSource(null);
    setAccount(null);
    try {
      setReport(await api<FinancialReport>(`${base}/reports?${params({ from, to, fundId })}`));
    } catch (e) {
      setError(String(e));
      setReport(null);
    } finally {
      setBusy(false);
    }
  }
  async function drill(row: ReportAccountRow, cursor?: string) {
    if (!report) return;
    setBusy(true);
    setError('');
    setSource(null);
    if (!cursor) {
      setAccount(null);
      setLines({ items: [], nextCursor: null });
    }
    try {
      const page = await api<CursorPage<ReportLine>>(
        `${base}/reports/lines?${params({ ...report.selection, accountId: row.accountId, fundId: row.fundId, cursor })}`,
      );
      setLines((p) => ({
        items: cursor ? [...p.items, ...page.items] : page.items,
        nextCursor: page.nextCursor,
      }));
      setAccount(row);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    if (!report) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ csv: string; filename: string }>(
        `${base}/reports/export`,
        report.selection,
      );
      download(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }), r.filename);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="financial-report">
      <h3>월별 재정보고서</h3>
      <p>
        게시된 원장을 기간·기금별로 집계합니다. 역분개는 처리일에 반영하며, 조회 기간은 최대
        366일입니다.
      </p>
      <form className="form" onSubmit={query}>
        <div className="fields">
          <label>
            시작일
            <input
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            기금
            <select value={fundId} onChange={(e) => setFundId(e.target.value)} disabled={busy}>
              <option value="">전체 기금</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button disabled={busy || !from || !to}>보고서 조회</button>
      </form>
      {busy && <p role="status">처리 중…</p>}
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <div className="report-heading">
            <div>
              <h3>
                {report.selection.from} ~ {report.selection.to} · {report.fundName}
              </h3>
              <p>조회 시각 {new Date(report.generatedAt).toLocaleString('ko-KR')}</p>
            </div>
            {canExport && (
              <button disabled={busy} onClick={() => void exportCsv()}>
                조회 결과 CSV 내보내기
              </button>
            )}
          </div>
          {(from !== report.selection.from ||
            to !== report.selection.to ||
            fundId !== (report.selection.fundId ?? '')) && (
            <p role="status">
              조건이 변경되었습니다. 다시 조회하면 적용됩니다. 내보내기는 현재 표시된 결과를
              사용합니다.
            </p>
          )}
          <div className="report-totals">
            {[
              ['수입', report.totals.income],
              ['지출', report.totals.expense],
              ['수지 차액', report.totals.net],
              ['기초 자산 잔액', report.totals.openingAssets],
              ['자산 증감', report.totals.assetMovement],
              ['기말 자산 잔액', report.totals.closingAssets],
            ].map(([label, value]) => (
              <div className="card" key={label}>
                <span>{label}</span>
                <strong>{won(value!)}</strong>
              </div>
            ))}
          </div>
          <p>
            자산 잔액은 현금·통장을 포함한 자산 계정의 장부잔액입니다. 차입·계정 이체 등으로 수지
            차액과 자산 증감이 다를 수 있습니다. 기초 자산 + 자산 증감 = 기말 자산입니다.
          </p>
          <div className="report-table" tabIndex={0} aria-label="월별 집계 스크롤">
            <table>
              <caption>월별 집계 (첫 달·마지막 달은 선택한 날짜만 포함)</caption>
              <thead>
                <tr>
                  {['월', '기초 자산', '수입', '지출', '수지 차액', '자산 증감', '기말 자산'].map(
                    (x) => (
                      <th key={x}>{x}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => (
                  <tr key={m.month}>
                    <th>{m.month}</th>
                    {[
                      m.openingAssets,
                      m.income,
                      m.expense,
                      m.net,
                      m.assetMovement,
                      m.closingAssets,
                    ].map((v, i) => (
                      <td key={i}>{won(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-table" tabIndex={0} aria-label="기금별 집계 스크롤">
            <table>
              <caption>기금별 집계</caption>
              <thead>
                <tr>
                  {['기금', '수입', '지출', '수지 차액', '기초 자산', '자산 증감', '기말 자산'].map(
                    (x) => (
                      <th key={x}>{x}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {report.funds.map((f) => (
                  <tr key={f.id}>
                    <th>{f.name}</th>
                    {[
                      f.income,
                      f.expense,
                      f.net,
                      f.openingAssets,
                      f.assetMovement,
                      f.closingAssets,
                    ].map((v, i) => (
                      <td key={i}>{won(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            계정별 잔액: 자산·지출은 차변 − 대변, 부채·순자산·수입은 대변 − 차변입니다. 기초 잔액은
            조회 시작일 전의 누계입니다.
          </p>
          <div className="report-table" tabIndex={0} aria-label="계정별 집계 스크롤">
            <table>
              <caption>계정·기금별 원장 대조</caption>
              <thead>
                <tr>
                  {[
                    '계정',
                    '유형',
                    '기금',
                    '기초 잔액',
                    '기간 차변',
                    '기간 대변',
                    '기말 잔액',
                    ...(canDrill ? ['상세'] : []),
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.accounts.map((r) => (
                  <tr key={r.accountId + r.fundId}>
                    <th>
                      {r.code} {r.name}
                    </th>
                    <td>{kinds[r.kind] ?? r.kind}</td>
                    <td>{r.fundName}</td>
                    {[r.opening, r.debit, r.credit, r.closing].map((v, i) => (
                      <td key={i}>{won(v)}</td>
                    ))}
                    {canDrill && (
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => void drill(r)}
                          aria-label={`${r.name} ${r.fundName} 거래 보기`}
                        >
                          거래 보기
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.accounts.length && <p>조회 종료일까지 게시된 거래가 없습니다.</p>}
          {account && (
            <section>
              <h4>
                {account.name} · {account.fundName} · 선택 기간 거래
              </h4>
              <p>
                기간 차변 {won(account.debit)} / 대변 {won(account.credit)}
              </p>
              <div className="report-table" tabIndex={0} aria-label="원장 상세 스크롤">
                <table>
                  <thead>
                    <tr>
                      <th>게시일</th>
                      <th>구분</th>
                      <th>차변</th>
                      <th>대변</th>
                      <th>원거래</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.items.map((l) => (
                      <tr key={l.id}>
                        <td>{l.postedOn}</td>
                        <td>{l.reversalOf ? '역분개' : '게시'}</td>
                        <td>{won(l.debit)}</td>
                        <td>{won(l.credit)}</td>
                        <td>
                          {l.source ? (
                            <button disabled={busy} onClick={() => setSource(l.source)}>
                              {l.source.kind === 'offering' ? '헌금' : '지출·증빙'} 보기
                            </button>
                          ) : (
                            '연결 없음 또는 열람 권한 없음'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!lines.items.length && (
                <p>선택 기간의 거래가 없습니다. 기초 잔액은 이전 기간 거래입니다.</p>
              )}
              {lines.nextCursor && (
                <button disabled={busy} onClick={() => void drill(account, lines.nextCursor!)}>
                  거래 더 보기
                </button>
              )}
              {source && <SourceView key={source.kind + source.id} base={base} source={source} />}
            </section>
          )}
        </>
      )}
    </section>
  );
}
