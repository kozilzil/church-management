-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "totp_last_counter" INTEGER NOT NULL DEFAULT -1;


-- Enforce hierarchy invariants for writes outside the application as well.
CREATE FUNCTION reject_organization_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text,0));
 IF NEW.parent_id=NEW.id OR EXISTS (
   WITH RECURSIVE ancestors AS (
     SELECT id,parent_id FROM organization WHERE church_id=NEW.church_id AND id=NEW.parent_id
     UNION
     SELECT p.id,p.parent_id FROM organization p JOIN ancestors a ON p.id=a.parent_id WHERE p.church_id=NEW.church_id
   ) SELECT 1 FROM ancestors WHERE id=NEW.id
 ) THEN RAISE EXCEPTION 'Organization cycle denied' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER organization_no_cycle BEFORE INSERT OR UPDATE OF parent_id ON organization FOR EACH ROW EXECUTE FUNCTION reject_organization_cycle();
