/** הודעת שגיאה מהמסד בעברית (טריגרי ההגנה והפונקציות כבר מחזירים עברית) */
export function dbErrorMessage(message: string): string {
  if (/row-level security|permission denied/i.test(message)) return 'אין לך הרשאה לפעולה זו.';
  if (/duplicate key.*roles_name/i.test(message)) return 'כבר קיים תפקיד בשם הזה.';
  if (/duplicate key.*academic_years_name/i.test(message)) return 'כבר קיימת שנה בשם הזה.';
  if (/duplicate key.*institutions_number/i.test(message)) return 'מספר המוסד הזה כבר קיים.';
  if (/duplicate key.*institution_years_institution_id_year_id/i.test(message)) return 'המוסד כבר קיים בשנה הזו.';
  if (/duplicate key.*classes_institution_year_id_name/i.test(message)) return 'כבר קיימת כיתה בשם הזה במוסד.';
  if (/duplicate key.*class_books_class_id_book_id/i.test(message)) return 'הספר כבר נמצא ברשימה של הכיתה.';
  if (/duplicate key.*books_code/i.test(message)) return 'קוד הספר הזה כבר קיים בקטלוג.';
  if (/duplicate key.*suppliers_number/i.test(message)) return 'מספר הספק הזה כבר קיים.';
  if (/duplicate key.*book_suppliers_book_id_supplier_id/i.test(message)) return 'הספק כבר משויך לספר הזה.';
  if (/duplicate key.*customers_number/i.test(message)) return 'מספר הלקוח הזה כבר קיים.';
  if (/duplicate key/i.test(message)) return 'הרשומה כבר קיימת.';
  if (/foreign key.*user_profiles_role_id/i.test(message)) return 'יש משתמשים בתפקיד הזה – יש להעביר אותם קודם.';
  if (/foreign key.*class_books_book_id/i.test(message)) return 'הספר מופיע ברשימות של כיתות – אי אפשר למחוק אותו (אפשר לסמן אותו כלא פעיל).';
  if (/foreign key.*institution_years_year_id/i.test(message)) return 'יש מוסדות בשנה הזו – אי אפשר למחוק אותה.';
  if (/foreign key/i.test(message)) return 'יש רשומות שקשורות לרשומה הזו – אי אפשר למחוק אותה.';
  if (/check constraint/i.test(message)) return 'אחד הערכים לא תקין (למשל מספר שלילי או שדה חובה ריק).';
  return message;
}
