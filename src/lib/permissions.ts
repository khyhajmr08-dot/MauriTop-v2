export type StaffRole = 'user' | 'support' | 'orders' | 'finance' | 'catalog' | 'content' | 'analytics';

export type StaffPermission =
  | 'view_dashboard'
  | 'manage_orders'
  | 'manage_finance'
  | 'export_data'
  | 'view_analytics'
  | 'manage_services'
  | 'manage_content'
  | 'manage_support'
  | 'manage_users'
  | 'manage_settings';

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
    descAr: 'متابعة استفسارات العملاء والدعم المصرح به',
    descFr: 'Gestion des demandes clients et support autorisé',
    permissions: ['view_dashboard', 'manage_support', 'manage_orders']
  },
  orders: {
    id: 'orders',
    nameAr: 'معالجة الطلبات',
    nameFr: 'Gestionnaire des commandes',
    descAr: 'متابعة الطلبات وتحديث حالاتها والتحقق من الإيصالات',
    descFr: 'Suivi des commandes, mise à jour des statuts et vérification des reçus',
    permissions: ['view_dashboard', 'manage_orders']
  },
  finance: {
    id: 'finance',
    nameAr: 'الإدارة المالية',
    nameFr: 'Finances',
    descAr: 'صلاحيات مالية وتقارير محددة حسب دور الموظف',
    descFr: 'Accès aux fonctions financières et rapports autorisés',
    permissions: ['view_dashboard', 'manage_finance', 'export_data', 'view_analytics']
  },
  catalog: {
    id: 'catalog',
    nameAr: 'إدارة الخدمات والكتالوج',
    nameFr: 'Catalogue des services',
    descAr: 'إدارة الخدمات والأسعار والباقات والتوفر',
    descFr: 'Gestion des services, tarifs, forfaits et disponibilité',
    permissions: ['view_dashboard', 'manage_services']
  },
  content: {
    id: 'content',
    nameAr: 'إدارة المحتوى والإعلانات',
    nameFr: 'Contenu & Annonces',
    descAr: 'إدارة المحتوى والإعلانات المنشورة',
    descFr: 'Gestion du contenu et des annonces publiées',
    permissions: ['view_dashboard', 'manage_content']
  },
  analytics: {
    id: 'analytics',
    nameAr: 'التحليلات والتقارير',
    nameFr: 'Analyses & Rapports',
    descAr: 'عرض مؤشرات الأداء والتقارير المصرح بها',
    descFr: 'Consultation des indicateurs et rapports autorisés',
    permissions: ['view_dashboard', 'view_analytics', 'export_data']
  }
};

export function hasStaffPermission(role: StaffRole | string | undefined, permission: StaffPermission): boolean {
  if (!role || !(role in STAFF_ROLES)) return false;
  return STAFF_ROLES[role as StaffRole].permissions.includes(permission);
}

export function isStaffMember(role: StaffRole | string | undefined): boolean {
  return !!role && role !== 'user' && role in STAFF_ROLES;
}
