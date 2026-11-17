-- מדיניות "for all" כוללת גם select ויוצרת כפילות עם מדיניות הצפייה – מפצלים לפעולות כתיבה בלבד
drop policy po_item_costs_write on public.po_item_costs;
create policy po_item_costs_insert on public.po_item_costs for insert to authenticated
  with check ((select public.has_permission('po_manage')) and (select public.has_permission('books_view_cost')));
create policy po_item_costs_update on public.po_item_costs for update to authenticated
  using ((select public.has_permission('po_manage')) and (select public.has_permission('books_view_cost')))
  with check ((select public.has_permission('po_manage')) and (select public.has_permission('books_view_cost')));
create policy po_item_costs_delete on public.po_item_costs for delete to authenticated
  using ((select public.has_permission('po_manage')) and (select public.has_permission('books_view_cost')));

drop policy po_item_allocations_write on public.po_item_allocations;
create policy po_item_allocations_insert on public.po_item_allocations for insert to authenticated
  with check ((select public.has_permission('po_manage')));
create policy po_item_allocations_update on public.po_item_allocations for update to authenticated
  using ((select public.has_permission('po_manage'))) with check ((select public.has_permission('po_manage')));
create policy po_item_allocations_delete on public.po_item_allocations for delete to authenticated
  using ((select public.has_permission('po_manage')));
