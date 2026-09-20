-- CreateTable
CREATE TABLE "member_status" (
    "church_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "allowed_next" TEXT[],

    CONSTRAINT "member_status_pkey" PRIMARY KEY ("church_id","code")
);

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "member_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "phone" TEXT,
    "normalized_phone" TEXT,
    "address" TEXT,
    "registered_on" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_status_history" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_membership" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "representative" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "household_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_type" (
    "church_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "organization_type_pkey" PRIMARY KEY ("church_id","code")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parent_id" UUID,
    "closed_on" DATE,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_membership" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "organization_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "allow_concurrent" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_appointment" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "organization_id" UUID,
    "position_name" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "position_appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_church_id_normalized_name_id_idx" ON "member"("church_id", "normalized_name", "id");

-- CreateIndex
CREATE INDEX "member_church_id_normalized_phone_idx" ON "member"("church_id", "normalized_phone");

-- CreateIndex
CREATE UNIQUE INDEX "member_church_id_id_key" ON "member"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "member_church_id_member_number_key" ON "member"("church_id", "member_number");

-- CreateIndex
CREATE INDEX "member_status_history_church_id_member_id_effective_from_idx" ON "member_status_history"("church_id", "member_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "household_church_id_id_key" ON "household"("church_id", "id");

-- CreateIndex
CREATE INDEX "household_membership_church_id_household_id_effective_from_idx" ON "household_membership"("church_id", "household_id", "effective_from");

-- CreateIndex
CREATE INDEX "household_membership_church_id_member_id_idx" ON "household_membership"("church_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_church_id_id_key" ON "organization"("church_id", "id");

-- CreateIndex
CREATE INDEX "organization_membership_church_id_member_id_idx" ON "organization_membership"("church_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_church_id_id_key" ON "position"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "position_church_id_name_key" ON "position"("church_id", "name");

-- CreateIndex
CREATE INDEX "position_appointment_church_id_member_id_idx" ON "position_appointment"("church_id", "member_id");


-- Church and aggregate boundaries are also enforced for direct database writes.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "member_status" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "member" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "member_status_history" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "household" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "household_membership" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "organization_type" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "organization" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "organization_membership" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "position" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "position_appointment" ADD FOREIGN KEY (church_id) REFERENCES church(id) ON DELETE RESTRICT;
ALTER TABLE "member_status_history" ADD FOREIGN KEY (church_id, member_id) REFERENCES member(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "household_membership" ADD FOREIGN KEY (church_id, member_id) REFERENCES member(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "organization_membership" ADD FOREIGN KEY (church_id, member_id) REFERENCES member(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "position_appointment" ADD FOREIGN KEY (church_id, member_id) REFERENCES member(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "household_membership" ADD FOREIGN KEY (church_id,household_id) REFERENCES "household"(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "organization" ADD FOREIGN KEY (church_id,parent_id) REFERENCES "organization"(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "organization_membership" ADD FOREIGN KEY (church_id,organization_id) REFERENCES "organization"(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "position_appointment" ADD FOREIGN KEY (church_id,position_id) REFERENCES "position"(church_id,id) ON DELETE RESTRICT;
ALTER TABLE "position_appointment" ADD FOREIGN KEY (church_id,organization_id) REFERENCES "organization"(church_id,id) ON DELETE RESTRICT;
ALTER TABLE member ADD FOREIGN KEY (church_id,status) REFERENCES member_status(church_id,code);
ALTER TABLE organization ADD FOREIGN KEY (church_id,type) REFERENCES organization_type(church_id,code);
ALTER TABLE "household_membership" ADD CHECK (effective_to IS NULL OR effective_to > effective_from);
ALTER TABLE "organization_membership" ADD CHECK (effective_to IS NULL OR effective_to > effective_from);
ALTER TABLE "position_appointment" ADD CHECK (effective_to IS NULL OR effective_to > effective_from);
ALTER TABLE household_membership ADD CONSTRAINT household_period_no_overlap EXCLUDE USING gist (church_id WITH =, member_id WITH =, daterange(effective_from,effective_to,'[)') WITH &&);
CREATE UNIQUE INDEX household_one_representative ON household_membership(church_id,household_id) WHERE representative AND effective_to IS NULL;
ALTER TABLE household_membership ADD CHECK (NOT representative OR effective_to IS NULL);
ALTER TABLE organization_membership ADD CONSTRAINT organization_period_no_overlap EXCLUDE USING gist (church_id WITH =, member_id WITH =, organization_id WITH =, daterange(effective_from,effective_to,'[)') WITH &&);
ALTER TABLE organization_membership ADD CONSTRAINT primary_organization_no_overlap EXCLUDE USING gist (church_id WITH =, member_id WITH =, daterange(effective_from,effective_to,'[)') WITH &&) WHERE ("primary");
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'History is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_event FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER status_history_immutable BEFORE UPDATE OR DELETE ON member_status_history FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_period_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'History deletion denied' USING ERRCODE='23514'; END IF;
 IF OLD.effective_to IS NOT NULL OR (to_jsonb(NEW) - 'effective_to' - 'representative') IS DISTINCT FROM (to_jsonb(OLD) - 'effective_to' - 'representative') THEN
 RAISE EXCEPTION 'Historical fields are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON household_membership FOR EACH ROW EXECUTE FUNCTION protect_period_history();
CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON organization_membership FOR EACH ROW EXECUTE FUNCTION protect_period_history();
CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON position_appointment FOR EACH ROW EXECUTE FUNCTION protect_period_history();
CREATE FUNCTION check_appointment_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allow_duplicates boolean;
BEGIN
 SELECT allow_concurrent INTO allow_duplicates FROM position WHERE id=NEW.position_id AND church_id=NEW.church_id FOR UPDATE;
 IF NOT allow_duplicates AND EXISTS (SELECT 1 FROM position_appointment WHERE church_id=NEW.church_id AND member_id=NEW.member_id AND position_id=NEW.position_id AND id<>NEW.id AND daterange(effective_from,effective_to,'[)') && daterange(NEW.effective_from,NEW.effective_to,'[)')) THEN
 RAISE EXCEPTION 'Concurrent appointment denied' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER appointment_policy BEFORE INSERT ON position_appointment FOR EACH ROW EXECUTE FUNCTION check_appointment_policy();
