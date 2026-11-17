/** הודעת שגיאה מהמסד בעברית (טריגרי ההגנה כבר מחזירים עברית) */
export function friendlyDbError(message: string): string {
  if (/row-level security/i.test(message)) return 'אין לך הרשאה לפעולה זו.';
  if (/duplicate key.*roles_name/i.test(message)) return 'כבר קיים תפקיד בשם הזה.';
  if (/duplicate key/i.test(message)) return 'הרשומה כבר קיימת.';
  if (/foreign key.*user_profiles_role_id/i.test(message)) return 'יש משתמשים בתפקיד הזה – יש להעביר אותם קודם.';
  return message;
}
