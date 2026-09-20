-- CreateTable
CREATE TABLE "member_relation" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "related_member_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "member_relation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_relation_church_id_member_id_idx" ON "member_relation"("church_id", "member_id");

ALTER TABLE member_relation ADD FOREIGN KEY (church_id,member_id) REFERENCES member(church_id,id);
ALTER TABLE member_relation ADD FOREIGN KEY (church_id,related_member_id) REFERENCES member(church_id,id);
ALTER TABLE member_relation ADD CHECK (member_id<>related_member_id);
ALTER TABLE member_relation ADD CHECK (effective_to IS NULL OR effective_to>effective_from);
ALTER TABLE member_relation ADD CONSTRAINT relation_period_no_overlap EXCLUDE USING gist (church_id WITH =, member_id WITH =, related_member_id WITH =, relationship WITH =, daterange(effective_from,effective_to,'[)') WITH &&);
CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON member_relation FOR EACH ROW EXECUTE FUNCTION protect_period_history();
ALTER TABLE member_status_history ADD FOREIGN KEY (church_id,actor_id) REFERENCES app_user(church_id,id);
