-- CreateTable
CREATE TABLE "finance_account" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "finance_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_fund" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "finance_fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_period" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "finance_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_request" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "account_id" UUID NOT NULL,
    "fund_id" UUID NOT NULL,
    "evidence_reference" TEXT NOT NULL DEFAULT '',
    "approver_ids" UUID[],
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "round" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "expense_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_submission" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "account_id" UUID NOT NULL,
    "fund_id" UUID NOT NULL,
    "evidence_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_approval" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL DEFAULT '',
    "decided_at" TIMESTAMPTZ,

    CONSTRAINT "expense_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_attachment" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "removed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_submission_attachment" (
    "church_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,

    CONSTRAINT "expense_submission_attachment_pkey" PRIMARY KEY ("submission_id","attachment_id")
);

-- CreateTable
CREATE TABLE "expense_event" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payment" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "paid_by" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "journal_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "posted_on" DATE NOT NULL,
    "posted_by" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "reversal_of" UUID,
    "created_xid" BIGINT NOT NULL DEFAULT txid_current(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_line" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "fund_id" UUID NOT NULL,
    "debit" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,0) NOT NULL DEFAULT 0,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_account_church_id_id_key" ON "finance_account"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_account_church_id_code_key" ON "finance_account"("church_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_fund_church_id_id_key" ON "finance_fund"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_fund_church_id_name_key" ON "finance_fund"("church_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_period_church_id_id_key" ON "finance_period"("church_id", "id");

-- CreateIndex
CREATE INDEX "expense_request_church_id_state_id_idx" ON "expense_request"("church_id", "state", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_request_church_id_id_key" ON "expense_request"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_submission_church_id_id_key" ON "expense_submission"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_submission_request_id_round_key" ON "expense_submission"("request_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "expense_approval_submission_id_position_key" ON "expense_approval"("submission_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "expense_approval_submission_id_user_id_key" ON "expense_approval"("submission_id", "user_id");

-- CreateIndex
CREATE INDEX "expense_attachment_request_id_idx" ON "expense_attachment"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_attachment_church_id_id_key" ON "expense_attachment"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_event_request_id_version_key" ON "expense_event"("request_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "expense_payment_request_id_key" ON "expense_payment"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_payment_journal_id_key" ON "expense_payment"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_payment_church_id_reference_key" ON "expense_payment"("church_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_reversal_of_key" ON "journal_entry"("reversal_of");

-- CreateIndex
CREATE INDEX "journal_entry_church_id_posted_on_id_idx" ON "journal_entry"("church_id", "posted_on", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_church_id_id_key" ON "journal_entry"("church_id", "id");

-- AddForeignKey
ALTER TABLE "expense_submission" ADD CONSTRAINT "expense_submission_church_id_request_id_fkey" FOREIGN KEY ("church_id", "request_id") REFERENCES "expense_request"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_approval" ADD CONSTRAINT "expense_approval_church_id_submission_id_fkey" FOREIGN KEY ("church_id", "submission_id") REFERENCES "expense_submission"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_church_id_journal_id_fkey" FOREIGN KEY ("church_id", "journal_id") REFERENCES "journal_entry"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE finance_account ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE finance_fund ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE finance_period ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE expense_request ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE expense_submission ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE expense_approval ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE expense_attachment ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE expense_submission_attachment ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE expense_event ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE expense_payment ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE journal_entry ADD FOREIGN KEY(church_id) REFERENCES church(id);

ALTER TABLE journal_line ADD FOREIGN KEY(church_id) REFERENCES church(id);
ALTER TABLE expense_request ADD FOREIGN KEY(church_id,requester_id) REFERENCES app_user(church_id,id);
ALTER TABLE expense_request ADD FOREIGN KEY(church_id,account_id) REFERENCES finance_account(church_id,id);
ALTER TABLE expense_request ADD FOREIGN KEY(church_id,fund_id) REFERENCES finance_fund(church_id,id);
ALTER TABLE expense_submission ADD FOREIGN KEY(church_id,account_id) REFERENCES finance_account(church_id,id);
ALTER TABLE expense_submission ADD FOREIGN KEY(church_id,fund_id) REFERENCES finance_fund(church_id,id);
ALTER TABLE expense_approval ADD FOREIGN KEY(church_id,user_id) REFERENCES app_user(church_id,id);
ALTER TABLE expense_attachment ADD FOREIGN KEY(church_id,request_id) REFERENCES expense_request(church_id,id);
ALTER TABLE expense_attachment ADD FOREIGN KEY(church_id,uploaded_by) REFERENCES app_user(church_id,id);
ALTER TABLE expense_submission_attachment ADD FOREIGN KEY(church_id,submission_id) REFERENCES expense_submission(church_id,id);
ALTER TABLE expense_submission_attachment ADD FOREIGN KEY(church_id,attachment_id) REFERENCES expense_attachment(church_id,id);
ALTER TABLE expense_event ADD FOREIGN KEY(church_id,request_id) REFERENCES expense_request(church_id,id);
ALTER TABLE expense_event ADD FOREIGN KEY(church_id,actor_id) REFERENCES app_user(church_id,id);
ALTER TABLE expense_payment ADD FOREIGN KEY(church_id,request_id) REFERENCES expense_request(church_id,id);
ALTER TABLE expense_payment ADD FOREIGN KEY(church_id,paid_by) REFERENCES app_user(church_id,id);
ALTER TABLE expense_payment ADD FOREIGN KEY(church_id,journal_id) REFERENCES journal_entry(church_id,id);
ALTER TABLE journal_entry ADD FOREIGN KEY(church_id,period_id) REFERENCES finance_period(church_id,id);
ALTER TABLE journal_entry ADD FOREIGN KEY(church_id,posted_by) REFERENCES app_user(church_id,id);
ALTER TABLE journal_entry ADD FOREIGN KEY(church_id,reversal_of) REFERENCES journal_entry(church_id,id);
ALTER TABLE journal_line ADD FOREIGN KEY(church_id,account_id) REFERENCES finance_account(church_id,id);
ALTER TABLE journal_line ADD FOREIGN KEY(church_id,fund_id) REFERENCES finance_fund(church_id,id);

ALTER TABLE finance_account ADD CHECK(kind IN ('ASSET','LIABILITY','NET_ASSETS','REVENUE','EXPENSE'));
ALTER TABLE finance_period ADD CHECK(starts_on<=ends_on);
ALTER TABLE finance_period ADD EXCLUDE USING gist (church_id WITH =, daterange(starts_on,ends_on,'[]') WITH &&);
ALTER TABLE expense_request ADD CHECK(amount BETWEEN 1 AND 999999999999), ADD CHECK(state IN ('DRAFT','IN_REVIEW','RETURNED','APPROVED','PAID','CANCELLED')), ADD CHECK(version>0 AND round>=0);
ALTER TABLE expense_submission ADD CHECK(amount BETWEEN 1 AND 999999999999);
ALTER TABLE expense_payment ADD CHECK(amount BETWEEN 1 AND 999999999999), ADD CHECK(method IN ('BANK','CASH','CARD'));
ALTER TABLE expense_approval ADD CHECK(position BETWEEN 1 AND 5), ADD CHECK(decision IN ('PENDING','APPROVED','REJECTED')), ADD CHECK((decision='PENDING')=(decided_at IS NULL));
ALTER TABLE expense_attachment ADD CHECK(size BETWEEN 1 AND 10485760), ADD CHECK(mime IN ('image/jpeg','image/png','application/pdf'));
ALTER TABLE journal_line ADD CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0));
CREATE FUNCTION protect_finance_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND (to_jsonb(OLD)-'closed_at')=(to_jsonb(NEW)-'closed_at') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Periods only close once' USING ERRCODE='23514'; END $$;
CREATE TRIGGER finance_period_protect BEFORE UPDATE OR DELETE ON finance_period FOR EACH ROW EXECUTE FUNCTION protect_finance_period();
CREATE FUNCTION protect_expense_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.decision='PENDING' AND NEW.decision IN ('APPROVED','REJECTED') AND NEW.decided_at IS NOT NULL AND (to_jsonb(OLD)-'decision'-'reason'-'decided_at')=(to_jsonb(NEW)-'decision'-'reason'-'decided_at') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Decisions cannot be rewritten' USING ERRCODE='23514'; END $$;
CREATE TRIGGER expense_approval_protect BEFORE UPDATE OR DELETE ON expense_approval FOR EACH ROW EXECUTE FUNCTION protect_expense_approval();
CREATE FUNCTION protect_expense_attachment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL AND (to_jsonb(OLD)-'removed_at')=(to_jsonb(NEW)-'removed_at') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Evidence is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER expense_attachment_protect BEFORE UPDATE OR DELETE ON expense_attachment FOR EACH ROW EXECUTE FUNCTION protect_expense_attachment();
CREATE FUNCTION protect_paid_expense() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.state IN ('PAID','CANCELLED') THEN RAISE EXCEPTION 'Final expenses are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER expense_final_protect BEFORE UPDATE OR DELETE ON expense_request FOR EACH ROW EXECUTE FUNCTION protect_paid_expense();
CREATE FUNCTION validate_journal_header() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p finance_period; BEGIN
 SELECT * INTO p FROM finance_period WHERE id=NEW.period_id AND church_id=NEW.church_id FOR SHARE;
 IF p.id IS NULL OR p.closed_at IS NOT NULL OR NEW.posted_on NOT BETWEEN p.starts_on AND p.ends_on THEN RAISE EXCEPTION 'Posting requires open period' USING ERRCODE='23514'; END IF;
 NEW.created_xid:=txid_current(); RETURN NEW; END $$;
CREATE TRIGGER journal_header_check BEFORE INSERT ON journal_entry FOR EACH ROW EXECUTE FUNCTION validate_journal_header();
CREATE FUNCTION validate_journal_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM journal_entry WHERE id=NEW.journal_id AND church_id=NEW.church_id AND created_xid=txid_current()) THEN RAISE EXCEPTION 'Posted journal cannot gain lines' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER journal_line_insert_check BEFORE INSERT ON journal_line FOR EACH ROW EXECUTE FUNCTION validate_journal_line_insert();
CREATE FUNCTION validate_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n integer; d numeric; c numeric; BEGIN
 SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0) INTO n,d,c FROM journal_line WHERE journal_id=NEW.id;
 IF n<2 OR d<>c OR d<=0 THEN RAISE EXCEPTION 'Unbalanced journal' USING ERRCODE='23514'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER journal_balance_check AFTER INSERT ON journal_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();
CREATE TRIGGER finance_account_immutable BEFORE UPDATE OR DELETE ON finance_account FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER finance_fund_immutable BEFORE UPDATE OR DELETE ON finance_fund FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER expense_submission_immutable BEFORE UPDATE OR DELETE ON expense_submission FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER expense_submission_attachment_immutable BEFORE UPDATE OR DELETE ON expense_submission_attachment FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER expense_event_immutable BEFORE UPDATE OR DELETE ON expense_event FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER expense_payment_immutable BEFORE UPDATE OR DELETE ON expense_payment FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER journal_entry_immutable BEFORE UPDATE OR DELETE ON journal_entry FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER journal_line_immutable BEFORE UPDATE OR DELETE ON journal_line FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
INSERT INTO permission(code) VALUES ('expense.read'),('expense.write'),('expense.approve'),('expense.pay'),('finance.manage'),('finance.readall'),('finance.close'),('finance.reverse');
INSERT INTO role_permission(role_id,permission_code) SELECT role_id,'finance.manage' FROM role_permission WHERE permission_code='identity.manage';

ALTER TABLE expense_request ADD COLUMN current_approver_id uuid, ADD FOREIGN KEY(church_id,current_approver_id) REFERENCES app_user(church_id,id);
