import { useEffect, useState, type FormEvent } from 'react';
import type { BudgetControlPolicy } from '@church/contracts';
import { api } from './api';
export function BudgetControlSettings({ base }: { base: string }) {
  const [policy, setPolicy] = useState<BudgetControlPolicy | null>(null),
    [mode, setMode] = useState('WARN'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    api<BudgetControlPolicy>(base + '/budgets/control')
      .then((p) => {
        if (active) {
          setPolicy(p);
          setMode(p.mode);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [base]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!policy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const p = await api<BudgetControlPolicy>(base + '/budgets/control', {
        mode,
        version: policy.version,
        reason,
      });
      setPolicy(p);
      setMode(p.mode);
      setReason('');
      setMessage('예산 통제 설정을 저장했습니다.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>지출 예산 통제</h3>
      <p>
        상신·승인·지급 때 승인 예산에서 실제 지출과 결재 중·승인 후 미지급 예약액을 함께 확인합니다.
        미편성도 초과와 동일하게 처리합니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {policy && (
        <form className="form" onSubmit={(e) => void save(e)}>
          <p>
            현재: {policy.mode === 'WARN' ? '경고 후 진행' : '초과 시 차단'} · 연도 없는 기존 미지급
            결재 {policy.legacyPending}건
          </p>
          {policy.legacyPending > 0 && (
            <p>
              기존 건을 지급 완료하거나 취소 후 연도를 지정하여 다시 상신해야 차단 모드로 전환할 수
              있습니다.
            </p>
          )}
          <label>
            예산 초과 처리
            <select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value)}>
              <option value="WARN">경고 후 진행</option>
              <option value="BLOCK">초과 시 차단</option>
            </select>
          </label>
          <label>
            설정 변경 사유
            <textarea
              required
              maxLength={300}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={busy || !reason.trim() || mode === policy.mode}>예산 통제 저장</button>
        </form>
      )}
    </section>
  );
}
