import { HometaxPanel } from './HometaxPanel';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { OperationForm } from './OperationForm';
import { ReceiptPanel } from './ReceiptPanel';
type Page<T> = { items: T[]; nextCursor: string | null };
export type Donor = {
  id: string;
  name: string;
  memberId: string | null;
  version: number;
  address?: string;
};
type OfferingType = { id: string; name: string; receiptEligible: boolean };
type Catalog = {
  accounts: { id: string; name: string; kind: string }[];
  funds: { id: string; name: string }[];
};
type Offering = {
  id: string;
  donorId: string | null;
  donorName: string;
  donor?: Donor;
  typeId: string;
  assetAccountId: string;
  givenOn: string;
  amount: number;
  reference: string;
  source: string;
  state: string;
  version: number;
  createdBy: string;
  editedBy: string;
  reversed?: boolean;
  reversal?: { reason: string };
  receiptClaim?: { receiptId: string | null; hometaxItemId?: string | null };
  events?: { id: string; action: string; reason: string; createdAt: string }[];
};
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const stateName: Record<string, string> = {
  DRAFT: '초안',
  REVIEWED: '검수 완료',
  POSTED: '회계 반영',
  CANCELLED: '취소',
};
export function DonorPicker({
  base,
  receipt = false,
  onSelect,
  selected,
}: {
  base: string;
  receipt?: boolean;
  onSelect: (d: Donor | null) => void;
  selected: Donor | null;
}) {
  const [search, setSearch] = useState(''),
    [rows, setRows] = useState<Donor[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState('');
  async function find(cursor?: string) {
    try {
      const p = await api<Page<Donor>>(
        `${base}/${receipt ? 'receipts/' : ''}donors?search=${encodeURIComponent(search)}${cursor ? '&cursor=' + cursor : ''}`,
      );
      setRows(cursor ? [...rows, ...p.items] : p.items);
      setNext(p.nextCursor);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <fieldset>
      <legend>기부자 선택</legend>
      <div className="fields">
        <label>
          이름 검색
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" onClick={() => void find()}>
          기부자 검색
        </button>
      </div>
      {selected && (
        <p>
          선택: <strong>{selected.name}</strong>{' '}
          <button type="button" onClick={() => onSelect(null)}>
            선택 해제
          </button>
        </p>
      )}
      <ul>
        {rows.map((d) => (
          <li key={d.id}>
            {d.name} {d.memberId ? '(교인 연결)' : '(개인 기부자)'}{' '}
            <button type="button" onClick={() => onSelect(d)}>
              선택
            </button>
          </li>
        ))}
      </ul>
      {next && (
        <button type="button" onClick={() => void find(next)}>
          기부자 더 보기
        </button>
      )}
      <p role="status">{error}</p>
    </fieldset>
  );
}
export function OfferingPanel({
  root,
  permissions,
  userId,
}: {
  root: string;
  permissions: string[];
  userId: string;
}) {
  const base = root + '/finance',
    can = (p: string) => permissions.includes(p),
    [mode, setMode] = useState(
      can('offering.read') ? 'offerings' : can('receipt.read') ? 'receipts' : 'settings',
    );
  return (
    <section>
      <h2>헌금·기부금영수증</h2>
      <nav aria-label="헌금 업무">
        {can('offering.read') && <button onClick={() => setMode('offerings')}>개별 헌금</button>}
        {can('receipt.read') && <button onClick={() => setMode('receipts')}>기부금영수증</button>}
        {can('receipt.read') && <button onClick={() => setMode('hometax')}>홈택스 연동</button>}
        {can('finance.manage') && (
          <button onClick={() => setMode('settings')}>헌금·발급 설정</button>
        )}
      </nav>
      {mode === 'offerings' && <OfferingEntries base={base} can={can} userId={userId} />}
      {mode === 'receipts' && <ReceiptPanel base={base} can={can} />}
      {mode === 'hometax' && <HometaxPanel base={base} can={can} />}
      {mode === 'settings' && <OfferingSettings base={base} />}
    </section>
  );
}
function OfferingEntries({
  base,
  can,
  userId,
}: {
  base: string;
  can: (p: string) => boolean;
  userId: string;
}) {
  const [catalog, setCatalog] = useState<Catalog>({ accounts: [], funds: [] }),
    [types, setTypes] = useState<OfferingType[]>([]),
    [rows, setRows] = useState<Offering[]>([]),
    [next, setNext] = useState<string | null>(null),
    [state, setState] = useState(''),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Offering | null>(null),
    [donor, setDonor] = useState<Donor | null>(null),
    [anonymous, setAnonymous] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [members, setMembers] = useState<{ id: string; name: string; memberNumber: string }[]>([]),
    [member, setMember] = useState<{ id: string; name: string } | null>(null),
    [memberSearch, setMemberSearch] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Catalog>(base + '/offering-definitions'),
      api<{ items: OfferingType[] }>(base + '/offering-types'),
    ])
      .then(([c, t]) => {
        if (active) {
          setCatalog(c);
          setTypes(t.items);
        }
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, [base]);
  useEffect(() => {
    let active = true;
    api<Page<Offering>>(base + '/offerings' + (state ? '?state=' + state : ''))
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
  }, [base, state, revision]);
  async function select(id: string) {
    const r = await api<Offering>(base + '/offerings/' + id);
    setSelected(r);
    setDonor(r.donor ?? null);
    setAnonymous(!r.donorId);
    setDirty(false);
  }
  async function action(path: string, body: object) {
    setBusy(true);
    setError('');
    try {
      await api(base + path, body);
      if (selected) await select(selected.id);
      setRevision((x) => x + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!anonymous && !donor) {
      setError('기부자를 선택하거나 익명 헌금으로 표시하세요.');
      return;
    }
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      const d = {
        ...form,
        amount: Number(form.amount),
        ...(anonymous ? {} : { donorId: donor!.id }),
      };
      if (selected) {
        await api(base + '/offerings/' + selected.id, { ...d, version: selected.version }, 'PATCH');
        await select(selected.id);
      } else {
        const r = await api<{ id: string }>(base + '/offerings', d);
        await select(r.id);
      }
      setRevision((x) => x + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const editable = !selected || ['DRAFT', 'REVIEWED'].includes(selected.state);
  return (
    <>
      <p>헌금을 한 건씩 등록합니다. 입력자와 다른 담당자가 검수한 뒤 회계에 반영합니다.</p>
      <p role="status">{error}</p>
      <label>
        상태{' '}
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">전체</option>
          {Object.entries(stateName).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => setRevision((x) => x + 1)}>목록 새로고침</button>
      {can('offering.write') && (
        <button
          onClick={() => {
            setSelected(null);
            setDonor(null);
            setAnonymous(false);
            setDirty(false);
          }}
        >
          새 개별 헌금
        </button>
      )}
      <table>
        <thead>
          <tr>
            <th>헌금일</th>
            <th>기부자</th>
            <th>금액</th>
            <th>상태</th>
            <th>보기</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.givenOn.slice(0, 10)}</td>
              <td>{r.donorName}</td>
              <td>{won(r.amount)}</td>
              <td>{r.reversed ? '정정됨' : stateName[r.state]}</td>
              <td>
                <button onClick={() => void select(r.id).catch((e) => setError(String(e)))}>
                  헌금 보기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {next && (
        <button
          onClick={() =>
            void api<Page<Offering>>(
              `${base}/offerings?cursor=${next}${state ? '&state=' + state : ''}`,
            )
              .then((p) => {
                setRows([...rows, ...p.items]);
                setNext(p.nextCursor);
              })
              .catch((e) => setError(String(e)))
          }
        >
          헌금 더 보기
        </button>
      )}
      {editable && can('offering.write') && (
        <>
          <h3>{selected ? '개별 헌금 수정' : '새 개별 헌금'}</h3>
          <DonorPicker
            base={base}
            selected={donor}
            onSelect={(d) => {
              setDonor(d);
              setAnonymous(false);
              setDirty(true);
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => {
                setAnonymous(e.target.checked);
                setDirty(true);
              }}
            />
            익명 헌금 (영수증 발급 제외)
          </label>
          <form
            key={selected ? selected.id + ':' + selected.version : 'new:' + revision}
            className="form"
            onSubmit={save}
            onChange={() => setDirty(true)}
          >
            <div className="fields">
              <label>
                헌금일
                <input
                  name="givenOn"
                  type="date"
                  required
                  defaultValue={selected?.givenOn.slice(0, 10)}
                />
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
                  defaultValue={selected?.amount}
                />
              </label>
              <label>
                헌금 종류
                <select name="typeId" required defaultValue={selected?.typeId ?? ''}>
                  <option value="">선택하세요</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                입금 계정
                <select
                  name="assetAccountId"
                  required
                  defaultValue={selected?.assetAccountId ?? ''}
                >
                  <option value="">선택하세요</option>
                  {catalog.accounts
                    .filter((x) => x.kind === 'ASSET')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                수납 방법
                <select name="source" defaultValue={selected?.source ?? 'CASH'}>
                  <option value="CASH">현금</option>
                  <option value="BANK">계좌 입금</option>
                </select>
              </label>
              <label>
                접수 참조 (중복 방지)
                <input
                  name="reference"
                  required
                  maxLength={100}
                  defaultValue={selected?.reference}
                />
              </label>
            </div>
            <button disabled={busy}>헌금 저장</button>
            {selected?.state === 'REVIEWED' && <p>수정하면 다시 검수를 받아야 합니다.</p>}
          </form>
          <details>
            <summary>기부자 등록·수정</summary>
            <p>
              교인은 이름/교적번호로 찾아 연결하세요. 교적에 없는 개인은 연결 없이 등록할 수
              있습니다.
            </p>
            <label>
              교인 검색
              <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
            </label>
            <button
              onClick={() =>
                void api<{ items: typeof members }>(
                  base + '/offering-members?search=' + encodeURIComponent(memberSearch),
                )
                  .then((p) => setMembers(p.items))
                  .catch((e) => setError(String(e)))
              }
            >
              교인 찾기
            </button>
            <ul>
              {members.map((m) => (
                <li key={m.id}>
                  {m.memberNumber} {m.name}
                  <button onClick={() => setMember(m)}>교인 연결</button>
                </li>
              ))}
            </ul>
            {member && (
              <p>
                연결 교인: {member.name}
                <button onClick={() => setMember(null)}>연결 해제</button>
              </p>
            )}
            <OperationForm
              key={member?.id ?? 'external'}
              title="새 기부자"
              fields={[
                { name: 'name', label: '실제 기부자 이름', value: member?.name ?? '' },
                { name: 'address', label: '기부자 주소 (영수증 발급 시 필요)', optional: true },
              ]}
              submit={async (d) => {
                const r = await api<{ id: string }>(base + '/donors', {
                  name: d.name,
                  address: d.address ?? '',
                  ...(member ? { memberId: member.id } : {}),
                });
                setDonor({ id: r.id, name: d.name!, memberId: member?.id ?? null, version: 1 });
                setAnonymous(false);
                setDirty(true);
              }}
            />
            {donor && (
              <OperationForm
                key={donor.id + ':' + donor.version}
                title="선택 기부자 정보 정정"
                fields={[
                  { name: 'name', label: '기부자 이름', value: donor.name },
                  { name: 'address', label: '기부자 주소', value: donor.address ?? '' },
                ]}
                submit={async (d) => {
                  await api(
                    base + '/donors/' + donor.id,
                    { ...d, version: donor.version },
                    'PATCH',
                  );
                  setDonor({ ...donor, name: d.name!, version: donor.version + 1 });
                }}
              />
            )}
          </details>
        </>
      )}
      {selected && (
        <section>
          <h3>저장된 헌금</h3>
          <p>
            {selected.donorName} · {selected.givenOn.slice(0, 10)} · {won(selected.amount)} ·{' '}
            {stateName[selected.state]}
          </p>
          {dirty && <p>수정한 내용을 저장한 뒤 처리하세요.</p>}
          {selected.state === 'DRAFT' && can('offering.review') && (
            <button
              disabled={
                busy || dirty || selected.createdBy === userId || selected.editedBy === userId
              }
              onClick={() =>
                void action(`/offerings/${selected.id}/review`, { version: selected.version })
              }
            >
              검수 완료
            </button>
          )}
          {selected.state === 'REVIEWED' && can('offering.post') && (
            <button
              disabled={busy || dirty}
              onClick={() =>
                void action(`/offerings/${selected.id}/post`, { version: selected.version })
              }
            >
              회계 반영
            </button>
          )}
          {['DRAFT', 'REVIEWED'].includes(selected.state) && can('offering.write') && (
            <OperationForm
              title="미확정 헌금 취소"
              fields={[{ name: 'reason', label: '취소 사유' }]}
              submit={async (d) => {
                await api(base + `/offerings/${selected.id}/cancel`, {
                  ...d,
                  version: selected.version,
                });
                await select(selected.id);
                setRevision((x) => x + 1);
              }}
            />
          )}
          {selected.receiptClaim && (
            <p>
              영수증 발급 또는 홈택스 제출 준비에 포함되어 있습니다. 정정 전에 발급 취소·미발급
              여부를 확인하세요.
            </p>
          )}
          {selected.state === 'POSTED' && !selected.reversal && can('offering.reverse') && (
            <OperationForm
              title="헌금 회계 정정"
              fields={[
                { name: 'postedOn', label: '정정일', type: 'date' },
                { name: 'reason', label: '정정 사유' },
              ]}
              submit={async (d) => {
                await api(base + `/offerings/${selected.id}/reverse`, d);
                await select(selected.id);
                setRevision((x) => x + 1);
              }}
            />
          )}
          {selected.reversal && <p>정정됨: {selected.reversal.reason}</p>}
          <details>
            <summary>최근 변경 이력</summary>
            <ul>
              {selected.events?.map((e) => (
                <li key={e.id}>
                  {e.action} · {e.createdAt} {e.reason}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}
function OfferingSettings({ base }: { base: string }) {
  const [catalog, setCatalog] = useState<Catalog>({ accounts: [], funds: [] }),
    [types, setTypes] = useState<OfferingType[]>([]),
    [issuer, setIssuer] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Catalog>(base + '/settings'),
      api<{ items: OfferingType[] }>(base + '/offering-type-settings'),
      api<Record<string, unknown> | null>(base + '/receipt-issuer'),
    ])
      .then(([c, t, i]) => {
        if (active) {
          setCatalog(c);
          setTypes(t.items);
          setIssuer(i);
        }
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, [base, revision]);
  const opts = (r: { id: string; name: string }[]) =>
    r.map((x) => ({ value: x.id, label: x.name }));
  return (
    <>
      <p role="status">{error}</p>
      <p>계정·기금·회계기간은 지출 결재·재정의 재정 설정에서 먼저 등록하세요.</p>
      <ul>
        {types.map((t) => (
          <li key={t.id}>
            {t.name} · {t.receiptEligible ? '영수증 대상' : '영수증 제외'}
          </li>
        ))}
      </ul>
      <OperationForm
        title="헌금 종류 등록"
        fields={[
          { name: 'name', label: '헌금 종류 이름' },
          {
            name: 'revenueAccountId',
            label: '수익 계정',
            options: opts(catalog.accounts.filter((x) => x.kind === 'REVENUE')),
          },
          { name: 'fundId', label: '기금', options: opts(catalog.funds) },
          {
            name: 'receiptEligible',
            label: '영수증 대상 여부',
            options: [
              { value: 'true', label: '대상' },
              { value: 'false', label: '제외' },
            ],
          },
        ]}
        submit={async (d) => {
          await api(base + '/offering-types', {
            ...d,
            receiptEligible: d.receiptEligible === 'true',
          });
          setRevision((x) => x + 1);
        }}
      />
      <h3>기부금영수증 발급기관</h3>
      <p>
        개인 금전기부·종교단체(코드 41)의 자체 영수증을 발급합니다. 홈택스 전자발급은 별도로
        처리합니다. 적격 단체 여부와 전자발급 의무 여부를 확인해 설정하세요.
      </p>
      <p>
        주민등록번호 전체는 저장하지 않습니다. 인쇄 시에만 입력하며, 완성된 발급명세 원본은 교회가
        별도로 보관해야 합니다.
      </p>
      <OperationForm
        key={String(issuer?.version ?? 0)}
        title="발급기관 설정"
        fields={[
          { name: 'name', label: '단체명' },
          { name: 'registrationNumber', label: '사업자등록번호·고유번호 (000-00-00000)' },
          { name: 'address', label: '단체 소재지' },
          { name: 'representative', label: '대표자' },
          { name: 'legalBasis', label: '기부금공제대상 근거법령' },
          { name: 'qualificationReference', label: '적격 확인 근거·증빙 참조' },
          {
            name: 'electronicRequired',
            label: '홈택스 전자발급 의무 대상',
            options: [
              { value: 'false', label: '확인 결과 의무 대상 아님' },
              { value: 'true', label: '의무 대상 — 자체 신규 발급 차단' },
            ],
          },
          {
            name: 'eligibilityConfirmed',
            label: '발급 적격 및 원본 보관 절차 확인',
            options: [{ value: 'true', label: '담당자가 확인했습니다' }],
          },
        ].map((f) => ({
          ...f,
          ...(issuer?.[f.name] !== undefined ? { value: String(issuer[f.name]) } : {}),
        }))}
        submit={async (d) => {
          await api(base + '/receipt-issuer', {
            ...d,
            electronicRequired: d.electronicRequired === 'true',
            eligibilityConfirmed: d.eligibilityConfirmed === 'true',
            version: Number(issuer?.version ?? 0),
          });
          setRevision((x) => x + 1);
        }}
      />
    </>
  );
}
