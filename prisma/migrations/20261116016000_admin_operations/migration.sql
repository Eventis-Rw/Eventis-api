ALTER TABLE love_profile_photos ADD COLUMN moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved', ADD COLUMN moderation_reason VARCHAR(500), ADD COLUMN reviewed_by UUID, ADD COLUMN reviewed_at TIMESTAMPTZ;
-- Preserve existing published photos; new submissions enter the review queue.
ALTER TABLE love_profile_photos ALTER COLUMN moderation_status SET DEFAULT 'pending';
CREATE TABLE admin_support_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), report_id UUID NOT NULL REFERENCES support_reports(id) ON DELETE CASCADE ON UPDATE CASCADE,
 actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE, actor_name VARCHAR(160) NOT NULL, content TEXT NOT NULL,
 internal BOOLEAN NOT NULL DEFAULT false, request_id UUID NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_support_messages_report_id_created_at_idx ON admin_support_messages(report_id, created_at);
CREATE TABLE admin_notification_templates (id VARCHAR(80) PRIMARY KEY, name VARCHAR(160) NOT NULL, trigger VARCHAR(120) NOT NULL, audience VARCHAR(120) NOT NULL, channels TEXT[] NOT NULL, content TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'draft');
INSERT INTO admin_notification_templates(id,name,trigger,audience,channels,content) VALUES
 ('membership_expiry','Membership expiry','Before membership expiry','Active FindLove members',ARRAY['In-app'],'Hello {user_name}, your {plan_title} membership expires on {due_date}.'),
 ('verification_result','Verification result','After an identity review','Reviewed FindLove members',ARRAY['In-app'],'Hello {user_name}, your verification result is ready. Open FindLove for details.'),
 ('safety_update','Safety update','After a safety review','Affected FindLove members',ARRAY['In-app'],'Hello {user_name}, your report has been reviewed. Open FindLove for details.');
