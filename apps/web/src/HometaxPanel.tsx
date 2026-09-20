import { useEffect, useState, type FormEvent } from 'react';
import { hometaxFile, validHometaxIdentity, type HometaxFileData } from '@church/contracts';
import { api } from './api';
import { DonorPicker, type Donor } from './OfferingPanel';
import { OperationForm } from './OperationForm';
type Preview = {
  donor: Donor;
  issuer: null | { version: number; name: string };
  taxYear: number;
  items: { id: string; givenOn: string; amount: number }[];
  totalAmount: number;
  remainingCount: number;
};
type Summary = {
  id: string;
  donorName: string;
  taxYear: number;
  totalAmount: number;
  pendingCount: number;
  issuedCount: number;
  itemCount: number;
};
type Submission = Omit<HometaxFileData, 'items'> & {
  id: string;
  taxYear: number;
  totalAmount: number;
  items: (HometaxFileData['items'][number] & {
    state: string;
    results: { id: string; state: string; reference: string; reason: string; createdAt: string }[];
  })[];
};
const labels: Record<string, string> = {
  PENDING: '결과 미확인',
  ISSUED: '발급 확인',
  NOT_ISSUED: '미발급 확인',
  CANCELLED: '취소 확인',
};
const won = (n: number) => n.toLocaleString('ko-KR') + '원';
export function HometaxPanel({ base, can }: { base: string; can: (p: string) => boolean }) {
  const [donor, setDonor] = useState<Donor | null>(null),
    [year, setYear] = useState(String(new Date().getFullYear())),
    [preview, setPreview] = useState<Preview | null>(null),
    [rows, setRows] = useState<Summary[]>([]),
    [next, setNext] = useState<string | null>(null),
    [detail, setDetail] = useState<Submission | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const path = base + '/hometax-submissions';
  useEffect(() => {
    let active = true;
    api<{ items: Summary[]; nextCursor: string | null }>(path)
      .then((p) => {
        if (active) {
          setRows(p.items);
          setNext(p.nextCursor);
        }
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, [path, revision]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function show(id: string) {
    setDetail(await api<Submission>(path + '/' + id));
  }
  async function check() {
    await run(async () => {
      if (!donor) return;
      setPreview(null);
      setPreview(
        await api<Preview>(`${base}/receipts/preview?donorId=${donor.id}&taxYear=${year}`),
      );
      setRequestId(crypto.randomUUID());
    });
  }
  async function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!preview?.issuer || preview.donor.id !== donor?.id || String(preview.taxYear) !== year)
      return;
    await run(async () => {
      const r = await api<{ id: string }>(path, {
        requestId,
        donorId: preview.donor.id,
        taxYear: preview.taxYear,
        offeringIds: preview.items.map((i) => i.id),
        donorVersion: preview.donor.version,
        issuerVersion: preview.issuer!.version,
        contactName: String(form.get('contactName')),
        contactPhone: String(form.get('contactPhone')),
        identityConfirmed: form.get('authority') === 'on',
        hometaxAuthorityConfirmed: form.get('authority') === 'on',
      });
      setPreview(null);
      await show(r.id);
      setRevision((x) => x + 1);
    });
  }
  async function download(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    const form = e.currentTarget;
    const values = new FormData(form);
    let identity = String(values.get('identity') ?? '');
    if (!validHometaxIdentity(identity)) {
      setError('주민등록번호의 자리수와 생년월일을 확인하세요.');
      return;
    }
    const confirmed = values.get('notSubmitted') === 'on';
    form.reset();
    await run(async () => {
      try {
        const s = await api<Submission>(path + '/' + detail.id + '/download', {
          notSubmittedConfirmed: confirmed,
        });
        const file = hometaxFile(s, identity);
        const url = URL.createObjectURL(
          new Blob([file.bytes], { type: 'application/octet-stream' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = file.filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setError('파일을 생성했습니다. 홈택스 업로드·검증·제출 후 각 항목의 결과를 등록하세요.');
      } finally {
        identity = '';
      }
    });
  }
  return (
    <>
      <h3>홈택스 전자기부금영수증</h3>
      <p>
        제출 파일을 내려받아 홈택스에서 업로드·검증·제출한 뒤 결과를 등록합니다. 자동 전송·조회는
        수행하지 않습니다.
      </p>
      <ol>
        <li>교회 명의로 홈택스 발급권한을 준비합니다.</li>
        <li>아래에서 대상 확인 → 제출 준비 → 파일 다운로드를 진행합니다.</li>
        <li>
          <a href="https://www.hometax.go.kr/" target="_blank" rel="noreferrer">
            홈택스 열기
          </a>{' '}
          → 전자기부금영수증 일괄발급에서 파일 업로드·검증 후 제출합니다.
        </li>
        <li>
          제출내역과 발급 목록을 대조하고, 각 항목의 결과를 등록합니다. 영수증 출력은 홈택스에서
          진행합니다.
        </li>
      </ol>
      <p role="status">{error}</p>
      {can('receipt.export') && (
        <section>
          <h4>발급 대상 확인</h4>
          <DonorPicker
            base={base}
            receipt
            selected={donor}
            onSelect={(d) => {
              setDonor(d);
              setPreview(null);
              setRequestId(crypto.randomUUID());
            }}
          />
          <label>
            귀속연도
            <input
              type="number"
              min="1900"
              max="9999"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <button disabled={busy || !donor || !/^\d{4}$/.test(year)} onClick={() => void check()}>
            홈택스 대상 확인
          </button>
          {preview && preview.donor.id === donor?.id && String(preview.taxYear) === year && (
            <>
              <p>
                {preview.donor.name} · {preview.taxYear}년 · {preview.items.length}건 ·{' '}
                {won(preview.totalAmount)}
              </p>
              <p>
                기존 영수증과 제출 준비에 포함된 헌금은 제외됩니다. 준비 후에는 중복 발급과 역분개가
                제한됩니다.
              </p>
              {preview.remainingCount > 0 && (
                <p>추가 대상 {preview.remainingCount}건은 별도 제출로 준비하세요.</p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>헌금일</th>
                    <th>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.givenOn}</td>
                      <td>{won(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!preview.issuer ? (
                <p>헌금·발급 설정에서 발급기관 정보를 먼저 등록하세요.</p>
              ) : (
                preview.items.length > 0 && (
                  <form className="form" onSubmit={(e) => void prepare(e)}>
                    <label>
                      제출 담당자 성명
                      <input name="contactName" required maxLength={30} />
                    </label>
                    <label>
                      제출 담당자 연락처
                      <input name="contactPhone" required pattern="[0-9\-]{9,14}" maxLength={14} />
                    </label>
                    <label>
                      <input type="checkbox" name="authority" required />
                      실제 기부자·금액과 교회의 홈택스 발급권한, 종교단체 코드 405 적용을
                      확인했습니다.
                    </label>
                    <button disabled={busy}>홈택스 제출 준비</button>
                  </form>
                )
              )}
            </>
          )}
        </section>
      )}
      <section>
        <h4>제출 관리</h4>
        <table>
          <thead>
            <tr>
              <th>기부자</th>
              <th>귀속연도</th>
              <th>총액</th>
              <th>결과 미확인</th>
              <th>발급 확인</th>
              <th>상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.donorName}</td>
                <td>{r.taxYear}</td>
                <td>{won(r.totalAmount)}</td>
                <td>
                  {r.pendingCount}/{r.itemCount}
                </td>
                <td>{r.issuedCount}</td>
                <td>
                  <button disabled={busy} onClick={() => void run(() => show(r.id))}>
                    제출 내역 보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {next && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const p = await api<{ items: Summary[]; nextCursor: string | null }>(
                  path + '?cursor=' + next,
                );
                setRows([...rows, ...p.items]);
                setNext(p.nextCursor);
              })
            }
          >
            제출 내역 더 보기
          </button>
        )}
      </section>
      {detail && (
        <section key={detail.id}>
          <h4>
            {detail.donorName} · {detail.taxYear}년 제출 내역
          </h4>
          <p>
            준비일 {detail.preparedOn} · {detail.items.length}건 · {won(detail.totalAmount)} · 기관{' '}
            {detail.issuerName}
          </p>
          <p>관리 식별자: {detail.id}</p>
          {can('receipt.export') && detail.items.every((i) => i.state === 'PENDING') && (
            <form className="form" onSubmit={(e) => void download(e)} autoComplete="off">
              <h4>홈택스 파일 다운로드</h4>
              <p>
                주민등록번호는 서버로 전송하지 않습니다. 내려받은 제출 파일에는 전체 번호가
                포함되므로 안전하게 보관하고 업무 후 폐기하세요.
              </p>
              <label>
                제출용 기부자 주민등록번호
                <input name="identity" type="password" autoComplete="off" required maxLength={14} />
              </label>
              <label>
                <input name="notSubmitted" type="checkbox" required />이 기부자의 번호이며, 아직
                제출하지 않았거나 홈택스의 기존 업로드를 삭제한 것을 확인했습니다.
              </label>
              <button disabled={busy}>홈택스 제출 파일 다운로드</button>
              <p>
                같은 파일을 다시 제출하면 중복 발급될 수 있습니다. 결과가 불명확하면 먼저 홈택스에서
                확인하세요.
              </p>
            </form>
          )}
          <p>
            아래 상태는 담당자가 홈택스와 대조한 수동 기록입니다. 결과 미확인은 발급 완료를 뜻하지
            않습니다.
          </p>
          {detail.items.map((i) => (
            <article key={i.id}>
              <h4>
                {i.givenOn} · {won(i.amount)} · {labels[i.state]}
              </h4>
              <p>자료관리번호: {i.id.replaceAll('-', '')}</p>
              <ul>
                {i.results.map((r) => (
                  <li key={r.id}>
                    {labels[r.state]} · {r.reference} · {r.reason} ·{' '}
                    {new Date(r.createdAt).toLocaleString('ko-KR')}
                  </li>
                ))}
              </ul>
              {can('receipt.reconcile') && ['PENDING', 'ISSUED'].includes(i.state) && (
                <OperationForm
                  key={i.id + i.state}
                  title="홈택스 확인 결과 등록"
                  fields={[
                    {
                      name: 'state',
                      label: '확인 결과',
                      options: (i.state === 'PENDING'
                        ? ['ISSUED', 'NOT_ISSUED']
                        : ['CANCELLED']
                      ).map((s) => ({ value: s, label: labels[s]! })),
                    },
                    { name: 'reference', label: '홈택스 확인 참조 (접수번호·발급내역 식별정보)' },
                    { name: 'reason', label: '확인 내용·사유 (주민번호 입력 금지)' },
                    {
                      name: 'checked',
                      label: '홈택스에서 확인',
                      options: [
                        {
                          value: 'yes',
                          label: '해당 건의 발급·미발급·취소 상태를 직접 확인했습니다',
                        },
                      ],
                    },
                  ]}
                  submit={async (d) => {
                    await api(path + '/' + detail.id + '/items/' + i.id + '/results', {
                      state: d.state,
                      reference: d.reference,
                      reason: d.reason,
                      checkedInHometax: d.checked === 'yes',
                    });
                    await show(detail.id);
                    setRevision((x) => x + 1);
                  }}
                />
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
