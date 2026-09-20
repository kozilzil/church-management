-- CreateTable
CREATE TABLE "church" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',

    CONSTRAINT "church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "code" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "user_role" (
    "church_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("church_id","user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission_code" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_code")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_church_id_id_key" ON "app_user"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_church_id_username_key" ON "app_user"("church_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "role_church_id_id_key" ON "role"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "role_church_id_name_key" ON "role"("church_id", "name");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_church_id_user_id_fkey" FOREIGN KEY ("church_id", "user_id") REFERENCES "app_user"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_church_id_role_id_fkey" FOREIGN KEY ("church_id", "role_id") REFERENCES "role"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "permission"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

