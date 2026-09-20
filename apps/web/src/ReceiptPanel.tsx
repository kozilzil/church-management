import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { OperationForm } from './OperationForm';
import { DonorPicker, type Donor } from './OfferingPanel';
import {
  receiptHtml,
  validPrintIdentity,
  waitForPrintWindow,
  type ReceiptDocument,
} from './receipt-print';
type Summary = {
  id: string;
  number: string;
  donorName: string;
  taxYear: number;
  totalAmount: number;
  issuedOn: string;
  cancelled: boolean;
};
type Preview = {
  donor: Donor;
  issuer: null | { name: string; version: number; electronicRequired: boolean };
  items: { id: string; givenOn: string; amount: number; typeName: string }[];
  totalAmount: number;
  taxYear: number;
  remainingCount: number;
};
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
export function ReceiptPanel({ base, can }: { base: string; can: (p: string) => boolean }) {
  const [donor, setDonor] = useState<Donor | null>(null),
    [year, setYear] = useState(String(new Date().getFullYear())),
    [preview, setPreview] = useState<Preview | null>(null),
    [rows, setRows] = useState<Summary[]>([]),
    [next, setNext] = useState<string | null>(null),
    [detail, setDetail] = useState<ReceiptDocument | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ items: Summary[]; nextCursor: string | null }>(base + '/receipts')
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
  }, [base, revision]);
  useEffect(() => {
    let active = true;
    if (donor && /^\d{4}$/.test(year)) {
      api<Preview>(`${base}/receipts/preview?donorId=${donor.id}&taxYear=${year}`)
        .then((p) => {
          if (active) setPreview(p);
        })
        .catch((e) => active && setError(String(e)));
    }
    return () => {
      active = false;
    };
  }, [base, donor, year, revision]);
  async function show(id: string) {
    setDetail(await api<ReceiptDocument>(base + '/receipts/' + id));
  }
  async function issue() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ id: string }>(base + '/receipts', {
        donorId: preview.donor.id,
        taxYear: preview.taxYear,
        offeringIds: preview.items.map((x) => x.id),
        donorVersion: preview.donor.version,
        issuerVersion: preview.issuer!.version,
        identityConfirmed: ack,
      });
      setPreview(null);
      setAck(false);
      await show(r.id);
      setRevision((x) => x + 1);
    } catch (e) {
      setError(String(e));
      setPreview(null);
      setAck(false);
      setRevision((x) => x + 1);
    } finally {
      setBusy(false);
    }
  }
  async function print(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    const form = e.currentTarget,
      identity = String(new FormData(form).get('printIdentity') ?? '');
    if (!validPrintIdentity(identity)) {
      setError('주민등록번호의 자리수와 생년월일을 확인하세요.');
      return;
    }
    const output = window.open('/receipt-print.html', '_blank');
    if (!output) {
      setError('인쇄 창을 열 수 없습니다. 팝업을 허용하세요.');
      return;
    }
    output.opener = null;
    form.reset();
    setBusy(true);
    setError('');
    try {
      const r = await api<ReceiptDocument>(base + `/receipts/${detail.id}/print`, {});
      await waitForPrintWindow(output);
      output.document.open();
      output.document.write(
        receiptHtml(r, identity, window.location.origin + '/receipt-print.css'),
      );
      output.document.close();
    } catch (e) {
      output.close();
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const ready =
    preview &&
    preview.items.length > 0 &&
    preview.issuer &&
    !preview.issuer.electronicRequired &&
    preview.donor.address;
  return (
    <>
      <p>
        실제 기부자별 확정 헌금에서 영수증을 발급합니다. 익명·미확정·정정된 헌금과 이미 발급한
        항목은 제외됩니다.
      </p>
      <p role="status">{error}</p>
      {can('receipt.issue') && (
        <section>
          <h3>발급 대상 확인</h3>
          <DonorPicker
            base={base}
            receipt
            selected={donor}
            onSelect={(d) => {
              setDonor(d);
              setPreview(null);
              setAck(false);
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
                setAck(false);
              }}
            />
          </label>
          <button
            onClick={() => {
              setPreview(null);
              setAck(false);
              setRevision((x) => x + 1);
            }}
          >
            미리보기 새로고침
          </button>
          {preview && (
            <>
              <p>
                {preview.donor.name} · {preview.taxYear}년 · {preview.items.length}건 ·{' '}
                <strong>{won(preview.totalAmount)}</strong>
              </p>
              <p>
                기부자 주소: {preview.donor.address || '미등록 — 헌금 화면에서 먼저 등록하세요.'}
              </p>
              <p>발급기관: {preview.issuer?.name ?? '미설정'}</p>
              {preview.issuer?.electronicRequired && (
                <p>전자발급 의무 대상입니다. 홈택스에서 발급하세요.</p>
              )}
              {preview.remainingCount > 0 && (
                <p>
                  1회 500건까지 발급합니다. 나머지 {preview.remainingCount}건은 이번 발급 후 별도
                  번호로 발급할 수 있습니다.
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>헌금일</th>
                    <th>종류</th>
                    <th>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((x) => (
                    <tr key={x.id}>
                      <td>{x.givenOn}</td>
                      <td>{x.typeName}</td>
                      <td>{won(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                실제 기부자의 신원·이름·주소와 발급 대상 금액을 확인했습니다.
              </label>
              <button disabled={busy || !ready || !ack} onClick={() => void issue()}>
                영수증 발급번호 생성
              </button>
            </>
          )}
        </section>
      )}
      <h3>영수증 발급대장</h3>
      <button onClick={() => setRevision((x) => x + 1)}>발급대장 새로고침</button>
      <table>
        <thead>
          <tr>
            <th>번호</th>
            <th>기부자</th>
            <th>귀속연도</th>
            <th>금액</th>
            <th>상태</th>
            <th>보기</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.number}</td>
              <td>{r.donorName}</td>
              <td>{r.taxYear}</td>
              <td>{won(r.totalAmount)}</td>
              <td>{r.cancelled ? '취소' : '발급'}</td>
              <td>
                <button onClick={() => void show(r.id).catch((e) => setError(String(e)))}>
                  영수증 보기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {next && (
        <button
          onClick={() =>
            void api<{ items: Summary[]; nextCursor: string | null }>(
              base + '/receipts?cursor=' + next,
            )
              .then((p) => {
                setRows([...rows, ...p.items]);
                setNext(p.nextCursor);
              })
              .catch((e) => setError(String(e)))
          }
        >
          영수증 더 보기
        </button>
      )}
      {detail && (
        <section>
          <h3>{detail.number}</h3>
          <p>
            {detail.donorName} · {detail.taxYear}년 · {won(detail.totalAmount)} · 발급일{' '}
            {detail.issuedOn}
          </p>
          <p>
            {detail.issuerName} · {detail.issuerRegistrationNumber}
          </p>
          {detail.cancellation ? (
            <p>취소됨: {detail.cancellation.reason}</p>
          ) : (
            <>
              {can('receipt.print') && (
                <form className="form" onSubmit={print} key={detail.id}>
                  <h4>인쇄·PDF 저장 / 재출력</h4>
                  <p>
                    재출력은 같은 발급번호를 사용합니다. 주민등록번호는 이 인쇄 창에서만 사용하며
                    서버에 전송하거나 저장하지 않습니다.
                  </p>
                  <label>
                    실제 기부자의 주민등록번호
                    <input
                      name="printIdentity"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      maxLength={14}
                    />
                  </label>
                  <label>
                    <input type="checkbox" required />위 기부자 본인의 식별번호임을 확인했습니다.
                  </label>
                  <button disabled={busy}>인쇄·PDF 저장 창 열기</button>
                  <p>
                    인쇄 후 서명·날인하고 발급명세 원본을 별도로 보관하세요. 홈택스 전자발급은
                    별도입니다.
                  </p>
                </form>
              )}
              {can('receipt.cancel') && (
                <OperationForm
                  title="영수증 취소"
                  fields={[{ name: 'reason', label: '취소 사유' }]}
                  submit={async (d) => {
                    await api(base + `/receipts/${detail.id}/cancel`, d);
                    await show(detail.id);
                    setPreview(null);
                    setAck(false);
                    setRevision((x) => x + 1);
                  }}
                />
              )}
            </>
          )}
          <details>
            <summary>발급 당시 헌금 내역</summary>
            <table>
              <thead>
                <tr>
                  <th>헌금일</th>
                  <th>종류</th>
                  <th>금액</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.offeringId}>
                    <td>{i.givenOn}</td>
                    <td>{i.typeName}</td>
                    <td>{won(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}
    </>
  );
}
