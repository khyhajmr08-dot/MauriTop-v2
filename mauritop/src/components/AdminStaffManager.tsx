import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { Check, Loader2, Save, Shield, ShieldCheck, UserCog, UserX } from "lucide-react";
import { db } from "../lib/firebase";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/useAuth";

type PermissionKey =
  | "viewOrders" | "processOrders" | "manageServices" | "managePromotions"
  | "managePaymentMethods" | "viewAnalytics" | "manageSEO";

type StaffMember = {
  id: string; name: string; email: string; phone?: string; createdAt?: any;
  active: boolean; permissions: Partial<Record<PermissionKey, boolean>>;
};

const PERMISSIONS: { key: PermissionKey; label: string; detail: string }[] = [
  { key: "viewOrders", label: "مشاهدة الطلبات", detail: "عرض الطلبات اللازمة للعمل دون فتح قائمة المستخدمين." },
  { key: "processOrders", label: "معالجة وشحن الطلبات", detail: "تغيير حالة الطلب وإرسال إشعار للعميل؛ لا تسمح هذه الصلاحية بإدارة الحسابات أو الأسعار." },
  { key: "manageServices", label: "إدارة الخدمات", detail: "إضافة الخدمات وتعديلها وحذفها." },
  { key: "managePromotions", label: "إدارة العروض", detail: "إدارة منشورات العروض والشريط الترويجي." },
  { key: "managePaymentMethods", label: "إدارة طرق الدفع", detail: "تغيير أرقام الاستلام وحالة وسائل الدفع؛ امنحها فقط لمن تثق به تماماً." },
  { key: "manageWithdrawals", label: "معالجة طلبات السحب", detail: "مراجعة طلبات سحب المكافآت وتحديث حالتها." },
  { key: "manageKyc", label: "مراجعة التوثيق", detail: "الوصول إلى مستندات الهوية؛ بيانات شديدة الحساسية." },
  { key: "viewAnalytics", label: "مشاهدة الإحصاءات", detail: "عرض مؤشرات الزيارات والنشاط." },
  { key: "manageSEO", label: "أدوات الفهرسة", detail: "استخدام أدوات الفهرسة ومحركات البحث." },
  { key: "sendNotifications", label: "إرسال الإشعارات", detail: "إرسال رسائل للمستخدمين؛ استخدمها بحذر." },
  { key: "manageSettings", label: "إعدادات النظام", detail: "تغيير إعدادات المتجر العامة والصيانة." },
];

const emptyPermissions = (): Partial<Record<PermissionKey, boolean>> => ({});

