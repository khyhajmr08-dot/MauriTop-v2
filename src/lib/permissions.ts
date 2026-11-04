export type StaffRole = 'user' | 'support' | 'orders' | 'finance' | 'catalog' | 'content' | 'analytics';

export type StaffPermission =
  | 'view_orders'
  | 'update_orders'
  | 'view_finance'
  | 'manage_finance'
  | 'manage_catalog'
  | 'manage_content'
  | 'view_analytics'
  | 'view_support'
  | 'manage_support';

export interface StaffRoleDefinition {
  id: StaffRole;
  nameAr: string;
  nameFr: string;
  descAr: string;
  descFr: string;
  permissions: StaffPermission[];
}

export const STAFF_ROLES: Record<StaffRole, StaffRoleDefinition> = {
  user: {
    id: 'user',
    nameAr: 'مستخدم عادي',
    nameFr: 'Utilisateur',
    descAr: 'صلاحيات قياسية لتصفح الخدمات وتقديم الطلبات',
    descFr: 'Permissions standard pour parcourir et commander',
    permissions: []
  },
  support: {
    id: 'support',
    nameAr: 'فريق الدعم الفني',
    nameFr: 'Support client',
    descAr: 'الرد على استفسارات العملاء والمحادثات ومتابعة المشكلات',
    descFr: 'Gestion des réclamations clients et support en direct',
    permissions: ['view_support', 'manage_support', 'view_orders']
  },
  orders: {
    id: 'orders',
    nameAr: 'معالجة الطلبات',
    nameFr: 'Gestionnaire des commandes',
    descAr: 'متابعة الطلبات، تحديث الحالات، والتحقق من إيصالات الدفع',
    descFr: 'Suivi et validation des commandes et reçus de paiement',
    permissions: ['view_orders', 'update_orders', 'view_support']
  },
  finance: {
    id: 'finance',
    nameAr: 'الإدارة المالية',
    nameFr: 'Finances',
    descAr: 'مراجعة المعاملات، أرصدة المحافظ، وطلبات السحب',
    descFr: 'Validation des transactions, soldes et demandes de retrait',
    permissions: ['view_finance', 'manage_finance', 'view_orders']
  },
  catalog: {
    id: 'catalog',
    nameAr: 'إدارة الخدمات والكتالوج',
    nameFr: 'Catalogue des services',
    descAr: 'تحديث أسعار الخدمات وباقاتها وتوفرها',
    descFr: 'Gestion des tarifs, packages et disponibilité des services',
    permissions: ['manage_catalog']
  },
  content: {
    id: 'content',
    nameAr: 'إدارة المحتوى والإعلانات',
    nameFr: 'Contenu & Annonces',
    descAr: 'إدارة الإعلانات، الأسئلة الشائعة، والمنشورات الترويجية',
    descFr: 'Mise à jour des bannières, FAQ et annonces',
    permissions: ['manage_content']
  },
  analytics: {
    id: 'analytics',
    nameAr: 'التحليلات والتقارير',
    nameFr: 'Analyses & Rapports',
    descAr: 'متابعة الزيارات، مؤشرات الأداء، وتقارير المبيعات',
    descFr: 'Consultation des métriques, trafic et ventes',
    permissions: ['view_analytics']
  }
};

export function hasStaffPermission(role: StaffRole | string | undefined, permission: StaffPermission): boolean {
  if (!role || !(role in STAFF_ROLES)) return false;
  return STAFF_ROLES[role as StaffRole].permissions.includes(permission);
}

export function isStaffMember(role: StaffRole | string | undefined): boolean {
  return !!role && role !== 'user' && role in STAFF_ROLES;
}
