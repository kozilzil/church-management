-- AlterTable
ALTER TABLE "receipt_claim" ADD COLUMN     "hometax_item_id" UUID,
ALTER COLUMN "receipt_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "hometax_submission" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "donor_name" TEXT NOT NULL,
    "issuer_name" TEXT NOT NULL,
    "issuer_registration_number" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "prepared_on" DATE NOT NULL,
    "total_amount" DECIMAL(18,0) NOT NULL,
    "prepared_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_xid" BIGINT NOT NULL DEFAULT txid_current(),

    CONSTRAINT "hometax_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hometax_item" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "given_on" DATE NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,

    CONSTRAINT "hometax_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hometax_result" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hometax_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hometax_submission_church_id_donor_id_tax_year_id_idx" ON "hometax_submission"("church_id", "donor_id", "tax_year", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hometax_submission_church_id_id_key" ON "hometax_submission"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hometax_submission_church_id_request_id_key" ON "hometax_submission"("church_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "hometax_item_church_id_id_key" ON "hometax_item"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hometax_item_church_id_id_offering_id_key" ON "hometax_item"("church_id", "id", "offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "hometax_item_submission_id_offering_id_key" ON "hometax_item"("submission_id", "offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "hometax_result_item_id_state_key" ON "hometax_result"("item_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_claim_hometax_item_id_key" ON "receipt_claim"("hometax_item_id");

-- AddForeignKey
ALTER TABLE "hometax_item" ADD CONSTRAINT "hometax_item_church_id_submission_id_fkey" FOREIGN KEY ("church_id", "submission_id") REFERENCES "hometax_submission"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hometax_result" ADD CONSTRAINT "hometax_result_church_id_item_id_fkey" FOREIGN KEY ("church_id", "item_id") REFERENCES "hometax_item"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- All export snapshots and reconciliation events are append-only.
ALTER TABLE hometax_submission
 ADD FOREIGN KEY(church_id,donor_id) REFERENCES offering_donor(church_id,id),
 ADD FOREIGN KEY(church_id,prepared_by) REFERENCES app_user(church_id,id),
 ADD CHECK(tax_year BETWEEN 1900 AND 9999 AND tax_year<=extract(year from prepared_on)),
 ADD CHECK(total_amount>0 AND total_amount<=499999999999500);
ALTER TABLE hometax_item ADD FOREIGN KEY(church_id,offering_id) REFERENCES offering(church_id,id), ADD CHECK(amount>0);
ALTER TABLE hometax_result ADD FOREIGN KEY(church_id,recorded_by) REFERENCES app_user(church_id,id),
 ADD CHECK(state IN ('ISSUED','NOT_ISSUED','CANCELLED')),
 ADD CHECK(length(trim(reference)) BETWEEN 1 AND 100 AND length(trim(reason)) BETWEEN 1 AND 300);
ALTER TABLE receipt_claim
 ADD CHECK((receipt_id IS NOT NULL)::integer+(hometax_item_id IS NOT NULL)::integer=1),
 ADD FOREIGN KEY(church_id,hometax_item_id,offering_id) REFERENCES hometax_item(church_id,id,offering_id);
CREATE TRIGGER hometax_submission_immutable BEFORE UPDATE OR DELETE ON hometax_submission FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER hometax_item_immutable BEFORE UPDATE OR DELETE ON hometax_item FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER hometax_result_immutable BEFORE UPDATE OR DELETE ON hometax_result FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE FUNCTION check_hometax_item() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s hometax_submission; o offering; BEGIN
 SELECT * INTO s FROM hometax_submission WHERE id=NEW.submission_id AND church_id=NEW.church_id;
 SELECT * INTO o FROM offering WHERE id=NEW.offering_id AND church_id=NEW.church_id;
 IF s.id IS NULL OR s.created_xid<>txid_current() OR o.id IS NULL OR o.state<>'POSTED' OR o.donor_id IS DISTINCT FROM s.donor_id OR extract(year from o.given_on)<>s.tax_year OR o.amount<>NEW.amount OR o.given_on<>NEW.given_on OR NOT EXISTS(SELECT 1 FROM offering_type WHERE id=o.type_id AND receipt_eligible) OR EXISTS(SELECT 1 FROM journal_entry WHERE reversal_of=o.journal_id) THEN
 RAISE EXCEPTION 'Hometax item is not eligible' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER hometax_item_check BEFORE INSERT ON hometax_item FOR EACH ROW EXECUTE FUNCTION check_hometax_item();
CREATE FUNCTION check_hometax_total() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n integer; total numeric; claims integer; BEGIN
 SELECT count(*),sum(amount) INTO n,total FROM hometax_item WHERE submission_id=NEW.id;
 SELECT count(*) INTO claims FROM receipt_claim c JOIN hometax_item i ON i.id=c.hometax_item_id WHERE i.submission_id=NEW.id;
 IF n<1 OR n>500 OR total<>NEW.total_amount OR claims<>n THEN RAISE EXCEPTION 'Hometax total or claims do not match items' USING ERRCODE='23514'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER hometax_total_check AFTER INSERT ON hometax_submission DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_hometax_total();
CREATE OR REPLACE FUNCTION protect_receipt_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.receipt_id IS NOT NULL AND EXISTS(SELECT 1 FROM donation_receipt WHERE id=NEW.receipt_id AND church_id=NEW.church_id AND created_xid=txid_current()) THEN RETURN NEW; END IF;
  IF NEW.hometax_item_id IS NOT NULL AND EXISTS(SELECT 1 FROM hometax_item i JOIN hometax_submission s ON s.id=i.submission_id WHERE i.id=NEW.hometax_item_id AND s.church_id=NEW.church_id AND s.created_xid=txid_current()) THEN RETURN NEW; END IF;
 END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.receipt_id IS NOT NULL AND EXISTS(SELECT 1 FROM receipt_cancellation WHERE receipt_id=OLD.receipt_id AND church_id=OLD.church_id) THEN RETURN OLD; END IF;
  IF OLD.hometax_item_id IS NOT NULL AND EXISTS(SELECT 1 FROM hometax_result WHERE item_id=OLD.hometax_item_id AND state IN ('NOT_ISSUED','CANCELLED')) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Receipt claim requires preparation, issuance or confirmed release' USING ERRCODE='23514'; END $$;
CREATE FUNCTION check_hometax_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 -- Lock the immutable item to serialize append-only state transitions, including raw SQL.
 PERFORM 1 FROM hometax_item WHERE id=NEW.item_id AND church_id=NEW.church_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM receipt_claim WHERE hometax_item_id=NEW.item_id AND church_id=NEW.church_id) THEN
  RAISE EXCEPTION 'Hometax item is no longer reserved' USING ERRCODE='23514'; END IF;
 IF NEW.state='CANCELLED' THEN
  IF NOT EXISTS(SELECT 1 FROM hometax_result WHERE item_id=NEW.item_id AND state='ISSUED') OR EXISTS(SELECT 1 FROM hometax_result WHERE item_id=NEW.item_id AND state IN ('NOT_ISSUED','CANCELLED')) THEN
   RAISE EXCEPTION 'Cancellation requires an issued item' USING ERRCODE='23514'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM hometax_result WHERE item_id=NEW.item_id) THEN RAISE EXCEPTION 'Hometax outcome already recorded' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER hometax_result_check BEFORE INSERT ON hometax_result FOR EACH ROW EXECUTE FUNCTION check_hometax_result();
CREATE FUNCTION check_hometax_result_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM receipt_claim WHERE hometax_item_id=NEW.item_id) <> (NOT EXISTS(SELECT 1 FROM hometax_result WHERE item_id=NEW.item_id AND state IN ('NOT_ISSUED','CANCELLED'))) THEN
  RAISE EXCEPTION 'Hometax outcome and claim disagree' USING ERRCODE='23514'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER hometax_result_claim_check AFTER INSERT ON hometax_result DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_hometax_result_claim();
INSERT INTO permission(code) VALUES ('receipt.export'),('receipt.reconcile');