export default function AdminStaffManager() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [busy, setBusy] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [usersSnap, membersSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "adminMembers")),
      ]);
      const assigned = new Map(membersSnap.docs.map((item) => [item.id, item.data()]));
      const list = usersSnap.docs.map((item) => {
        const user = item.data();
        const member = assigned.get(item.id) || {};
        return {
          id: item.id,
          name: String(user.name || user.displayName || user.email || "مستخدم"),
          email: String(user.email || ""),
          phone: String(user.phoneNumber || user.phone || ""),
          createdAt: user.createdAt,
          active: member.active === true,
          permissions: (member.permissions || emptyPermissions()) as Partial<Record<PermissionKey, boolean>>,
        };
      }).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "ar"));
      setMembers(list);
    } catch (error) {
      console.error("Admin staff list failed", error);
      showToast("تعذر تحميل الموظفين. تأكد من أنك تدخل بحساب المالك وأن قواعد Firebase محدّثة.", "error");
    } finally {
      setBusy(false);
    }
  }, [showToast, user?.uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => `${member.name} ${member.email} ${member.phone || ""}`.toLowerCase().includes(q));
  }, [members, search]);

  const togglePermission = (uid: string, key: PermissionKey, checked: boolean) => {
    setMembers((prev) => prev.map((member) => {
      if (member.id !== uid) return member;
      const permissions = { ...member.permissions, [key]: checked };
      // Processing orders requires permission to open the orders queue.
      if (key === "processOrders" && checked) permissions.viewOrders = true;
      return { ...member, permissions };
    }));
  };

  const saveMember = async (member: StaffMember) => {
    setSavingId(member.id);
    try {
      const permissions = Object.fromEntries(PERMISSIONS.map(({ key }) => [key, member.active && (key === "viewOrders" ? (member.permissions.viewOrders === true || member.permissions.processOrders === true) : member.permissions[key] === true)]));
      await setDoc(doc(db, "adminMembers", member.id), {
        uid: member.id,
        email: member.email,
        displayName: member.name,
        active: member.active,
        permissions,
        assignedBy: user?.uid || "owner",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast(member.active ? `تم حفظ صلاحيات ${member.name}` : `تم إيقاف وصول ${member.name}`, "success");
      await refresh();
    } catch (error) {
      console.error("Admin staff permission save failed", error);
      showToast("لم يتم حفظ الصلاحيات. تحقق من قواعد Firestore ثم أعد المحاولة.", "error");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-5" dir="rtl">
      <header className="rounded-3xl border border-slate-800 bg-slate-950 p-5 sm:p-6 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400"><UserCog size={24} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black">إدارة الموظفين والصلاحيات</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">اختر مستخدماً مسجلاً ثم امنحه الصلاحيات الضرورية فقط. لا يمكن للموظفين إدارة هذه الصفحة أو منح صلاحيات لأنفسهم.</p>
          </div>
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-bold text-slate-400">بحث بالاسم أو البريد أو الهاتف</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن مستخدم مسجل..." className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500" />
        </label>
      </header>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-6 text-amber-200">
        <strong>تنبيه أمان:</strong> صلاحية معالجة الطلبات تعني أن الموظف يحتاج إلى رؤية تفاصيل الطلب الضرورية للتنفيذ. لا تمنحه صلاحيات المستخدمين أو التوثيق أو الدفع إلا عند الضرورة. حماية بيانات البريد والهاتف الموجودة داخل وثيقة الطلب نفسها تحتاج فصلها عن بيانات التنفيذ في الخادم قبل اعتبارها مخفية تماماً.
      </div>

      {busy ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-400" /></div> : visibleMembers.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center text-sm text-slate-400">لا يوجد مستخدمون مطابقون للبحث.</div>
      ) : visibleMembers.map((member) => (
        <article key={member.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400"><Shield size={20} /></div>
              <div className="min-w-0">
                <h3 className="truncate font-black">{member.name}</h3>
                <p dir="ltr" className="truncate text-left text-xs text-slate-400">{member.email || "لا يوجد بريد محفوظ"}</p>
                {member.phone && <p dir="ltr" className="text-left text-xs text-slate-500">{member.phone}</p>}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={member.active} onChange={(e) => setMembers((prev) => prev.map((item) => item.id === member.id ? { ...item, active: e.target.checked } : item))} className="h-4 w-4 accent-emerald-500" />
              {member.active ? <span className="text-emerald-300">موظف نشط</span> : <span className="text-slate-400">لا يملك وصولاً</span>}
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {PERMISSIONS.map((permission) => (
              <label key={permission.key} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors", member.active && member.permissions[permission.key] ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-900/50", !member.active && "opacity-50")}>
                <input type="checkbox" disabled={!member.active} checked={member.permissions[permission.key] === true} onChange={(e) => togglePermission(member.id, permission.key, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />
                <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-black">{member.permissions[permission.key] === true && member.active && <Check size={13} className="text-emerald-400" />}{permission.label}</span><span className="mt-1 block text-[11px] leading-5 text-slate-500">{permission.detail}</span></span>
              </label>
            ))}
          </div>
          <div className="flex justify-end border-t border-slate-800 p-4">
            <button type="button" onClick={() => void saveMember(member)} disabled={savingId === member.id} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50">
              {savingId === member.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {savingId === member.id ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}
            </button>
          </div>
        </article>
      ))}
      <p className="text-[11px] leading-5 text-slate-500">ملاحظة: إضافة موظف هنا تمنح الوصول لمستخدم لديه حساب بالفعل. دعوة شخص جديد بالبريد تحتاج إلى خدمة خادم موثوقة تستخدم Firebase Admin SDK؛ لا تضع مفاتيح الخدمة في الواجهة.</p>
    </section>
  );
}
