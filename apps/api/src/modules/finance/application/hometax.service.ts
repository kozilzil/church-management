import { Inject, Injectable } from '@nestjs/common';
import { validateHometaxData } from '@church/contracts';
import type { Actor } from '../../identity/domain/actor';
import { FinancePolicy, bad, conflict, missing, page, type Tx } from './finance-policy.service';
import { ReceiptService } from './receipt.service';
import type { HometaxPrepareDto, HometaxResultDto } from '../interface/hometax.dto';
import type { OfferingQuery } from '../interface/offering.dto';
@Injectable()
export class HometaxService {
  constructor(
    @Inject(FinancePolicy) private readonly p: FinancePolicy,
    @Inject(ReceiptService) private readonly receipts: ReceiptService,
  ) {}
  prepare(a: Actor, c: string, d: HometaxPrepareDto) {
    this.p.check(a, c, 'receipt.read');
    return this.p.write(
      a,
      c,
      'receipt.export',
      async (tx) => {
        const existing = await tx.hometaxSubmission.findUnique({
          where: { churchId_requestId: { churchId: c, requestId: d.requestId } },
          include: { items: true },
        });
        if (existing) {
          if (
            existing.donorId !== d.donorId ||
            existing.taxYear !== d.taxYear ||
            existing.contactName !== d.contactName.trim() ||
            existing.contactPhone !== d.contactPhone ||
            existing.items.length !== d.offeringIds.length ||
            existing.items.some((x) => !d.offeringIds.includes(x.offeringId))
          )
            conflict();
          return { id: existing.id };
        }
        const r = await this.receipts.eligible(tx, c, d, d.offeringIds);
        if (!r.issuer) bad('먼저 발급기관을 설정하세요.');
        if (r.items.length !== d.offeringIds.length)
          bad('대상이 변경되었거나 이미 발급/제출 준비에 포함되어 있습니다.');
        if (r.donor.version !== d.donorVersion || r.issuer.version !== d.issuerVersion) conflict();
        const church = await tx.church.findUniqueOrThrow({ where: { id: c } });
        const preparedOn = new Intl.DateTimeFormat('en-CA', {
          timeZone: church.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        if (d.taxYear > Number(preparedOn.slice(0, 4))) bad('미래 귀속연도입니다.');
        const snapshot = {
          donorName: r.donor.name,
          issuerName: r.issuer.name,
          issuerRegistrationNumber: r.issuer.registrationNumber,
          contactName: d.contactName.trim(),
          contactPhone: d.contactPhone,
        };
        try {
          validateHometaxData({ ...snapshot, preparedOn, items: r.items });
        } catch (e) {
          bad(e instanceof Error ? e.message : '제출 규격을 확인하세요.');
        }
        const s = await tx.hometaxSubmission.create({
          data: {
            ...snapshot,
            churchId: c,
            requestId: d.requestId,
            donorId: d.donorId,
            taxYear: d.taxYear,
            preparedOn: this.p.date(preparedOn),
            totalAmount: r.totalAmount,
            preparedBy: a.userId,
            items: {
              create: r.items.map((x) => ({
                offeringId: x.id,
                givenOn: this.p.date(x.givenOn),
                amount: x.amount,
              })),
            },
          },
          include: { items: true },
        });
        await tx.receiptClaim.createMany({
          data: s.items.map((x) => ({
            churchId: c,
            offeringId: x.offeringId,
            hometaxItemId: x.id,
          })),
        });
        await this.p.audit.record(a, 'receipt.hometax.prepare', 'hometaxSubmission', s.id, [], tx);
        return { id: s.id };
      },
      true,
    );
  }
  async list(a: Actor, c: string, q: OfferingQuery) {
    this.p.check(a, c, 'receipt.read');
    const rows = await this.p.db.hometaxSubmission.findMany({
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
        donorName: true,
        taxYear: true,
        totalAmount: true,
        preparedOn: true,
        items: { select: { results: { select: { state: true } } } },
      },
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        donorName: r.donorName,
        taxYear: r.taxYear,
        totalAmount: r.totalAmount.toNumber(),
        preparedOn: r.preparedOn.toISOString().slice(0, 10),
        pendingCount: r.items.filter((i) => i.results.length === 0).length,
        issuedCount: r.items.filter(
          (i) =>
            i.results.some((e) => e.state === 'ISSUED') &&
            !i.results.some((e) => e.state === 'CANCELLED'),
        ).length,
        itemCount: r.items.length,
      })),
      q.limit ?? 30,
    );
  }
  private async read(tx: Tx, c: string, id: string) {
    const s = await tx.hometaxSubmission.findFirst({
      where: { churchId: c, id },
      include: {
        items: {
          orderBy: [{ givenOn: 'asc' }, { id: 'asc' }],
          include: { results: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    if (!s) missing();
    return {
      id: s.id,
      donorName: s.donorName,
      issuerName: s.issuerName,
      issuerRegistrationNumber: s.issuerRegistrationNumber,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      taxYear: s.taxYear,
      totalAmount: s.totalAmount.toNumber(),
      preparedOn: s.preparedOn.toISOString().slice(0, 10),
      items: s.items.map((i) => ({
        id: i.id,
        offeringId: i.offeringId,
        givenOn: i.givenOn.toISOString().slice(0, 10),
        amount: i.amount.toNumber(),
        state: i.results.some((e) => e.state === 'CANCELLED')
          ? 'CANCELLED'
          : (i.results[0]?.state ?? 'PENDING'),
        results: i.results.map((e) => ({
          id: e.id,
          state: e.state,
          reference: e.reference,
          reason: e.reason,
          recordedBy: e.recordedBy,
          createdAt: e.createdAt.toISOString(),
        })),
      })),
    };
  }
  detail(a: Actor, c: string, id: string) {
    this.p.check(a, c, 'receipt.read');
    return this.read(this.p.db, c, id);
  }
  download(a: Actor, c: string, id: string) {
    this.p.check(a, c, 'receipt.read');
    return this.p.write(
      a,
      c,
      'receipt.export',
      async (tx) => {
        const s = await this.read(tx, c, id);
        if (s.items.some((i) => i.state !== 'PENDING'))
          bad(
            '결과가 등록된 제출 건은 다시 내려받을 수 없습니다. 미발급 확인 항목만 새로 준비하세요.',
          );
        await this.p.audit.record(a, 'receipt.hometax.download', 'hometaxSubmission', id, [], tx);
        return s;
      },
      true,
    );
  }
  reconcile(a: Actor, c: string, id: string, itemId: string, d: HometaxResultDto) {
    this.p.check(a, c, 'receipt.read');
    return this.p.write(
      a,
      c,
      'receipt.reconcile',
      async (tx) => {
        const i = await tx.hometaxItem.findFirst({
          where: { churchId: c, submissionId: id, id: itemId },
          include: { results: true },
        });
        if (!i) missing();
        const same = i.results.find((e) => e.state === d.state);
        if (same) {
          if (same.reference !== d.reference.trim() || same.reason !== d.reason.trim()) conflict();
          return { ok: true };
        }
        if (
          d.state === 'CANCELLED'
            ? !i.results.some((e) => e.state === 'ISSUED') ||
              i.results.some((e) => e.state === 'NOT_ISSUED')
            : i.results.length > 0
        )
          bad('현재 상태에서 기록할 수 없는 결과입니다.');
        await tx.hometaxResult.create({
          data: {
            churchId: c,
            itemId,
            state: d.state,
            reference: d.reference.trim(),
            reason: d.reason.trim(),
            recordedBy: a.userId,
          },
        });
        if (d.state !== 'ISSUED')
          await tx.receiptClaim.deleteMany({ where: { churchId: c, hometaxItemId: itemId } });
        await this.p.audit.record(
          a,
          'receipt.hometax.' + d.state.toLowerCase(),
          'hometaxItem',
          itemId,
          [],
          tx,
        );
        return { ok: true };
      },
      true,
    );
  }
}
