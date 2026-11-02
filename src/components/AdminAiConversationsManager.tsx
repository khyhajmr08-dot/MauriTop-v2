import React, { useState, useEffect } from "react";
import { auth } from "../lib/firebase";
import {
  Bot,
  Search,
  RefreshCw,
  Clock,
  User,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Check,
  Save,
  ChevronRight,
  Filter
} from "lucide-react";
import { cn } from "../lib/utils";

interface ConversationMessage {
  role: "user" | "model";
  text: string;
  timestamp: string;
}

interface ConversationItem {
  id: string;
  conversationId?: string;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string;
  messages: ConversationMessage[];
  status: "open" | "resolved" | "escalated";
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  lastUserMessage?: string;
  messageCount?: number;
}

export const AdminAiConversationsManager: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "escalated">("all");
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const token = await currentUser.getIdToken();
      const statusParam = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/ai-conversations${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list: ConversationItem[] = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(list);
        if (selectedConversation) {
          const updated = list.find(c => c.id === selectedConversation.id);
          if (updated) setSelectedConversation(updated);
        }
      }
    } catch (e) {
      console.warn("Failed to load AI conversations:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [statusFilter]);

  const handleSelect = (conv: ConversationItem) => {
    setSelectedConversation(conv);
    setNotesDraft(conv.internalNotes || "");
    setSaveSuccess(false);
  };

  const handleUpdateStatus = async (convId: string, newStatus: "open" | "resolved" | "escalated") => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();
      await fetch(`/api/admin/ai-conversations/${convId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (selectedConversation && selectedConversation.id === convId) {
        setSelectedConversation(prev => prev ? { ...prev, status: newStatus } : null);
      }
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, status: newStatus } : c));
    } catch (err) {
      console.error("Failed to update conversation status:", err);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedConversation) return;
    setIsSavingNotes(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();
      await fetch(`/api/admin/ai-conversations/${selectedConversation.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ internalNotes: notesDraft.trim() })
      });
      setSelectedConversation(prev => prev ? { ...prev, internalNotes: notesDraft.trim() } : null);
      setConversations(prev => prev.map(c => c.id === selectedConversation.id ? { ...c, internalNotes: notesDraft.trim() } : c));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to save staff notes:", err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const filtered = conversations.filter(c => {
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesStatus;
    const matchesSearch =
      (c.userName || "").toLowerCase().includes(query) ||
      (c.userEmail || "").toLowerCase().includes(query) ||
      (c.lastUserMessage || "").toLowerCase().includes(query) ||
      (c.lastMessage || "").toLowerCase().includes(query) ||
      (c.internalNotes || "").toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center text-cyan-600">
            <Bot size={26} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">محادثات المساعد الذكي</h3>
            <p className="text-xs font-bold text-slate-400">متابعة تفاعلات الزوار والعملاء وملاحظات فريق الدعم الفني</p>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في محتوى المحادثات..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs font-bold focus:border-cyan-500 outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-700 outline-none"
          >
            <option value="all">جميع الحالات</option>
            <option value="open">قيد الانتظار / نشطة</option>
            <option value="resolved">تمت المعالجة</option>
            <option value="escalated">بحاجة لمتابعة إدارية</option>
          </select>
        </div>
      </div>

      {/* Main split view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Main Column: Conversation List */}
        <div className={cn("space-y-3", selectedConversation ? "lg:col-span-5" : "lg:col-span-12")}>
          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 font-bold text-xs">
              جاري تحميل المحادثات...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 font-bold text-xs">
              لا توجد محادثات تطابق معايير البحث الحالية
            </div>
          ) : (
            filtered.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelect(conv)}
                  className={cn(
                    "p-4.5 rounded-2xl border transition-all cursor-pointer bg-white hover:border-cyan-400",
                    isSelected
                      ? "border-cyan-500 ring-2 ring-cyan-500/10 shadow-md"
                      : "border-slate-200/80 shadow-xs hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-black text-xs shrink-0">
                        <User size={14} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-800 truncate">
                          {conv.userName || "زائر / عميل"}
                        </h4>
                        {conv.userEmail && (
                          <span className="text-[10px] text-slate-400 block truncate font-mono" dir="ltr">
                            {conv.userEmail}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span className={cn(
                      "text-[9px] font-black px-2.5 py-0.5 rounded-full shrink-0 border",
                      conv.status === "open" ? "bg-amber-50 text-amber-600 border-amber-200" :
                      conv.status === "resolved" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                      "bg-rose-50 text-rose-600 border-rose-200"
                    )}>
                      {conv.status === "open" ? "نشطة" : conv.status === "resolved" ? "معالجة" : "مصعدة"}
                    </span>
                  </div>

                  {/* Snippet */}
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed mb-2 font-medium">
                    {conv.lastUserMessage ? `سؤال العميل: "${conv.lastUserMessage}"` : (conv.lastMessage || "محادثة جديدة")}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock size={11} />
                      {conv.updatedAt ? new Date(conv.updatedAt).toLocaleString("ar-MR", { dateStyle: "short", timeStyle: "short" }) : "---"}
                    </span>
                    <span className="font-bold">
                      {conv.messages?.length || 0} رسالة
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Active Conversation Viewer & Staff Notes */}
        {selectedConversation && (
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-sm font-black text-slate-800">
                  تفاصيل المحادثة — {selectedConversation.userName || "زائر"}
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">
                  معرّف الجلسة: {selectedConversation.id}
                </span>
              </div>

              {/* Status Switcher Buttons */}
              <div className="flex items-center gap-1">
                {(["open", "resolved", "escalated"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(selectedConversation.id, st)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all",
                      selectedConversation.status === st
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {st === "open" ? "نشطة" : st === "resolved" ? "معالجة" : "تصعيد"}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation Transcript Stream */}
            <div className="max-h-[380px] overflow-y-auto space-y-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
              {selectedConversation.messages && selectedConversation.messages.length > 0 ? (
                selectedConversation.messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed",
                        isUser
                          ? "mr-auto bg-cyan-600 text-white font-medium rounded-tr-none"
                          : "ml-auto bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-xs"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 text-[9px] mb-1 opacity-70">
                        <span className="font-black">{isUser ? "العميل" : "المساعد الذكي"}</span>
                        <span className="font-mono">
                          {m.timestamp ? new Date(m.timestamp).toLocaleTimeString("ar-MR", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-xs text-slate-400 font-bold">
                  لا توجد رسائل مسجلة في هذه الجلسة
                </div>
              )}
            </div>

            {/* Internal Staff Notes Section */}
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-cyan-600" />
                  ملاحظات الموظفين الداخلية (سرية للإدارة فقط)
                </label>
                {saveSuccess && (
                  <span className="text-[10px] text-emerald-600 font-black flex items-center gap-1">
                    <Check size={12} />
                    تم الحفظ بنجاح
                  </span>
                )}
              </div>
              <textarea
                rows={3}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="اكتب ملاحظات داخلية لمتابعة هذا العميل أو تفاصيل الشحن والتحويل..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:border-cyan-500 outline-none transition-all"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isSavingNotes}
                  onClick={handleSaveNotes}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Save size={13} />
                  <span>{isSavingNotes ? "جاري الحفظ..." : "حفظ الملاحظة"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
