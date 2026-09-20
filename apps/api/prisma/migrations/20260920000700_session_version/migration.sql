-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "auth_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "auth_version" INTEGER NOT NULL DEFAULT 0;

