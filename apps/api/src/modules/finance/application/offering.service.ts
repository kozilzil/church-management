import { Inject, Injectable } from '@nestjs/common';
import type { Offering } from '@prisma/client';
import type { Actor } from '../../identity/domain/actor';
import { DonorDirectoryService } from '../../registry/application/donor-directory.service';
import {
  FinancePolicy,
  bad,
  missing,
  conflict,
  denied,
  page,
  type Tx,
} from './finance-policy.service';
import { LedgerService } from './ledger.service';
import type {
  OfferingTypeDto,
  DonorDto,
  DonorUpdateDto,
  OfferingDto,
  OfferingUpdateDto,
  OfferingQuery,
} from '../interface/offering.dto';
import type { ReasonDto, ReverseDto } from '../interface/finance.dto';
@Injectable()
export class OfferingService {
  constructor(
    @Inject(FinancePolicy) private readonly p: FinancePolicy,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(DonorDirectoryService) readonly directory: DonorDirectoryService,
  ) {}
  async types(a: Actor, c: string, permission = 'offering.read') {
    this.p.check(a, c, permission);
    return {
      items: await this.p.db.offeringType.findMany({
        where: { churchId: c },
        orderBy: { name: 'asc' },
      }),
    };
  }
  createType(a: Actor, c: string, d: OfferingTypeDto) {
    return this.p.write(
      a,
      c,
      'finance.manage',
      async (tx) => {
        await this.p.account(c, d.revenueAccountId, 'REVENUE', tx);
        if (!(await tx.financeFund.count({ where: { churchId: c, id: d.fundId } })))
          bad('기금을 확인하세요.');
        if (await tx.offeringType.count({ where: { churchId: c, name: d.name.trim() } }))
          bad('같은 헌금 종류가 있습니다.');
        const r = await tx.offeringType.create({
          data: { ...d, name: d.name.trim(), churchId: c },
        });
        await this.p.audit.record(a, 'offering.type.create', 'offeringType', r.id, [], tx);
        return { id: r.id };
      },
      true,
    );
  }
  async donors(a: Actor, c: string, q: OfferingQuery, permission = 'offering.read') {
    this.p.check(a, c, permission);
    const rows = await this.p.db.offeringDonor.findMany({
      where: {
        churchId: c,
        ...(q.cursor ? { id: { gt: q.cursor } } : {}),
        ...(q.search ? { name: { contains: q.search.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { id: 'asc' },
      take: (q.limit ?? 30) + 1,
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        memberId: r.memberId,
        version: r.version,
        ...(permission === 'receipt.read' || a.permissions.includes('offering.write')
          ? { address: r.address }
          : {}),
      })),
      q.limit ?? 30,
    );
  }
  createDonor(a: Actor, c: string, d: DonorDto) {
    return this.p.write(a, c, 'offering.write', async (tx) => {
      if (d.memberId) {
        const member = await this.directory.get(a, c, d.memberId);
        if (member.name !== d.name.trim()) bad('교인의 등록 이름을 사용하세요.');
        if (await tx.offeringDonor.count({ where: { churchId: c, memberId: d.memberId } }))
          bad('이 교인은 이미 기부자로 등록되어 있습니다.');
      }
      const r = await tx.offeringDonor.create({
        data: { ...d, name: d.name.trim(), address: d.address.trim(), churchId: c },
      });
      await this.p.audit.record(a, 'offering.donor.create', 'donor', r.id, [], tx);
      return { id: r.id };
    });
  }
  updateDonor(a: Actor, c: string, id: string, d: DonorUpdateDto) {
    return this.p.write(a, c, 'offering.write', async (tx) => {
      const r = await tx.offeringDonor.findFirst({ where: { churchId: c, id } });
      if (!r) missing();
      if (r.version !== d.version) conflict();
      if (r.memberId && (await this.directory.get(a, c, r.memberId)).name !== d.name.trim())
        bad('교인의 등록 이름을 사용하세요.');
      await tx.offeringDonor.update({
        where: { id },
        data: { name: d.name.trim(), address: d.address.trim(), version: { increment: 1 } },
      });
      await this.p.audit.record(a, 'offering.donor.update', 'donor', id, ['name', 'address'], tx);
      return { ok: true };
    });
  }
  private async validate(c: string, d: OfferingDto, tx: Tx, id?: string) {
    await this.p.openPeriod(c, d.givenOn, tx);
    await this.p.account(c, d.assetAccountId, 'ASSET', tx);
    if (!(await tx.offeringType.count({ where: { churchId: c, id: d.typeId } })))
      bad('헌금 종류를 확인하세요.');
    if (d.donorId && !(await tx.offeringDonor.count({ where: { churchId: c, id: d.donorId } })))
      bad('기부자를 확인하세요.');
    if (
      await tx.offering.count({
        where: { churchId: c, reference: d.reference.trim(), ...(id ? { id: { not: id } } : {}) },
      })
    )
      bad('이미 사용한 접수 참조입니다.');
    return {
      donorId: d.donorId ?? null,
      typeId: d.typeId,
      assetAccountId: d.assetAccountId,
      givenOn: this.p.date(d.givenOn),
      amount: d.amount,
      reference: d.reference.trim(),
      source: d.source,
    };
  }
  private async event(a: Actor, tx: Tx, r: Offering, action: string, reason = '') {
    await tx.offeringEvent.create({
      data: {
        churchId: r.churchId,
        offeringId: r.id,
        actorId: a.userId,
        version: r.version,
        action,
        reason,
      },
    });
    await this.p.audit.record(a, 'offering.' + action, 'offering', r.id, [], tx);
  }
  private async get(tx: Tx, c: string, id: string, version?: number) {
    const r = await tx.offering.findFirst({ where: { churchId: c, id } });
    if (!r) missing();
    if (version !== undefined && r.version !== version) conflict();
    return r;
  }
  private view(r: Offering) {
    return { ...r, amount: r.amount.toNumber() };
  }
  create(a: Actor, c: string, d: OfferingDto) {
    this.p.check(a, c, 'offering.read');
    return this.p.write(a, c, 'offering.write', async (tx) => {
      const r = await tx.offering.create({
        data: {
          ...(await this.validate(c, d, tx)),
          churchId: c,
          createdBy: a.userId,
          editedBy: a.userId,
        },
      });
      await this.event(a, tx, r, 'create');
      return { id: r.id };
    });
  }
  update(a: Actor, c: string, id: string, d: OfferingUpdateDto) {
    this.p.check(a, c, 'offering.read');
    return this.p.write(a, c, 'offering.write', async (tx) => {
      const r = await this.get(tx, c, id, d.version);
      if (!['DRAFT', 'REVIEWED'].includes(r.state)) bad('초안과 검수된 헌금만 수정할 수 있습니다.');
      const next = await tx.offering.update({
        where: { id },
        data: {
          ...(await this.validate(c, d, tx, id)),
          editedBy: a.userId,
          state: 'DRAFT',
          reviewedBy: null,
          version: { increment: 1 },
        },
      });
      await this.event(a, tx, next, 'update');
      return { ok: true };
    });
  }
  async list(a: Actor, c: string, q: OfferingQuery) {
    this.p.check(a, c, 'offering.read');
    const rows = await this.p.db.offering.findMany({
      where: {
        churchId: c,
        ...(q.cursor ? { id: { gt: q.cursor } } : {}),
        ...(q.donorId ? { donorId: q.donorId } : {}),
        ...(q.state ? { state: q.state } : {}),
        ...(q.taxYear
          ? {
              givenOn: {
                gte: this.p.date(`${q.taxYear}-01-01`),
                lte: this.p.date(`${q.taxYear}-12-31`),
              },
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: (q.limit ?? 30) + 1,
    });
    const donors = await this.p.db.offeringDonor.findMany({
      where: { churchId: c, id: { in: rows.flatMap((r) => (r.donorId ? [r.donorId] : [])) } },
    });
    const reversals = await this.p.db.offeringReversal.findMany({
      where: { churchId: c, offeringId: { in: rows.map((r) => r.id) } },
    });
    return page(
      rows.map((r) => ({
        ...this.view(r),
        donorName: donors.find((d) => d.id === r.donorId)?.name ?? '익명',
        reversed: reversals.some((x) => x.offeringId === r.id),
      })),
      q.limit ?? 30,
    );
  }
  async detail(a: Actor, c: string, id: string) {
    this.p.check(a, c, 'offering.read');
    const r = await this.get(this.p.db, c, id);
    const donor = r.donorId
      ? await this.p.db.offeringDonor.findFirst({ where: { churchId: c, id: r.donorId } })
      : null;
    return {
      ...this.view(r),
      donor: donor
        ? {
            id: donor.id,
            name: donor.name,
            version: donor.version,
            memberId: donor.memberId,
            ...(a.permissions.includes('offering.write') ? { address: donor.address } : {}),
          }
        : null,
      donorName: r.donorId
        ? (await this.p.db.offeringDonor.findFirst({ where: { churchId: c, id: r.donorId } }))?.name
        : '익명',
      reversal: await this.p.db.offeringReversal.findFirst({
        where: { churchId: c, offeringId: id },
      }),
      receiptClaim: await this.p.db.receiptClaim.findFirst({
        where: { churchId: c, offeringId: id },
        select: { receiptId: true },
      }),
      events: await this.p.db.offeringEvent.findMany({
        where: { churchId: c, offeringId: id },
        orderBy: { version: 'desc' },
        take: 30,
      }),
    };
  }
  review(a: Actor, c: string, id: string, version: number) {
    this.p.check(a, c, 'offering.read');
    return this.p.write(
      a,
      c,
      'offering.review',
      async (tx) => {
        const r = await this.get(tx, c, id, version);
        if (r.state !== 'DRAFT') bad('초안만 검수할 수 있습니다.');
        if (r.createdBy === a.userId || r.editedBy === a.userId) denied();
        const next = await tx.offering.update({
          where: { id },
          data: { state: 'REVIEWED', reviewedBy: a.userId, version: { increment: 1 } },
        });
        await this.event(a, tx, next, 'review');
        return { ok: true };
      },
      true,
    );
  }
  post(a: Actor, c: string, id: string, version: number) {
    this.p.check(a, c, 'offering.read');
    return this.p.write(
      a,
      c,
      'offering.post',
      async (tx) => {
        const r = await this.get(tx, c, id, version);
        if (r.state !== 'REVIEWED') bad('검수가 완료된 헌금만 확정할 수 있습니다.');
        const t = await tx.offeringType.findFirstOrThrow({ where: { churchId: c, id: r.typeId } });
        const journalId = await this.ledger.postOffering(a, c, tx, {
          offeringId: id,
          givenOn: r.givenOn.toISOString().slice(0, 10),
          amount: r.amount.toNumber(),
          assetAccountId: r.assetAccountId,
          revenueAccountId: t.revenueAccountId,
          fundId: t.fundId,
        });
        const next = await tx.offering.update({
          where: { id },
          data: { state: 'POSTED', journalId, version: { increment: 1 } },
        });
        await this.event(a, tx, next, 'post');
        return { ok: true };
      },
      true,
    );
  }
  cancel(a: Actor, c: string, id: string, d: ReasonDto) {
    this.p.check(a, c, 'offering.read');
    return this.p.write(a, c, 'offering.write', async (tx) => {
      const r = await this.get(tx, c, id, d.version);
      if (!['DRAFT', 'REVIEWED'].includes(r.state)) bad('미확정 헌금만 취소할 수 있습니다.');
      const next = await tx.offering.update({
        where: { id },
        data: { state: 'CANCELLED', version: { increment: 1 } },
      });
      await this.event(a, tx, next, 'cancel', d.reason);
      return { ok: true };
    });
  }
  reverse(a: Actor, c: string, id: string, d: ReverseDto) {
    this.p.check(a, c, 'offering.read');
    return this.p.write(
      a,
      c,
      'offering.reverse',
      async (tx) => {
        const r = await this.get(tx, c, id);
        if (r.state !== 'POSTED' || !r.journalId) bad('확정된 헌금만 정정할 수 있습니다.');
        if (await tx.receiptClaim.count({ where: { churchId: c, offeringId: id } }))
          bad('먼저 이 헌금이 포함된 영수증을 취소하세요.');
        const journal = await this.ledger.reverseOffering(a, c, tx, r.journalId, d);
        await tx.offeringReversal.create({
          data: {
            churchId: c,
            offeringId: id,
            journalId: journal.id,
            reason: d.reason,
            createdBy: a.userId,
          },
        });
        await this.p.audit.record(a, 'offering.reverse', 'offering', id, [], tx);
        return { id: journal.id };
      },
      true,
    );
  }
}
