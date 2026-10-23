import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Users, User, Smartphone, Monitor, Clock, MapPin, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';

interface Visitor {
  sessionId: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  isRegistered: boolean;
  device: string;
  userAgent: string;
  lastActive: Timestamp;
  path: string;
}

export function LiveVisitorsDashboard() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const { isRtl } = useLanguage();

  useEffect(() => {
    // Only fetch visitors who were active in the last 5 minutes
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const q = query(
      collection(db, 'active_visitors'),
      orderBy('lastActive', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeVisitors: Visitor[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Visitor;
        // Check if active recently
        if (data.lastActive) {
          const lastActiveDate = data.lastActive.toDate();
          if (lastActiveDate > fiveMinutesAgo) {
            activeVisitors.push(data);
          }
        }
      });
      setVisitors(activeVisitors);
    }, (error) => {
      console.warn("Firestore live visitors listener connection issue (operating offline):", error);
    });

    return () => unsubscribe();
  }, []);

  const registeredUsers = visitors.filter(v => v.isRegistered);
  const guests = visitors.filter(v => !v.isRegistered);

  return (
    <div className={cn("space-y-6", isRtl ? "rtl" : "ltr")} dir={isRtl ? "rtl" : "ltr"}>
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Activity className="w-16 h-16 text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-slate-500 mb-2 z-10 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            {isRtl ? "إجمالي المتصلين الآن" : "Total Online"}
          </p>
          <p className="text-4xl font-black text-slate-800 z-10">{visitors.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <User className="w-16 h-16 text-cyan-500" />
          </div>
          <p className="text-sm font-bold text-slate-500 mb-2 z-10">{isRtl ? "أعضاء مسجلين" : "Registered Users"}</p>
          <p className="text-4xl font-black text-cyan-600 z-10">{registeredUsers.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Users className="w-16 h-16 text-amber-500" />
          </div>
          <p className="text-sm font-bold text-slate-500 mb-2 z-10">{isRtl ? "زوار (ضيوف)" : "Guests"}</p>
          <p className="text-4xl font-black text-amber-500 z-10">{guests.length}</p>
        </motion.div>
      </div>

      {/* Live Visitors Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg">{isRtl ? "مراقبة الزوار المباشرة" : "Live Visitors Monitor"}</h3>
              <p className="text-xs text-slate-500 font-medium">
                {isRtl ? "تحديث تلقائي لحظي للمتواجدين حالياً" : "Real-time auto-updating list of online users"}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className={cn("text-xs text-slate-500 bg-slate-50/50 border-b border-slate-100 uppercase", isRtl && "text-right")}>
              <tr>
                <th className="px-6 py-4 font-black">{isRtl ? "المستخدم" : "User"}</th>
                <th className="px-6 py-4 font-black">{isRtl ? "الصفحة الحالية" : "Current Path"}</th>
                <th className="px-6 py-4 font-black">{isRtl ? "الجهاز" : "Device"}</th>
                <th className="px-6 py-4 font-black">{isRtl ? "آخر نشاط" : "Last Active"}</th>
              </tr>
            </thead>
            <tbody>
              {visitors.length > 0 ? (
                visitors.map((visitor, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0, x: isRtl ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={visitor.sessionId} 
                    className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shadow-sm border",
                          visitor.isRegistered 
                            ? "bg-cyan-100 text-cyan-700 border-cyan-200" 
                            : "bg-amber-100 text-amber-700 border-amber-200"
                        )}>
                          {visitor.isRegistered ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                        </div>
                        <div>
                          {visitor.isRegistered ? (
                            <>
                              <p className="font-bold text-slate-800 truncate max-w-[150px]">{visitor.name || "مستخدم مسجل"}</p>
                              <p className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">{visitor.email}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-bold text-slate-700">{isRtl ? "زائر (غير مسجل)" : "Guest Visitor"}</p>
                              {visitor.phone && <p className="text-[10px] text-slate-500 font-mono">{visitor.phone}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-600 font-medium bg-slate-100 px-2.5 py-1 rounded-lg w-max max-w-[180px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-xs font-mono" dir="ltr">{visitor.path || "/"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        {visitor.device === 'Mobile' ? (
                          <Smartphone className="w-4 h-4 text-slate-400" />
                        ) : (
                          <Monitor className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="text-xs font-bold">{visitor.device}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{isRtl ? "الآن" : "Just now"}</span>
                      </div>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Users className="w-12 h-12 text-slate-300" />
                      <p className="font-bold">{isRtl ? "لا يوجد زوار حالياً" : "No active visitors right now"}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
