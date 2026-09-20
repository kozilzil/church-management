import { Prisma } from '@prisma/client';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../identity/domain/actor';
import { FinancePolicy, bad, missing, conflict, page, type Tx } from './finance-policy.service';
import type {
  ReceiptIssuerDto,
  ReceiptPreviewDto,
  ReceiptIssueDto,
  OfferingQuery,
} from '../interface/offering.dto';
@Injectable()
export class ReceiptService {
  constructor(@Inject(FinancePolicy) private readonly p: FinancePolicy) {}
  async issuer(a: Actor, c: string) {
    this.p.check(a, c, 'finance.manage');
    return this.p.db.receiptIssuer.findUnique({ where: { churchId: c } });
  }
  saveIssuer(a: Actor, c: string, d: ReceiptIssuerDto) {
    return this.p.write(
      a,
      c,
      'finance.manage',
      async (tx) => {
        const previous = await tx.receiptIssuer.findUnique({ where: { churchId: c } });
        if ((previous?.version ?? 0) !== d.version) conflict();
        const data = {
          name: d.name.trim(),
          registrationNumber: d.registrationNumber,
          address: d.address.trim(),
          representative: d.representative.trim(),
          legalBasis: d.legalBasis.trim(),
          qualificationReference: d.qualificationReference.trim(),
          electronicRequired: d.electronicRequired,
        };
        await tx.receiptIssuer.upsert({
          where: { churchId: c },
          create: { ...data, churchId: c },
          update: { ...data, version: { increment: 1 } },
        });
        await this.p.audit.record(a, 'receipt.issuer.update', 'receiptIssuer', c, [], tx);
        return { ok: true };
      },
      true,
    );
  }
  async eligible(tx: Tx, c: string, d: ReceiptPreviewDto, ids?: string[]) {
    const donor = await tx.offeringDonor.findFirst({ where: { churchId: c, id: d.donorId } });
    if (!donor) missing();
    const issuer = await tx.receiptIssuer.findUnique({ where: { churchId: c } });
    const types = await tx.offeringType.findMany({ where: { churchId: c, receiptEligible: true } });
    const allowed = await tx.$queryRaw<{ id: string; eligible_count: bigint }[]>(Prisma.sql`
      SELECT o.id, count(*) OVER() AS eligible_count FROM offering o
      JOIN offering_type t ON t.id=o.type_id AND t.church_id=o.church_id
      WHERE o.church_id=${c}::uuid AND o.donor_id=${d.donorId}::uuid AND o.state='POSTED'
      AND t.receipt_eligible AND o.given_on BETWEEN ${this.p.date(`${d.taxYear}-01-01`)} AND ${this.p.date(`${d.taxYear}-12-31`)}
      AND NOT EXISTS(SELECT 1 FROM receipt_claim WHERE offering_id=o.id)
      AND NOT EXISTS(SELECT 1 FROM journal_entry WHERE reversal_of=o.journal_id)
      ${ids ? Prisma.sql`AND o.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
      ORDER BY o.given_on,o.id LIMIT 500`);
    const eligible = await tx.offering.findMany({
      where: { churchId: c, id: { in: allowed.map((r) => r.id) } },
      orderBy: [{ givenOn: 'asc' }, { id: 'asc' }],
    });
    const items = eligible.slice(0, 500).map((r) => ({
      id: r.id,
      givenOn: r.givenOn.toISOString().slice(0, 10),
      amount: r.amount.toNumber(),
      typeName: types.find((t) => t.id === r.typeId)!.name,
    }));
    return {
      donor,
      issuer,
      items,
      totalAmount: items.reduce((n, x) => n + x.amount, 0),
      remainingCount: Math.max(0, Number(allowed[0]?.eligible_count ?? 0) - 500),
    };
  }
  async preview(a: Actor, c: string, d: ReceiptPreviewDto) {
    this.p.check(a, c, 'receipt.read');
    return this.p.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c},0))`;
      const r = await this.eligible(tx, c, d);
      return { ...r, taxYear: d.taxYear };
    });
  }
  issue(a: Actor, c: string, d: ReceiptIssueDto) {
    this.p.check(a, c, 'receipt.read');
    return this.p.write(
      a,
      c,
      'receipt.issue',
      async (tx) => {
        const { donor, issuer, items, totalAmount } = await this.eligible(tx, c, d, d.offeringIds);
        if (!issuer) bad('먼저 영수증 발급기관을 설정하세요.');
        if (issuer.electronicRequired)
          bad('전자발급 의무 대상으로 설정되어 있습니다. 홈택스에서 발급하세요.');
        if (!donor.address.trim()) bad('기부자 주소를 등록하세요.');
        if (d.donorVersion !== donor.version || d.issuerVersion !== issuer.version) conflict();
        if (items.length !== d.offeringIds.length)
          bad('발급 대상이 변경되었습니다. 미리보기를 다시 확인하세요.');
        const church = await tx.church.findUniqueOrThrow({ where: { id: c } });
        const issuedOn = new Intl.DateTimeFormat('en-CA', {
          timeZone: church.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const serialYear = Number(issuedOn.slice(0, 4));
        if (d.taxYear > serialYear) bad('미래 귀속연도입니다.');
        const last = await tx.donationReceipt.aggregate({
          where: { churchId: c, serialYear },
          _max: { serial: true },
        });
        const serial = (last._max.serial ?? 0) + 1;
        const number = `D-${serialYear}-${String(serial).padStart(6, '0')}`;
        const r = await tx.donationReceipt.create({
          data: {
            churchId: c,
            donorId: donor.id,
            taxYear: d.taxYear,
            serialYear,
            serial,
            number,
            donorName: donor.name,
            donorAddress: donor.address,
            issuerName: issuer.name,
            issuerRegistrationNumber: issuer.registrationNumber,
            issuerAddress: issuer.address,
            issuerRepresentative: issuer.representative,
            issuerLegalBasis: issuer.legalBasis,
            qualificationReference: issuer.qualificationReference,
            totalAmount,
            issuedBy: a.userId,
            issuedOn: this.p.date(issuedOn),
            items: {
              create: items.map((x) => ({
                offeringId: x.id,
                givenOn: this.p.date(x.givenOn),
                amount: x.amount,
                typeName: x.typeName,
              })),
            },
          },
        });
        await tx.receiptClaim.createMany({
          data: items.map((x) => ({ churchId: c, offeringId: x.id, receiptId: r.id })),
        });
        await this.p.audit.record(a, 'receipt.issue', 'receipt', r.id, [], tx);
        return { id: r.id, number };
      },
      true,
    );
  }
  async list(a: Actor, c: string, q: OfferingQuery) {
    this.p.check(a, c, 'receipt.read');
    const rows = await this.p.db.donationReceipt.findMany({
      where: {
        churchId: c,
        ...(q.cursor ? { id: { gt: q.cursor } } : {}),
        ...(q.donorId ? { donorId: q.donorId } : {}),
        ...(q.taxYear ? { taxYear: q.taxYear } : {}),
      },
      orderBy: { id: 'asc' },
      take: (q.limit ?? 30) + 1,
      select: {
        id: true,
        number: true,
        donorName: true,
        taxYear: true,
        totalAmount: true,
        issuedOn: true,
      },
    });
    const cancelled = await this.p.db.receiptCancellation.findMany({
      where: { churchId: c, receiptId: { in: rows.map((r) => r.id) } },
    });
    return page(
      rows.map((r) => ({
        ...r,
        totalAmount: r.totalAmount.toNumber(),
        cancelled: cancelled.some((x) => x.receiptId === r.id),
      })),
      q.limit ?? 30,
    );
  }
  async detail(a: Actor, c: string, id: string) {
    this.p.check(a, c, 'receipt.read');
    return this.detailIn(this.p.db, c, id);
  }
  private async detailIn(tx: Tx, c: string, id: string) {
    const r = await tx.donationReceipt.findFirst({
      where: { churchId: c, id },
      include: { items: { orderBy: [{ givenOn: 'asc' }, { offeringId: 'asc' }] } },
    });
    if (!r) missing();
    return {
      id: r.id,
      number: r.number,
      taxYear: r.taxYear,
      donorName: r.donorName,
      donorAddress: r.donorAddress,
      issuerName: r.issuerName,
      issuerRegistrationNumber: r.issuerRegistrationNumber,
      issuerAddress: r.issuerAddress,
      issuerRepresentative: r.issuerRepresentative,
      issuerLegalBasis: r.issuerLegalBasis,
      totalAmount: r.totalAmount.toNumber(),
      issuedOn: r.issuedOn.toISOString().slice(0, 10),
      items: r.items.map((x) => ({
        offeringId: x.offeringId,
        givenOn: x.givenOn.toISOString().slice(0, 10),
        amount: x.amount.toNumber(),
        typeName: x.typeName,
      })),
      cancellation: await tx.receiptCancellation.findFirst({
        where: { churchId: c, receiptId: id },
      }),
    };
  }
  print(a: Actor, c: string, id: string) {
    this.p.check(a, c, 'receipt.read');
    return this.p.write(
      a,
      c,
      'receipt.print',
      async (tx) => {
        const r = await this.detailIn(tx, c, id);
        if (r.cancellation) bad('취소된 영수증은 발급용으로 출력할 수 없습니다.');
        await this.p.audit.record(a, 'receipt.print', 'receipt', id, [], tx);
        return r;
      },
      true,
    );
  }
  cancel(a: Actor, c: string, id: string, reason: string) {
    this.p.check(a, c, 'receipt.read');
    return this.p.write(
      a,
      c,
      'receipt.cancel',
      async (tx) => {
        const r = await tx.donationReceipt.findFirst({ where: { churchId: c, id } });
        if (!r) missing();
        if (await tx.receiptCancellation.count({ where: { churchId: c, receiptId: id } }))
          bad('이미 취소된 영수증입니다.');
        await tx.receiptCancellation.create({
          data: { churchId: c, receiptId: id, cancelledBy: a.userId, reason },
        });
        await tx.receiptClaim.deleteMany({ where: { churchId: c, receiptId: id } });
        await this.p.audit.record(a, 'receipt.cancel', 'receipt', id, [], tx);
        return { ok: true };
      },
      true,
    );
  }
}
