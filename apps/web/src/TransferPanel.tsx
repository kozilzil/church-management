import { useState } from 'react';
import { api } from './api';
type Preview = {
  batchId: string | null;
  rows: { row: number; memberNumber: string; name: string; status: string; registeredOn: string }[];
  errors: { row: number; fields: string[] }[];
  candidates: { row: number; memberIds: string[] }[];
};
export function TransferPanel({ root, permissions }: { root: string; permissions: string[] }) {
  const [csv, setCsv] = useState(''),
    [mapping, setMapping] = useState<Record<string, string>>({
      memberNumber: 'memberNumber',
      name: 'name',
      registeredOn: 'registeredOn',
      status: 'status',
    }),
    [preview, setPreview] = useState<Preview | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false),
    [q, setQ] = useState('');
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>교적 가져오기·내보내기</h2>
      {permissions.includes('membership.import') && (
        <>
          <h3>CSV 가져오기</h3>
          <p>
            UTF-8 CSV, 최대 500행·500KB. 오류를 먼저 확인한 뒤 등록합니다. 동일 이름은 자동 병합하지
            않습니다.
          </p>
          <input
            aria-label="CSV 파일"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 500000) {
                  setMessage('500KB 이하 파일을 선택하세요.');
                  return;
                }
                void f.text().then((s) => {
                  setCsv(s);
                  setPreview(null);
                  setAck(false);
                });
              }
            }}
          />
          <label>
            CSV 내용
            <textarea
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <div className="fields">
            {['memberNumber', 'name', 'registeredOn', 'status', 'phone', 'address'].map((k) => (
              <label key={k}>
                {k}에 해당하는 CSV 머리글
                <input
                  value={mapping[k] ?? ''}
                  onChange={(e) => {
                    setMapping({ ...mapping, [k]: e.target.value });
                    setPreview(null);
                  }}
                />
              </label>
            ))}
          </div>
          <button
            disabled={busy || !csv}
            onClick={() =>
              void run(async () => {
                setAck(false);
                setPreview(
                  await api<Preview>(`${root}/transfers/imports/preview`, {
                    csv,
                    mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)),
                  }),
                );
              })
            }
          >
            검증·미리보기
          </button>
          {preview && (
            <>
              <p>
                {preview.rows.length}행 / 오류 {preview.errors.length}행 / 중복 후보{' '}
                {preview.candidates.length}행
              </p>
              {preview.errors.map((e) => (
                <p key={e.row} className="error">
                  {e.row}행: {e.fields.join(', ')}
                </p>
              ))}
              <table>
                <thead>
                  <tr>
                    <th>행</th>
                    <th>번호</th>
                    <th>이름</th>
                    <th>등록일</th>
                    <th>상태</th>
                    <th>중복 후보</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.memberNumber}</td>
                      <td>{r.name}</td>
                      <td>{r.registeredOn}</td>
                      <td>{r.status}</td>
                      <td>{preview.candidates.some((c) => c.row === r.row) ? '확인 필요' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                미리보기와 중복 후보를 확인했습니다.
              </label>
              <button
                disabled={busy || !ack || !preview.batchId || preview.errors.length > 0}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{ count?: number; replayed: boolean }>(
                      `${root}/transfers/imports/${preview.batchId}/apply`,
                      {},
                    );
                    setMessage(
                      result.replayed
                        ? '이미 처리한 작업입니다.'
                        : `${result.count}명을 등록했습니다.`,
                    );
                    setPreview(null);
                  })
                }
              >
                확인한 명부 등록
              </button>
            </>
          )}
        </>
      )}
      {permissions.includes('membership.export') && (
        <>
          <h3>CSV 내보내기</h3>
          <p>현재 담당 범위와 개인정보 권한을 적용합니다. 한 번에 500명까지 가능합니다.</p>
          <label>
            이름 검색
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const job = await api<{ id: string }>(`${root}/transfers/exports`, { q });
                const file = await api<{ csv: string; filename: string; count: number }>(
                  `${root}/transfers/exports/${job.id}/download`,
                  {},
                );
                const url = URL.createObjectURL(
                  new Blob([file.csv], { type: 'text/csv;charset=utf-8' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = file.filename;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage(`${file.count}명을 내보냈습니다.`);
              })
            }
          >
            CSV 다운로드
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
