CREATE OR REPLACE FUNCTION check_hometax_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 -- Use the same church transaction lock as application writes; immutable tables do not grant UPDATE.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM receipt_claim WHERE hometax_item_id=NEW.item_id AND church_id=NEW.church_id) THEN
  RAISE EXCEPTION 'Hometax item is no longer reserved' USING ERRCODE='23514'; END IF;
 IF NEW.state='CANCELLED' THEN
  IF NOT EXISTS(SELECT 1 FROM hometax_result WHERE item_id=NEW.item_id AND state='ISSUED') OR EXISTS(SELECT 1 FROM hometax_result WHERE item_id=NEW.item_id AND state IN ('NOT_ISSUED','CANCELLED')) THEN
   RAISE EXCEPTION 'Cancellation requires an issued item' USING ERRCODE='23514'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM hometax_result WHERE item_id=NEW.item_id) THEN RAISE EXCEPTION 'Hometax outcome already recorded' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW; END $$;
