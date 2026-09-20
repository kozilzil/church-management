-- CreateTable
CREATE TABLE "offering_type" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "revenue_account_id" UUID NOT NULL,
    "fund_id" UUID NOT NULL,
    "receipt_eligible" BOOLEAN NOT NULL,

    CONSTRAINT "offering_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_donor" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "member_id" UUID,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "offering_donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "donor_id" UUID,
    "type_id" UUID NOT NULL,
    "asset_account_id" UUID NOT NULL,
    "given_on" DATE NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "reference" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "edited_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "journal_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_reversal" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_reversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_event" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_issuer" (
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "representative" TEXT NOT NULL,
    "legal_basis" TEXT NOT NULL,
    "qualification_reference" TEXT NOT NULL,
    "electronic_required" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "receipt_issuer_pkey" PRIMARY KEY ("church_id")
);

-- CreateTable
CREATE TABLE "donation_receipt" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "serial_year" INTEGER NOT NULL,
    "serial" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "donor_name" TEXT NOT NULL,
    "donor_address" TEXT NOT NULL,
    "issuer_name" TEXT NOT NULL,
    "issuer_registration_number" TEXT NOT NULL,
    "issuer_address" TEXT NOT NULL,
    "issuer_representative" TEXT NOT NULL,
    "issuer_legal_basis" TEXT NOT NULL,
    "qualification_reference" TEXT NOT NULL,
    "total_amount" DECIMAL(18,0) NOT NULL,
    "issued_by" UUID NOT NULL,
    "issued_on" DATE NOT NULL,
    "created_xid" BIGINT NOT NULL DEFAULT txid_current(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_receipt_item" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "given_on" DATE NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "type_name" TEXT NOT NULL,

    CONSTRAINT "donation_receipt_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_claim" (
    "offering_id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,

    CONSTRAINT "receipt_claim_pkey" PRIMARY KEY ("offering_id")
);

-- CreateTable
CREATE TABLE "receipt_cancellation" (
    "receipt_id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "cancelled_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_cancellation_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offering_type_church_id_id_key" ON "offering_type"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_type_church_id_name_key" ON "offering_type"("church_id", "name");

-- CreateIndex
CREATE INDEX "offering_donor_church_id_name_id_idx" ON "offering_donor"("church_id", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_donor_church_id_id_key" ON "offering_donor"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_donor_church_id_member_id_key" ON "offering_donor"("church_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_journal_id_key" ON "offering"("journal_id");

-- CreateIndex
CREATE INDEX "offering_church_id_donor_id_given_on_id_idx" ON "offering"("church_id", "donor_id", "given_on", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_church_id_id_key" ON "offering"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_church_id_reference_key" ON "offering"("church_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "offering_reversal_offering_id_key" ON "offering_reversal"("offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_reversal_journal_id_key" ON "offering_reversal"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "offering_event_offering_id_version_key" ON "offering_event"("offering_id", "version");

-- CreateIndex
CREATE INDEX "donation_receipt_church_id_donor_id_tax_year_id_idx" ON "donation_receipt"("church_id", "donor_id", "tax_year", "id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_receipt_church_id_id_key" ON "donation_receipt"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_receipt_church_id_serial_year_serial_key" ON "donation_receipt"("church_id", "serial_year", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "donation_receipt_church_id_number_key" ON "donation_receipt"("church_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "donation_receipt_item_receipt_id_offering_id_key" ON "donation_receipt_item"("receipt_id", "offering_id");

-- AddForeignKey
ALTER TABLE "donation_receipt_item" ADD CONSTRAINT "donation_receipt_item_church_id_receipt_id_fkey" FOREIGN KEY ("church_id", "receipt_id") REFERENCES "donation_receipt"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tenant boundaries and immutable fiscal source records.
ALTER TABLE offering_type ADD FOREIGN KEY(church_id) REFERENCES church(id),
 ADD FOREIGN KEY(church_id,revenue_account_id) REFERENCES finance_account(church_id,id),
 ADD FOREIGN KEY(church_id,fund_id) REFERENCES finance_fund(church_id,id);
ALTER TABLE offering_donor ADD FOREIGN KEY(church_id) REFERENCES church(id),
 ADD FOREIGN KEY(church_id,member_id) REFERENCES member(church_id,id);
ALTER TABLE offering ADD FOREIGN KEY(church_id) REFERENCES church(id),
 ADD FOREIGN KEY(church_id,donor_id) REFERENCES offering_donor(church_id,id),
 ADD FOREIGN KEY(church_id,type_id) REFERENCES offering_type(church_id,id),
 ADD FOREIGN KEY(church_id,asset_account_id) REFERENCES finance_account(church_id,id),
 ADD FOREIGN KEY(church_id,created_by) REFERENCES app_user(church_id,id),
 ADD FOREIGN KEY(church_id,edited_by) REFERENCES app_user(church_id,id),
 ADD FOREIGN KEY(church_id,reviewed_by) REFERENCES app_user(church_id,id),
 ADD FOREIGN KEY(church_id,journal_id) REFERENCES journal_entry(church_id,id),
 ADD CHECK(amount BETWEEN 1 AND 999999999999), ADD CHECK(version>0),
 ADD CHECK(state IN ('DRAFT','REVIEWED','POSTED','CANCELLED')),
 ADD CHECK((state='POSTED')=(journal_id IS NOT NULL)),
 ADD CHECK(state NOT IN ('REVIEWED','POSTED') OR (reviewed_by IS NOT NULL AND reviewed_by<>created_by AND reviewed_by<>edited_by));
ALTER TABLE offering_reversal ADD FOREIGN KEY(church_id,offering_id) REFERENCES offering(church_id,id),
 ADD FOREIGN KEY(church_id,journal_id) REFERENCES journal_entry(church_id,id),
 ADD FOREIGN KEY(church_id,created_by) REFERENCES app_user(church_id,id);
ALTER TABLE offering_event ADD FOREIGN KEY(church_id,offering_id) REFERENCES offering(church_id,id),
 ADD FOREIGN KEY(church_id,actor_id) REFERENCES app_user(church_id,id);
ALTER TABLE receipt_issuer ADD FOREIGN KEY(church_id) REFERENCES church(id);
ALTER TABLE donation_receipt ADD FOREIGN KEY(church_id,donor_id) REFERENCES offering_donor(church_id,id),
 ADD FOREIGN KEY(church_id,issued_by) REFERENCES app_user(church_id,id),
 ADD CHECK(total_amount>0 AND total_amount<=499999999999500),
 ADD CHECK(tax_year BETWEEN 1900 AND 9999 AND serial>0 AND serial_year=extract(year from issued_on));
ALTER TABLE donation_receipt_item ADD FOREIGN KEY(church_id,offering_id) REFERENCES offering(church_id,id), ADD CHECK(amount>0);
ALTER TABLE receipt_claim ADD FOREIGN KEY(church_id,receipt_id) REFERENCES donation_receipt(church_id,id),
 ADD FOREIGN KEY(church_id,offering_id) REFERENCES offering(church_id,id),
 ADD FOREIGN KEY(receipt_id,offering_id) REFERENCES donation_receipt_item(receipt_id,offering_id);
ALTER TABLE receipt_cancellation ADD FOREIGN KEY(church_id,receipt_id) REFERENCES donation_receipt(church_id,id),
 ADD FOREIGN KEY(church_id,cancelled_by) REFERENCES app_user(church_id,id);
CREATE TRIGGER offering_type_immutable BEFORE UPDATE OR DELETE ON offering_type FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER offering_reversal_immutable BEFORE UPDATE OR DELETE ON offering_reversal FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER offering_event_immutable BEFORE UPDATE OR DELETE ON offering_event FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER donation_receipt_immutable BEFORE UPDATE OR DELETE ON donation_receipt FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER donation_receipt_item_immutable BEFORE UPDATE OR DELETE ON donation_receipt_item FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER receipt_cancellation_immutable BEFORE UPDATE OR DELETE ON receipt_cancellation FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE FUNCTION protect_final_offering() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.state IN ('POSTED','CANCELLED') THEN RAISE EXCEPTION 'Final offerings are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER offering_final_protect BEFORE UPDATE OR DELETE ON offering FOR EACH ROW EXECUTE FUNCTION protect_final_offering();
CREATE FUNCTION check_receipt_item() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r donation_receipt; o offering; BEGIN
 SELECT * INTO r FROM donation_receipt WHERE id=NEW.receipt_id AND church_id=NEW.church_id;
 SELECT * INTO o FROM offering WHERE id=NEW.offering_id AND church_id=NEW.church_id;
 IF r.id IS NULL OR r.created_xid<>txid_current() OR o.id IS NULL OR o.state<>'POSTED' OR o.donor_id IS DISTINCT FROM r.donor_id OR extract(year from o.given_on)<>r.tax_year OR o.amount<>NEW.amount OR o.given_on<>NEW.given_on OR NOT EXISTS(SELECT 1 FROM offering_type WHERE id=o.type_id AND receipt_eligible) OR EXISTS(SELECT 1 FROM journal_entry WHERE reversal_of=o.journal_id) THEN
 RAISE EXCEPTION 'Receipt item is not eligible' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER receipt_item_check BEFORE INSERT ON donation_receipt_item FOR EACH ROW EXECUTE FUNCTION check_receipt_item();
CREATE FUNCTION check_receipt_total() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n integer; total numeric; claims integer; BEGIN
 SELECT count(*),sum(amount) INTO n,total FROM donation_receipt_item WHERE receipt_id=NEW.id;
 SELECT count(*) INTO claims FROM receipt_claim WHERE receipt_id=NEW.id;
 IF n<1 OR n>500 OR total<>NEW.total_amount OR claims<>n THEN RAISE EXCEPTION 'Receipt total or claims do not match items' USING ERRCODE='23514'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER receipt_total_check AFTER INSERT ON donation_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_receipt_total();
CREATE FUNCTION protect_receipt_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM donation_receipt WHERE id=NEW.receipt_id AND church_id=NEW.church_id AND created_xid=txid_current()) THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM receipt_cancellation WHERE receipt_id=OLD.receipt_id AND church_id=OLD.church_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Receipt claim requires issuance or cancellation' USING ERRCODE='23514'; END $$;
CREATE TRIGGER receipt_claim_protect BEFORE INSERT OR UPDATE OR DELETE ON receipt_claim FOR EACH ROW EXECUTE FUNCTION protect_receipt_claim();
CREATE FUNCTION prevent_receipted_reversal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.reversal_of IS NOT NULL AND EXISTS(SELECT 1 FROM offering o JOIN receipt_claim c ON c.offering_id=o.id WHERE o.journal_id=NEW.reversal_of) THEN RAISE EXCEPTION 'Cancel the receipt before reversing its offering' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER journal_receipt_protect BEFORE INSERT ON journal_entry FOR EACH ROW EXECUTE FUNCTION prevent_receipted_reversal();
INSERT INTO permission(code) VALUES ('offering.read'),('offering.write'),('offering.review'),('offering.post'),('offering.reverse'),('receipt.read'),('receipt.issue'),('receipt.print'),('receipt.cancel');
