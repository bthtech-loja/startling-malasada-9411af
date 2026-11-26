import { date, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const campaignQuota = pgTable('campaign_quota', {
  id: integer('id').primaryKey(),
  day: date('quota_day').notNull(),
  reserved: integer('reserved').notNull().default(0),
  sent: integer('sent').notNull().default(0),
  nextSendAt: timestamp('next_send_at', { withTimezone: true }).notNull().defaultNow(),
  reservationId: uuid('reservation_id'),
});
