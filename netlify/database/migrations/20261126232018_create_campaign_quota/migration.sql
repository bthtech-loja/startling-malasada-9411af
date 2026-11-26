CREATE TABLE "campaign_quota" (
	"id" integer PRIMARY KEY,
	"quota_day" date NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"next_send_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reservation_id" uuid
);
