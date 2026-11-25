ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_theme" varchar(6) DEFAULT 'system' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "preferred_theme" = 'system' WHERE "preferred_theme" IS NULL OR "preferred_theme" NOT IN ('light', 'dark', 'system');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferred_theme" TYPE varchar(6);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferred_theme" SET DEFAULT 'system';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferred_theme" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_preferred_theme') THEN
    ALTER TABLE "users" ADD CONSTRAINT "chk_users_preferred_theme" CHECK ("users"."preferred_theme" in ('light', 'dark', 'system'));
  END IF;
END $$;
