-- ח4: מייל אישור אחד לכל הזמנה מהקישור (מונע כפילות כשהדף שולח פעמיים)
create unique index email_outbox_order_confirm_once on public.email_outbox (order_id) where kind = 'order_confirm';
