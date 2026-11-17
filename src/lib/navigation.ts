import {
  BarChart3,
  BookOpen,
  Boxes,
  CalendarRange,
  ClipboardList,
  Home,
  PackageCheck,
  PackageOpen,
  School,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

// =====================================================================
// המסכים של המערכת (סעיף 19 באפיון). כל מסך קשור להרשאת צפייה:
// מותר → מוצג, חסום → מוצג עם מנעול, מוסתר → לא מופיע בתפריט.
// ready=false → המסך עוד לא נבנה ("בקרוב").
// =====================================================================

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** הרשאה (אחת מהן מספיקה) */
  perm: string | string[];
  ready: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'מסך ראשי', icon: Home, perm: 'dashboard_view', ready: true },
  { href: '/years', label: 'שנות לימודים', icon: CalendarRange, perm: 'years_view', ready: false },
  { href: '/institutions', label: 'מוסדות', icon: School, perm: 'institutions_view', ready: false },
  { href: '/classes', label: 'כיתות ורשימות', icon: ClipboardList, perm: 'classes_view', ready: false },
  { href: '/books', label: 'קטלוג ספרים', icon: BookOpen, perm: 'books_view', ready: false },
  { href: '/suppliers', label: 'ספקים', icon: Boxes, perm: 'suppliers_view', ready: false },
  { href: '/customers', label: 'לקוחות', icon: Users, perm: 'customers_view', ready: false },
  { href: '/orders', label: 'הזמנות', icon: ShoppingCart, perm: 'orders_view', ready: false },
  { href: '/purchase-orders', label: 'הזמנות רכש', icon: PackageOpen, perm: 'po_view', ready: false },
  { href: '/receiving', label: 'קליטת סחורה', icon: PackageCheck, perm: 'receiving_do', ready: false },
  { href: '/inventory', label: 'מלאי וחוסרים', icon: Warehouse, perm: 'inventory_view', ready: false },
  { href: '/bags', label: 'הכנת שקיות', icon: ShoppingBag, perm: ['picking_do', 'bags_check'], ready: false },
  { href: '/shipments', label: 'משלוחים ואיסופים', icon: Truck, perm: ['shipments_view', 'pickups_do'], ready: false },
  { href: '/finance', label: 'כספים והוצאות', icon: Wallet, perm: 'finance_view', ready: false },
  { href: '/reports', label: 'דוחות', icon: BarChart3, perm: 'reports_view', ready: false },
  {
    href: '/settings',
    label: 'הגדרות והרשאות',
    icon: Settings,
    perm: ['users_manage', 'roles_manage', 'audit_view', 'settings_manage'],
    ready: true,
  },
];
