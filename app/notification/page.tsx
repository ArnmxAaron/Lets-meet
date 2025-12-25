"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NotificationsPage() {
  const router = useRouter();
  
  // State Management
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUsername, setMyUsername] = useState("");
  const [showClearModal, setShowClearModal] = useState(false);
  const [selectedAdminNotif, setSelectedAdminNotif] = useState<any | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  // --- NEW UPDATE: MARK NOTIFICATIONS AS READ ---
  const markAsRead = async (username: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('receiver_id', username)
        .eq('is_read', false);
    } catch (err) {
      console.error("Error marking read:", err);
    }
  };

  const loadNotifications = useCallback(async (username: string) => {
    try {
      const lastCleared = localStorage.getItem(`lastCleared_${username}`);
      
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .or(`receiver_id.eq.${username},receiver_id.eq.GLOBAL`)
        .order('created_at', { ascending: false })
        .limit(40);

      if (data) {
        const filtered = data.filter(n => {
          if (!lastCleared) return true;
          return new Date(n.created_at) > new Date(lastCleared);
        });
        setNotifications(filtered);
      }
      
      // Mark as read after loading
      await markAsRead(username);
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
    const user = localStorage.getItem("username") || "Guest";
    setMyUsername(user);
    loadNotifications(user);

    const channel = supabase
      .channel('notif-feed-sync')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notifications' }, 
        (payload) => {
          const newNotif = payload.new;
          const lastCleared = localStorage.getItem(`lastCleared_${user}`);
          
          // Check if notification is valid for current view
          const isRelevant = (newNotif.receiver_id === 'GLOBAL' || newNotif.receiver_id === user) && newNotif.sender_id !== user;
          const isNewerThanCleared = !lastCleared || new Date(newNotif.created_at) > new Date(lastCleared);

          if (isRelevant && isNewerThanCleared) {
             setNotifications(prev => [newNotif, ...prev]);
             // Auto-mark as read if user is currently looking at the list
             if (newNotif.receiver_id === user) markAsRead(user);
          }
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadNotifications]);

  const formatTime = (d: string) => {
    const diff = Math.floor((new Date().getTime() - new Date(d).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(d).toLocaleDateString();
  };

  const getCountryCode = (c: string) => {
    const map: any = { 
        "Sierra Leone": "sl", "Nigeria": "ng", "Ghana": "gh", 
        "Liberia": "lr", "United States": "us", "United Kingdom": "gb" 
    };
    return map[c] || "sl";
  };

  const handleClearConfirm = async () => {
    const now = new Date().toISOString();
    localStorage.setItem(`lastCleared_${myUsername}`, now);
    setNotifications([]);
    setShowClearModal(false);
  };

  const handleNotifClick = (notif: any) => {
    if (notif.type === 'admin') {
      setSelectedAdminNotif(notif);
    } else {
      router.push('/postupdate');
    }
  };

  if (!hasMounted) return null;

  // --- DETAIL VIEW: ADMIN BROADCASTS ---
  if (selectedAdminNotif) {
    return (
      <div className="bg-[#f8fafc] min-h-screen font-inter">
        <div className="max-w-2xl mx-auto min-h-screen bg-white shadow-xl flex flex-col animate-in fade-in duration-300">
          <header className="p-6 border-b flex items-center gap-4">
            <button onClick={() => setSelectedAdminNotif(null)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <i className="fas fa-arrow-left"></i>
            </button>
            <h2 className="font-bold text-lg">System Update</h2>
          </header>
          <main className="flex-1 p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-purple-600 flex items-center justify-center text-white text-2xl shadow-lg">
                <i className="fas fa-shield-check"></i>
              </div>
              <div>
                <h3 className="font-black text-xl text-slate-900">Official Broadcast</h3>
                <p className="text-slate-400 text-sm">{formatTime(selectedAdminNotif.created_at)}</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-[32px] p-6 border border-slate-100 italic text-slate-700 leading-relaxed text-lg">
              "{selectedAdminNotif.content || selectedAdminNotif.message || "No message content available."}"
            </div>
            <button onClick={() => setSelectedAdminNotif(null)} className="w-full mt-10 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl active:scale-95">
              Back to Notifications
            </button>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f0f2f5] min-h-screen font-inter relative">
      {/* HEADER */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 h-[60px] flex items-center shadow-sm">
        <div className="px-4 w-full flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-slate-600 text-lg">
              <i className="fas fa-arrow-left"></i>
            </button>
            <h1 className="font-bold text-xl text-slate-900 tracking-tight">Notifications</h1>
          </div>
          <button onClick={() => setShowClearModal(true)} className="text-blue-600 font-bold text-sm hover:bg-blue-50 px-3 py-1.5 rounded-full transition-colors">
            Clear All
          </button>
        </div>
      </div>

      <main className="pt-[60px] max-w-2xl mx-auto bg-white min-h-screen shadow-sm">
        {loading ? (
          <div className="p-10 text-center">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-2"></div>
            <p className="text-slate-400 text-sm">Syncing intelligence...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                <i className="fas fa-bell-slash text-slate-200 text-3xl"></i>
            </div>
            <p className="text-slate-400 font-medium">No new updates yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notifications.map((notif) => {
              const displayAvatar = notif.sender_pic || notif.sender_avatar || `https://ui-avatars.com/api/?name=${notif.sender_id}&background=random`;
              const displayMessage = notif.content || notif.message || "shared a new update.";
              
              let badgeBg = "bg-blue-500";
              let icon = "fa-bell";

              if (notif.type === 'follow') {
                badgeBg = "bg-blue-600"; icon = "fa-user-plus";
              } else if (notif.type === 'post' || notif.type === 'community_post') {
                badgeBg = "bg-orange-500"; icon = "fa-users";
              } else if (notif.type === 'like') {
                badgeBg = "bg-red-500"; icon = "fa-heart";
              } else if (notif.type === 'admin') {
                badgeBg = "bg-purple-600"; icon = "fa-shield-check";
              }

              return (
                <div 
                  key={notif.id} 
                  onClick={() => handleNotifClick(notif)}
                  className={`flex items-center gap-4 p-4 transition-colors cursor-pointer active:bg-slate-100 ${!notif.is_read ? 'bg-blue-50/50' : 'bg-white'}`}
                >
                  <div className="relative flex-shrink-0">
                    <img src={displayAvatar} className="w-[52px] h-[52px] rounded-full object-cover border border-slate-200 shadow-sm" alt="" />
                    <div className={`absolute bottom-0 right-0 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 border-white text-[10px] text-white shadow-sm ${badgeBg}`}>
                      <i className={`fas ${icon}`}></i>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-slate-900 leading-snug">
                      <span className="font-bold mr-1">{notif.sender_id}</span>
                      <img 
                        src={`https://flagcdn.com/${getCountryCode(notif.sender_country || "Sierra Leone")}.svg`} 
                        className="w-3.5 h-2.5 inline-block mr-1 rounded-sm shadow-sm"
                        alt="flag"
                      />
                      <span className="text-slate-600">{displayMessage}</span>
                    </div>
                    <div className="text-[12px] text-slate-400 font-medium mt-1 uppercase tracking-tighter">
                      {formatTime(notif.created_at)}
                    </div>
                  </div>

                  {!notif.is_read && (
                    <div className="w-2.5 h-2.5 bg-blue-600 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* MODAL: CLEAR ALL */}
      {showClearModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setShowClearModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="text-center">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-inner">
                <i className="fas fa-trash-can text-3xl"></i>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Clear Activity?</h3>
              <p className="text-slate-500 text-sm mb-8">This will hide current notifications. This cannot be undone.</p>
              <div className="grid grid-cols-1 gap-3">
                <button onClick={handleClearConfirm} className="w-full py-4 bg-red-500 text-white font-bold rounded-2xl active:scale-95 transition-all">Confirm Clear</button>
                <button onClick={() => setShowClearModal(false)} className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl active:scale-95 transition-all">Nevermind</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}