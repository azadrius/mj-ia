CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"kind" text NOT NULL,
	"detail" text NOT NULL,
	"characters" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "audio" jsonb;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;