-- assert_can_grant נקראת רק מתוך הטריגרים (security definer) – לא צריכה להיות חשופה ב-API
revoke execute on function public.assert_can_grant(jsonb) from authenticated;
