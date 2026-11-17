-- אימייל בפרופיל (לתצוגה במסך המשתמשים; ההתחברות עצמה לפי auth.users)
alter table public.user_profiles add column email text;
update public.user_profiles p set email = u.email from auth.users u where u.id = p.id;

-- ברירות מחדל לתפקידים (אפשר לשנות מהמסך "הגדרות והרשאות").
-- מנהל: כל המערכת חוץ מניהול משתמשים/תפקידים/הגדרות; עובד: מסכי המחסן.
update public.roles set permissions = '{
  "dashboard_view":"allowed","audit_view":"allowed",
  "years_view":"allowed","years_manage":"allowed","years_copy":"allowed",
  "institutions_view":"allowed","institutions_create":"allowed","institutions_edit":"allowed","institutions_delete":"allowed","institutions_copy":"allowed",
  "classes_view":"allowed","classes_manage":"allowed","classes_copy":"allowed",
  "books_view":"allowed","books_manage":"allowed","books_view_cost":"allowed",
  "suppliers_view":"allowed","suppliers_manage":"allowed",
  "customers_view":"allowed","customers_create":"allowed","customers_edit":"allowed","customers_delete":"allowed","customers_view_contact":"allowed","customers_view_private":"locked",
  "orders_view":"allowed","orders_create":"allowed","orders_edit":"allowed","orders_cancel":"allowed","orders_cancel_late":"locked","orders_copy":"allowed","orders_discount":"allowed",
  "po_view":"allowed","po_manage":"allowed","po_close":"allowed",
  "receiving_do":"allowed","inventory_view":"allowed","inventory_adjust":"allowed",
  "picking_do":"allowed","bags_check":"allowed","labels_print":"allowed",
  "shipments_view":"allowed","shipments_manage":"allowed","pickups_do":"allowed",
  "finance_view":"allowed","payments_record":"allowed","payments_refund":"locked","expenses_manage":"allowed","supplier_payments_manage":"allowed",
  "reports_view":"allowed","export_excel":"allowed",
  "users_manage":"locked","roles_manage":"locked","settings_manage":"locked"
}'::jsonb
where name = 'מנהל' and not is_super;

update public.roles set permissions = '{
  "dashboard_view":"locked",
  "orders_view":"allowed","customers_view":"allowed",
  "po_view":"allowed","receiving_do":"allowed","inventory_view":"allowed",
  "picking_do":"allowed","bags_check":"allowed","labels_print":"allowed",
  "shipments_view":"allowed","pickups_do":"allowed",
  "finance_view":"locked","books_view_cost":"locked","customers_view_contact":"locked"
}'::jsonb
where name = 'עובד' and not is_super;
