import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { STAFF_ROLES, StaffRole, StaffPermission } from '../lib/permissions';
import { Shield, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StaffProfile {
  uid: string;
  email: string;
  role: StaffRole;
  permissions: StaffPermission[];
  isOwner: boolean;
}

export const StaffDashboard: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/staff/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (err) {
        console.error('Failed to load staff profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B14] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const roleDef = profile ? STAFF_ROLES[profile.role] : null;

  return (
    <div className="min-h-screen bg-[#070B14] text-[#F8FAFC] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-[#0B1120] border border-[#243247] rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">
                {isAr ? 'لوحة فريق العمل والعمليات' : 'Portail Équipe & Opérations'}
              </h1>
              <p className="text-sm text-[#A8B3C5]">
                {profile?.email} •{' '}
                <span className="text-emerald-400 font-medium">
                  {roleDef ? (isAr ? roleDef.nameAr : roleDef.nameFr) : profile?.role}
                </span>
              </p>
            </div>
          </div>
          {profile?.isOwner && (
            <Link
              to="/admin"
              className="px-4 py-2 bg-[#111B2E] hover:bg-[#1A263D] border border-[#243247] text-sm font-medium rounded-lg transition"
            >
              {isAr ? 'لوحة المالك' : "Owner dashboard"}
            </Link>
          )}
        </div>

        {/* Permissions Overview */}
        <div className="bg-[#0B1120] border border-[#243247] rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-white">
            {isAr ? 'نطاق الصلاحيات الممنوحة' : 'Permissions accordées'}
          </h2>
          <p className="text-sm text-[#A8B3C5]">
            {roleDef ? (isAr ? roleDef.descAr : roleDef.descFr) : ''}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {profile?.permissions?.map((perm) => (
              <div
                key={perm}
                className="flex items-center gap-2 px-3 py-2 bg-[#111B2E] border border-[#243247] rounded-lg text-xs"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="font-mono text-[#F8FAFC]">{perm}</span>
              </div>
            ))}
            {(!profile?.permissions || profile.permissions.length === 0) && (
              <div className="col-span-full py-4 text-center text-sm text-[#A8B3C5]">
                {isAr ? 'لا توجد صلاحيات تشغيلية إضافية مخصصة' : 'Aucune permission supplémentaire accordée'}
              </div>
            )}
          </div>
        </div>

        {/* Operational Modules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0B1120] border border-[#243247] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white">{isAr ? 'إدارة الطلبات المباشرة' : 'Traitement des commandes'}</h3>
              <Clock className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-xs text-[#A8B3C5]">
              {isAr ? 'متابعة الطلبات الجديدة وتأكيد تحويلات بنكيلي وسداد وGazaPay' : 'Vérification et validation des commandes récentes'}
            </p>
            {profile?.isOwner ? (
              <Link
                to="/admin"
                className="inline-block text-xs text-emerald-400 hover:text-emerald-300 font-medium pt-2"
              >
                {isAr ? 'فتح قسم الطلبات ←' : 'Accéder aux commandes →'}
              </Link>
            ) : (
              <p className="pt-2 text-xs text-amber-300">
                {isAr
                  ? 'بوابة معالجة الطلبات الخاصة بالموظفين لم تُفعّل بعد؛ لن نوجّهك إلى لوحة المالك المحمية.'
                  : 'Le module de traitement des commandes pour le personnel n’est pas encore activé.'}
              </p>
            )}
          </div>

          <div className="bg-[#0B1120] border border-[#243247] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white">{isAr ? 'نطاق الوصول والتدقيق' : 'Accès et audit'}</h3>
              <AlertCircle className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xs text-[#A8B3C5]">
              {isAr
                ? 'تُعرض الصلاحيات التي أكدها الخادم لهذا الحساب. لا تمنح هذه الصفحة صلاحيات إضافية.'
                : 'This page shows the permissions confirmed by the server; it does not grant additional access.'}
            </p>
            <span className="inline-block text-xs text-[#A8B3C5] pt-2">
              {profile?.isOwner
                ? (isAr ? 'حساب المالك' : 'Owner account')
                : (isAr ? 'وصول موظف محدود' : 'Restricted staff access')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffDashboard;
