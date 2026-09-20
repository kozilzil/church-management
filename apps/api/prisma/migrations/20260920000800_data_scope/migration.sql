ALTER TABLE app_user ADD COLUMN scope_mode text NOT NULL DEFAULT 'NONE', ADD COLUMN member_id uuid;
UPDATE app_user SET scope_mode='ALL';
ALTER TABLE app_user ADD CONSTRAINT user_scope_mode CHECK (scope_mode IN ('ALL','ORGANIZATIONS','SELF','NONE')),
 ADD CONSTRAINT user_member_church_fk FOREIGN KEY (church_id,member_id) REFERENCES member(church_id,id);
CREATE TABLE user_scope (church_id uuid NOT NULL, user_id uuid NOT NULL, organization_id uuid NOT NULL, descendants boolean NOT NULL DEFAULT false,
 PRIMARY KEY(church_id,user_id,organization_id),
 FOREIGN KEY(church_id,user_id) REFERENCES app_user(church_id,id),
 FOREIGN KEY(church_id,organization_id) REFERENCES organization(church_id,id));
