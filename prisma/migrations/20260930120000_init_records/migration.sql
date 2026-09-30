-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "record_public_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_public_id_key" ON "projects"("public_id");

-- CreateIndex
CREATE INDEX "projects_user_id_created_at_idx" ON "projects"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint
-- Blocks two visually-identical addresses (e.g. "Foo@Bar.com" and "foo@bar.com", or one with
-- leading/trailing whitespace) from ever coexisting as distinct rows. The app lowercases and
-- trims before insert; this CHECK is the actual guarantee, not just app-level discipline.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_trimmed" CHECK (email = lower(btrim(email)));

-- CheckConstraint
-- Blocks an empty display name (NOT NULL alone would not catch '') and an unbounded one that
-- could break the dashboard layout or be used to abuse storage.
ALTER TABLE "users" ADD CONSTRAINT "users_name_length" CHECK (char_length(name) BETWEEN 1 AND 80);

-- CheckConstraint
-- Blocks an empty title (NOT NULL alone would not catch '') and an unbounded one that could
-- break a list layout or be used to abuse storage.
ALTER TABLE "projects" ADD CONSTRAINT "projects_title_length" CHECK (char_length(title) BETWEEN 1 AND 120);

-- CheckConstraint
-- public_id goes into URLs, so it must be non-empty and URL-safe (letters, digits, "_" and "-"
-- only, no spaces or slashes). The 16-character floor stops a short, guessable value from being
-- inserted by hand or by a future bug.
ALTER TABLE "projects" ADD CONSTRAINT "projects_public_id_format" CHECK (public_id ~ '^[A-Za-z0-9_-]{16,64}$');
