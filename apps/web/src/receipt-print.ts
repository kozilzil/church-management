export type ReceiptDocument = {
  id: string;
  number: string;
  taxYear: number;
  donorName: string;
  donorAddress: string;
  issuerName: string;
  issuerRegistrationNumber: string;
  issuerAddress: string;
  issuerRepresentative: string;
  issuerLegalBasis: string;
  totalAmount: number;
  issuedOn: string;
  items: { offeringId: string; givenOn: string; amount: number; typeName: string }[];
  cancellation: null | { reason: string; createdAt: string };
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function validPrintIdentity(input: string) {
  const s = input.replaceAll('-', '');
  if (!/^\d{6}[1-8]\d{6}$/.test(s)) return false;
  const y = ([1, 2, 5, 6].includes(Number(s[6])) ? '19' : '20') + s.slice(0, 2),
    date = `${y}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  const d = new Date(date + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date && d <= new Date();
}
/** No networking or storage. Identity exists only in this print document until the window closes. */
export function receiptHtml(
  r: ReceiptDocument,
  identity: string,
  stylesheetHref = '/receipt-print.css',
) {
  if (r.cancellation) throw new Error('취소된 영수증입니다.');
  if (!validPrintIdentity(identity)) throw new Error('주민등록번호 형식을 확인하세요.');
  const ident = identity.replaceAll('-', ''),
    display = ident.slice(0, 6) + '-' + ident.slice(6),
    pages = [];
  const money = (n: number) => n.toLocaleString('ko-KR');
  const verbose =
    [
      r.donorName,
      r.donorAddress,
      r.issuerName,
      r.issuerAddress,
      r.issuerRepresentative,
      r.issuerLegalBasis,
    ].join('').length > 500;
  const perPage = verbose ? 4 : 12;
  for (let start = 0; start < r.items.length; start += perPage) {
    const rows = r.items.slice(start, start + perPage),
      last = start + perPage >= r.items.length;
    pages.push(`<section class="sheet${verbose ? ' compact' : ''}"><div class="top">소득세법 시행규칙 별지 제45호의2서식 항목 기준 · 개인 금전기부</div>
      <div class="meta">일련번호 ${escape(r.number)}<span>${start / perPage + 1} / ${Math.ceil(r.items.length / perPage)}</span></div><h1>기 부 금 영 수 증</h1>
      <h2>❶ 기부자</h2><table><tr><th>성명</th><td>${escape(r.donorName)}</td><th>주민등록번호</th><td>${escape(display)}</td></tr><tr><th>주소</th><td colspan="3">${escape(r.donorAddress)}</td></tr></table>
      <h2>❷ 기부금 단체</h2><table><tr><th>단체명</th><td>${escape(r.issuerName)}</td><th>사업자등록번호<br>(고유번호)</th><td>${escape(r.issuerRegistrationNumber)}</td></tr><tr><th>소재지</th><td colspan="3">${escape(r.issuerAddress)}</td></tr><tr><th>공제대상<br>근거법령</th><td colspan="3">${escape(r.issuerLegalBasis)}</td></tr></table>
      <h2>❸ 기부금 모집처</h2><p class="small">직접 기부 — 해당 없음</p><h2>❹ 기부내용 (${r.taxYear}년 귀속)</h2>
      <table class="items"><thead><tr><th>코드</th><th>구분</th><th>연월일</th><th>품명</th><th>수량</th><th>단가</th><th>금액 (원)</th></tr></thead><tbody>${rows.map((x) => `<tr><td>41</td><td>금전</td><td>${escape(x.givenOn)}</td><td></td><td></td><td></td><td class="money">${money(x.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="6">이 페이지 합계</th><td class="money">${money(rows.reduce((n, x) => n + x.amount, 0))}</td></tr></tfoot></table>
      ${last ? `<p class="total">총 기부금액: ${money(r.totalAmount)}원 (${r.items.length}건)</p><p class="statement">관련 세법에 따른 기부금을 위와 같이 기부하였음을 증명하여 주시기 바랍니다.</p><p class="sign">${escape(r.issuedOn)}  신청인 ${escape(r.donorName)} (서명 또는 인)</p><p class="statement">위와 같이 기부금을 기부받았음을 증명합니다.</p><p class="sign">${escape(r.issuedOn)}  기부금 수령인 ${escape(r.issuerName)}<br>대표자 ${escape(r.issuerRepresentative)} (서명 또는 인)</p>` : '<p class="small">다음 페이지에 계속됩니다. 모든 페이지가 하나의 영수증입니다.</p>'}
      <footer>${escape(r.number)} · 종교단체 일반기부금 코드 41 · 발급일 ${escape(r.issuedOn)}</footer></section>`);
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'none'; form-action 'none'; base-uri 'none'"><title>기부금영수증 ${escape(r.number)}</title><link rel="stylesheet" href="${escape(stylesheetHref)}"></head><body><div class="help">브라우저의 인쇄 메뉴(Ctrl/Cmd+P)에서 인쇄하거나 PDF로 저장하세요. 모든 페이지를 함께 보관하고 서명 또는 날인하세요. 이 문서는 교회 자체 영수증이며 홈택스 전자발급 내역이 아닙니다. 작업 후 창을 닫아 식별번호를 지우세요.</div>${pages.join('')}</body></html>`;
}

export async function waitForPrintWindow(output: Window): Promise<void> {
  const deadline = Date.now() + 15000;
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      if (output.closed || Date.now() > deadline) {
        reject(new Error('인쇄 창을 준비하지 못했습니다. 다시 시도하세요.'));
        return;
      }
      if (
        output.location.pathname === '/receipt-print.html' &&
        output.document.readyState === 'complete'
      ) {
        resolve();
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}
