CREATE TABLE budget_revision (
  id UUID NOT NULL PRIMARY KEY,
  church_id UUID NOT NULL REFERENCES church(id),
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 9999),
  account_id UUID NOT NULL,
  fund_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  amount DECIMAL(15,0) NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 300),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT budget_revision_church_id_year_account_id_fund_id_version_key UNIQUE(church_id, year, account_id, fund_id, version),
  FOREIGN KEY(church_id,account_id) REFERENCES finance_account(church_id,id),
  FOREIGN KEY(church_id,fund_id) REFERENCES finance_fund(church_id,id),
  FOREIGN KEY(church_id,created_by) REFERENCES app_user(church_id,id)
);
CREATE FUNCTION validate_budget_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_version integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM finance_account WHERE church_id=NEW.church_id AND id=NEW.account_id AND kind='EXPENSE') THEN
    RAISE EXCEPTION 'Budget requires expense account' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(max(version),0) INTO previous_version FROM budget_revision
    WHERE church_id=NEW.church_id AND year=NEW.year AND account_id=NEW.account_id AND fund_id=NEW.fund_id;
  IF NEW.version <> previous_version+1 THEN
    RAISE EXCEPTION 'Budget revision must be sequential' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER budget_revision_validate BEFORE INSERT ON budget_revision FOR EACH ROW EXECUTE FUNCTION validate_budget_revision();
CREATE TRIGGER budget_revision_immutable BEFORE UPDATE OR DELETE ON budget_revision FOR EACH ROW EXECUTE FUNCTION prevent_operation_history_change();
INSERT INTO permission(code) VALUES ('budget.read'),('budget.write') ON CONFLICT DO NOTHING;
