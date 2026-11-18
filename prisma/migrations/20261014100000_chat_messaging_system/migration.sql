CREATE TYPE "conversation_type" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "message_type" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'VOICE');
CREATE TYPE "receipt_status" AS ENUM ('SENT', 'DELIVERED', 'READ');
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "call_type" AS ENUM ('VOICE', 'VIDEO');
CREATE TYPE "call_status" AS ENUM ('INITIATED', 'RINGING', 'ACCEPTED', 'REJECTED', 'MISSED', 'ENDED', 'CANCELLED');

CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "conversation_type" NOT NULL DEFAULT 'DIRECT',
    "title" VARCHAR(120),
    "direct_pair_key" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMPTZ(6),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "type" "message_type" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "reply_to_id" UUID,
    "client_message_id" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "status" "receipt_status" NOT NULL DEFAULT 'SENT',
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inviter_id" UUID NOT NULL,
    "phone_number" VARCHAR(30) NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "caller_id" UUID NOT NULL,
    "type" "call_type" NOT NULL,
    "status" "call_status" NOT NULL DEFAULT 'INITIATED',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_direct_pair_key_key" ON "conversations"("direct_pair_key");
CREATE INDEX "conversations_updated_idx" ON "conversations"("updated_at");
CREATE UNIQUE INDEX "conversation_participants_unique" ON "conversation_participants"("conversation_id", "user_id");
CREATE INDEX "conversation_participants_user_idx" ON "conversation_participants"("user_id", "conversation_id");
CREATE UNIQUE INDEX "messages_sender_client_id_key" ON "messages"("sender_id", "client_message_id");
CREATE INDEX "messages_conversation_created_idx" ON "messages"("conversation_id", "created_at", "id");
CREATE INDEX "messages_sender_created_idx" ON "messages"("sender_id", "created_at");
CREATE INDEX "message_attachments_message_idx" ON "message_attachments"("message_id");
CREATE UNIQUE INDEX "message_receipts_unique" ON "message_receipts"("message_id", "participant_id");
CREATE INDEX "message_receipts_participant_status_idx" ON "message_receipts"("participant_id", "status");
CREATE UNIQUE INDEX "chat_invitations_token_hash_key" ON "chat_invitations"("token_hash");
CREATE INDEX "chat_invitations_inviter_status_idx" ON "chat_invitations"("inviter_id", "status");
CREATE INDEX "chat_invitations_phone_idx" ON "chat_invitations"("phone_number");
CREATE INDEX "calls_conversation_started_idx" ON "calls"("conversation_id", "started_at");
CREATE INDEX "calls_caller_started_idx" ON "calls"("caller_id", "started_at");

ALTER TABLE "conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey"
    FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_receipts"
    ADD CONSTRAINT "message_receipts_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_receipts"
    ADD CONSTRAINT "message_receipts_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "conversation_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_invitations"
    ADD CONSTRAINT "chat_invitations_inviter_id_fkey"
    FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calls"
    ADD CONSTRAINT "calls_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calls"
    ADD CONSTRAINT "calls_caller_id_fkey"
    FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
