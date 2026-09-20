import { useEffect, useState, type FormEvent } from 'react';
import type { BudgetChanges, BudgetChangeView } from '@church/contracts';
import { api } from './api';
export function BudgetApprovalList({
  base,
  year,
  fundId,
  permissions,
  userId,
  refresh,
  onApplied,
  onBusy,
  disabled = false,
  names,
}: {
  base: string;
  year: number;
  fundId: string | null;
  permissions: string[];
  userId: string;
  refresh: number;
  onApplied: () => Promise<void>;
  onBusy: (value: boolean) => void;
  disabled?: boolean;
  names: (row: BudgetChangeView) => string;
}) {
  const [data, setData] = useState<BudgetChanges | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{ row: BudgetChangeView; action: string } | null>(null),
    [reason, setReason] = useState('');
  const path = `${base}/budgets/changes?${new URLSearchParams({ year: String(year), ...(fundId ? { fundId } : {}) })}`;
  useEffect(() => {
    let active = true;
    api<BudgetChanges>(path)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [path, refresh]);
  async function more() {
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const next = await api<BudgetChanges>(path + '&cursor=' + data!.nextCursor);
      setData({ items: [...data!.items, ...next.items], nextCursor: next.nextCursor });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    onBusy(true);
    setError('');
    setMessage('');
    let done = false;
    try {
      await api(
        `${base}/budgets/changes/${selected.row.id}/${selected.action === 'CANCELLED' ? 'cancel' : 'decision'}`,
        { reason, ...(selected.action === 'CANCELLED' ? {} : { decision: selected.action }) },
      );
      done = true;
      setSelected(null);
      setData(null);
      await onApplied();
      setData(await api<BudgetChanges>(path));
      setMessage('예산 요청을 처리했습니다.');
    } catch (e) {
      setError((done ? '처리는 완료되었습니다. 예산을 다시 조회하세요. ' : '') + String(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section aria-label="예산 승인 요청">
      <h4>예산 편성·변경 승인 요청</h4>
      <p>
        작성자와 다른 예산 승인 담당자가 승인하면 반영됩니다. 항목마다 한 건의 요청을 진행할 수
        있습니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data?.items.length === 0 && <p>이 연도·기금의 승인 요청이 없습니다.</p>}
      {data?.items.map((row) => (
        <article className="budget-history" key={row.id}>
          <strong>
            {names(row)} · {BigInt(row.amount).toLocaleString('ko-KR')}원 ·{' '}
            {row.decision
              ? { APPROVED: '승인', REJECTED: '반려', CANCELLED: '취소' }[row.decision.decision]
              : '승인 대기'}
          </strong>
          <p>{row.reason}</p>
          <p>
            요청자 {row.requester} · {new Date(row.createdAt).toLocaleString('ko-KR')} · 기준 예산{' '}
            {row.baseVersion}차
          </p>
          {row.decision && (
            <p>
              {row.decision.decider} · {row.decision.reason} ·{' '}
              {new Date(row.decision.createdAt).toLocaleString('ko-KR')}
            </p>
          )}
          {!row.decision && (
            <div className="actions">
              {row.requestedBy !== userId &&
                permissions.includes('budget.approve') &&
                ['APPROVED', 'REJECTED'].map((action) => (
                  <button
                    key={action}
                    disabled={busy || disabled}
                    onClick={() => {
                      setSelected({ row, action });
                      setReason('');
                    }}
                  >
                    {action === 'APPROVED' ? '예산 승인' : '예산 반려'}
                  </button>
                ))}
              {row.requestedBy === userId && permissions.includes('budget.write') && (
                <button
                  disabled={busy || disabled}
                  onClick={() => {
                    setSelected({ row, action: 'CANCELLED' });
                    setReason('');
                  }}
                >
                  요청 취소
                </button>
              )}
            </div>
          )}
        </article>
      ))}
      {data?.nextCursor && (
        <button disabled={busy || disabled} onClick={() => void more()}>
          승인 요청 더 보기
        </button>
      )}
      {selected && (
        <form className="form" aria-label="예산 요청 처리" onSubmit={(e) => void decide(e)}>
          <h4>
            {names(selected.row)} ·{' '}
            {{ APPROVED: '승인', REJECTED: '반려', CANCELLED: '취소' }[selected.action]}
          </h4>
          {selected.action === 'APPROVED' ? (
            <p>
              {BigInt(selected.row.amount).toLocaleString('ko-KR')}원으로 변경합니다. 승인 후 기존
              지출 예약액보다 예산이 작아지면 후속 결재·지급이 차단될 수 있습니다.
            </p>
          ) : (
            <p>현재 승인된 예산액은 유지됩니다.</p>
          )}
          <label>
            처리 사유
            <textarea
              required
              maxLength={300}
              disabled={busy || disabled}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={busy || disabled || !reason.trim()}>처리 확정</button>
          <button
            type="button"
            className="secondary"
            disabled={busy || disabled}
            onClick={() => setSelected(null)}
          >
            닫기
          </button>
        </form>
      )}
    </section>
  );
}
