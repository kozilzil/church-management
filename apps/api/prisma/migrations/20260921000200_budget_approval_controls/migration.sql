-- Existing requests/submissions keep NULL: their intended budget year is unknown.
ALTER TABLE expense_request ADD COLUMN budget_year integer CHECK (budget_year BETWEEN 1900 AND 9999);
ALTER TABLE expense_submission ADD COLUMN budget_year integer CHECK (budget_year BETWEEN 1900 AND 9999);
CREATE INDEX expense_budget_commitment_idx ON expense_request(church_id,budget_year,account_id,fund_id) WHERE state IN ('IN_REVIEW','APPROVED');
CREATE TABLE budget_change (
 id uuid PRIMARY KEY, church_id uuid NOT NULL REFERENCES church(id),
 year integer NOT NULL CHECK(year BETWEEN 1900 AND 9999), account_id uuid NOT NULL, fund_id uuid NOT NULL,
 base_version integer NOT NULL CHECK(base_version BETWEEN 0 AND 2147483646),
 amount decimal(15,0) NOT NULL CHECK(amount>=0), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 300),
 requested_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(church_id,id),
 FOREIGN KEY(church_id,account_id) REFERENCES finance_account(church_id,id),
 FOREIGN KEY(church_id,fund_id) REFERENCES finance_fund(church_id,id),
 FOREIGN KEY(church_id,requested_by) REFERENCES app_user(church_id,id)
);
CREATE INDEX budget_change_church_id_year_created_at_id_idx ON budget_change(church_id,year,created_at,id);
CREATE TABLE budget_decision (
 change_id uuid PRIMARY KEY, church_id uuid NOT NULL REFERENCES church(id), UNIQUE(church_id,change_id),
 decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED','CANCELLED')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 300), decided_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(church_id,change_id) REFERENCES budget_change(church_id,id),
 FOREIGN KEY(church_id,decided_by) REFERENCES app_user(church_id,id)
);
ALTER TABLE budget_revision ADD COLUMN change_id uuid UNIQUE,
 ADD FOREIGN KEY(church_id,change_id) REFERENCES budget_change(church_id,id);
CREATE TABLE budget_policy_revision (
 id uuid PRIMARY KEY, church_id uuid NOT NULL REFERENCES church(id), version integer NOT NULL CHECK(version>0),
 mode text NOT NULL CHECK(mode IN ('WARN','BLOCK')), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 300),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(church_id,version), FOREIGN KEY(church_id,created_by) REFERENCES app_user(church_id,id)
);
CREATE TABLE expense_budget_check (
 id uuid PRIMARY KEY, church_id uuid NOT NULL REFERENCES church(id), request_id uuid NOT NULL,
 request_version integer NOT NULL CHECK(request_version>0), actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('SUBMIT','APPROVE','PAY')),
 year integer CHECK(year BETWEEN 1900 AND 9999), mode text NOT NULL CHECK(mode IN ('WARN','BLOCK')),
 status text NOT NULL CHECK(status IN ('WITHIN','UNBUDGETED','EXCEEDED','LEGACY_YEAR')),
 budget_version integer NOT NULL CHECK(budget_version>=0), policy_version integer NOT NULL CHECK(policy_version>=0),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(church_id,request_id) REFERENCES expense_request(church_id,id),
 FOREIGN KEY(church_id,actor_id) REFERENCES app_user(church_id,id)
);
CREATE INDEX expense_budget_check_church_id_request_id_created_at_idx ON expense_budget_check(church_id,request_id,created_at);
CREATE TRIGGER budget_change_immutable BEFORE UPDATE OR DELETE ON budget_change FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER budget_decision_immutable BEFORE UPDATE OR DELETE ON budget_decision FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER budget_policy_immutable BEFORE UPDATE OR DELETE ON budget_policy_revision FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE TRIGGER expense_budget_check_immutable BEFORE UPDATE OR DELETE ON expense_budget_check FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
CREATE FUNCTION validate_budget_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM finance_account WHERE church_id=NEW.church_id AND id=NEW.account_id AND kind='EXPENSE') THEN
  RAISE EXCEPTION 'Budget requires expense account' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(max(version),0) INTO v FROM budget_revision WHERE church_id=NEW.church_id AND year=NEW.year AND account_id=NEW.account_id AND fund_id=NEW.fund_id;
 IF v<>NEW.base_version OR EXISTS(SELECT 1 FROM budget_change c WHERE c.church_id=NEW.church_id AND c.year=NEW.year AND c.account_id=NEW.account_id AND c.fund_id=NEW.fund_id AND NOT EXISTS(SELECT 1 FROM budget_decision d WHERE d.change_id=c.id)) THEN
  RAISE EXCEPTION 'Stale or pending budget change' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_change_validate BEFORE INSERT ON budget_change FOR EACH ROW EXECUTE FUNCTION validate_budget_change();
CREATE FUNCTION validate_budget_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c budget_change;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text,0));
 SELECT * INTO c FROM budget_change WHERE church_id=NEW.church_id AND id=NEW.change_id;
 IF c.id IS NULL OR (NEW.decision='CANCELLED' AND c.requested_by<>NEW.decided_by) OR (NEW.decision<>'CANCELLED' AND c.requested_by=NEW.decided_by) THEN
  RAISE EXCEPTION 'Independent budget decision required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_decision_validate BEFORE INSERT ON budget_decision FOR EACH ROW EXECUTE FUNCTION validate_budget_decision();
CREATE FUNCTION require_budget_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM budget_change c JOIN budget_decision d ON d.change_id=c.id AND d.church_id=c.church_id
  WHERE c.id=NEW.change_id AND c.church_id=NEW.church_id AND d.decision='APPROVED'
   AND c.year=NEW.year AND c.account_id=NEW.account_id AND c.fund_id=NEW.fund_id
   AND c.base_version+1=NEW.version AND c.amount=NEW.amount AND c.reason=NEW.reason AND c.requested_by=NEW.created_by) THEN
  RAISE EXCEPTION 'Matching approved budget change required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_revision_approval BEFORE INSERT ON budget_revision FOR EACH ROW EXECUTE FUNCTION require_budget_approval();
CREATE FUNCTION budget_decision_applied() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.decision='APPROVED' AND NOT EXISTS(SELECT 1 FROM budget_revision WHERE change_id=NEW.change_id AND church_id=NEW.church_id) THEN
  RAISE EXCEPTION 'Approved change must create a revision atomically' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER budget_decision_applied AFTER INSERT ON budget_decision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION budget_decision_applied();
CREATE FUNCTION validate_budget_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text,0));
 SELECT COALESCE(max(version),0) INTO v FROM budget_policy_revision WHERE church_id=NEW.church_id;
 IF NEW.version<>v+1 THEN RAISE EXCEPTION 'Policy version must be sequential' USING ERRCODE='23514'; END IF;
 IF NEW.mode='BLOCK' AND EXISTS(SELECT 1 FROM expense_request WHERE church_id=NEW.church_id AND budget_year IS NULL AND state IN ('IN_REVIEW','APPROVED')) THEN
  RAISE EXCEPTION 'Resolve legacy requests before blocking' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_policy_validate BEFORE INSERT ON budget_policy_revision FOR EACH ROW EXECUTE FUNCTION validate_budget_policy();
INSERT INTO permission(code) VALUES ('budget.approve') ON CONFLICT DO NOTHING;
