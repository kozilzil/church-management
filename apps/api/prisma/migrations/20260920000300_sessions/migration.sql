-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_secret" TEXT;

-- CreateTable
CREATE TABLE "session" (
    "token_hash" TEXT NOT NULL,
    "church_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "mfa_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "session_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "login_attempt" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "roles" TEXT[],
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "correlation_id" TEXT NOT NULL,
    "fields" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "audit_event_church_id_created_at_idx" ON "audit_event"("church_id", "created_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_church_id_user_id_fkey" FOREIGN KEY ("church_id", "user_id") REFERENCES "app_user"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

