"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/firebaseConfig"; // Import your Firebase DB
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Add this to ensure it stays on the standard server runtime
export const fetchCache = 'force-no-store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function GroupChat() {
  const router = useRouter();
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  // State Management
  const [myUser, setMyUser] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupData, setGroupData] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [userCache, setUserCache] = useState<{ [key: string]: string }>({});
  const [activeReply, setActiveReply] = useState<{ user: string; text: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // FIX: Initialize likes from LocalStorage
  const [likedMessages, setLikedMessages] = useState<Set<string>>(new Set());

  const [notification, setNotification] = useState<{ msg: string, type: 'error' | 'success' } | null>(null);

  useEffect(() => {
    const user = localStorage.getItem("username");
    const gid = localStorage.getItem("currentGroupId");
    
    if (!user || !gid) {
      router.push("/learn");
      return;
    }

    setMyUser(user);
    setGroupId(gid);
    
    // Load persisted likes for this specific group
    const savedLikes = localStorage.getItem(`likes_${gid}`);
    if (savedLikes) {
      setLikedMessages(new Set(JSON.parse(savedLikes)));
    }

    initChat(user, gid);

    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      if (channelRef.current) channelRef.current.unsubscribe();
    };
  }, [notification]);

  const initChat = async (user: string, gid: string) => {
    const { data: group } = await supabase.from("groups").select("*").eq("id", gid).single();
    if (group) {
      setGroupData(group);
      fetchMessages(gid);
      setupRealtime(gid, user);
    }
  };

  const fetchMessages = async (gid: string) => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("group_messages")
      .select("*")
      .eq("group_id", gid)
      .gt("created_at", oneDayAgo)
      .order("created_at", { ascending: true });

    if (data) {
      setMessages(data);
      const uniqueSenders = Array.from(new Set(data.map(m => m.sender)));
      uniqueSenders.forEach(sender => fetchUserProfile(sender));
    }
    setTimeout(scrollBottom, 300);
  };

  // FIX: Fetch profile picture from Firebase Firestore
  const fetchUserProfile = async (username: string) => {
    if (userCache[username]) return;
    
    try {
      const snapshot = await db.collection("users")
        .where("username", "==", username)
        .limit(1)
        .get();

      let pic = `https://ui-avatars.com/api/?name=${username}&background=random`;

      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        // Check for 'profilePic' or 'avatar_url' fields
        pic = userData.profilePic || userData.avatar_url || pic;
      }

      setUserCache(prev => ({ ...prev, [username]: pic }));
    } catch (err) {
      console.error("Firebase fetch error:", err);
    }
  };

  const setupRealtime = (gid: string, user: string) => {
  // 1. MUST include presence config for Online/Typing to work
  const channel = supabase.channel(`room-${gid}`, {
    config: { presence: { key: user } }
  });

  channelRef.current = channel;

  channel
    // Handles Online Count & Typing Status
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users = Object.keys(state);
      setOnlineCount(users.length);
      const typing = users.filter(u => u !== user && (state[u][0] as any)?.isTyping);
      setTypingUsers(typing);
    })

    // FIX: Instant Messages
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "group_messages" }, // No filter here
      (payload) => {
        // We check the group ID manually here instead
        if (payload.new.group_id.toString() === gid.toString()) {
          setMessages((prev) => {
            // Safety check: don't add the same message twice
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          fetchUserProfile(payload.new.sender);
          setTimeout(scrollBottom, 100);
        }
      }
    )

    // FIX: Instant Likes/Updates
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "group_messages" },
      (payload) => {
        if (payload.new.group_id.toString() === gid.toString()) {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        }
      }
    )
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ isTyping: false, online_at: new Date().toISOString() });
      }
    });
};

  const handleInputChange = async (val: string) => {
    setInputText(val);
    if (channelRef.current && channelRef.current.state === 'joined') {
      channelRef.current.track({ isTyping: val.length > 0, online_at: new Date().toISOString() }).catch(() => { });
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !groupId || !myUser) return;

    if (groupData?.is_muted && groupData?.owner !== myUser) {
      setNotification({ msg: "Hub is muted by Admin", type: 'error' });
      return;
    }

    const { error } = await supabase.from("group_messages").insert([{
      group_id: groupId,
      sender: myUser,
      content: inputText.trim(),
      reply_to_user: activeReply?.user || null,
      reply_to_text: activeReply?.text || null,
      likes: 0
    }]);

    if (error) {
      setNotification({ msg: "Error: " + error.message, type: 'error' });
    } else {
      setInputText("");
      setActiveReply(null);
      handleInputChange("");
    }
  };

  // FIX: Add Like with LocalStorage Persistence
 const addLike = async (msgId: string, currentLikes: number) => {
  const isAlreadyLiked = likedMessages.has(msgId);
  const updatedLikes = new Set(likedMessages);
  
  // Calculate new count
  let newCount = currentLikes || 0;
  if (isAlreadyLiked) {
    updatedLikes.delete(msgId);
    newCount = Math.max(0, newCount - 1); // Don't go below 0
  } else {
    updatedLikes.add(msgId);
    newCount = newCount + 1;
  }

  // Update UI immediately for speed
  setLikedMessages(updatedLikes);
  localStorage.setItem(`likes_${groupId}`, JSON.stringify(Array.from(updatedLikes)));

  // Update Supabase
  const { error } = await supabase
    .from("group_messages")
    .update({ likes: newCount })
    .eq("id", msgId);

  if (error) {
    setNotification({ msg: "Error updating like", type: 'error' });
    // Optional: Add rollback logic here if DB fails
  } else if (!isAlreadyLiked && navigator.vibrate) {
    navigator.vibrate(10); // Haptic feedback only on "Like"
  }
};

  const toggleMute = async () => {
    const { error } = await supabase
      .from("groups")
      .update({ is_muted: !groupData.is_muted })
      .eq("id", groupId);

    if (error) {
      setNotification({ msg: "Database error: " + error.message, type: 'error' });
    } else {
      setNotification({
        msg: !groupData.is_muted ? "Hub Muted Successfully" : "Hub Unmuted Successfully",
        type: 'success'
      });
    }
  };

  const deleteHub = async () => {
    if (confirm("Permanently delete this hub?")) {
      const { error } = await supabase.from("groups").delete().eq("id", groupId);
      if (!error) router.push("/learn");
    }
  };

  const scrollBottom = () => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  };

  const isOwner = groupData?.owner === myUser;
  const canChat = !groupData?.is_muted || isOwner;

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#f8fafc] font-poppins overflow-hidden relative">
      
      {/* IN-APP MODAL NOTIFICATION */}
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
            notification.type === 'error' ? 'bg-red-600 border-red-500' : 'bg-emerald-600 border-emerald-500'
          } text-white`}>
            <i className={`fas ${notification.type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check'}`}></i>
            <span className="text-[11px] font-black uppercase tracking-wider">{notification.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-5 py-4 bg-white border-b border-slate-100 flex justify-between items-center shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-2xl text-slate-400">
            <i className="fas fa-chevron-left text-sm"></i>
          </button>
          <img src={groupData?.group_pic || `https://ui-avatars.com/api/?name=${groupData?.name || 'H'}`} className="w-11 h-11 rounded-2xl object-cover bg-slate-100" />
          <div className="flex flex-col">
            <h1 className="font-bold text-[15px] text-slate-900 leading-tight truncate max-w-[140px]">{groupData?.name || "Loading..."}</h1>
            <div className="h-4 flex items-center mt-0.5">
              {typingUsers.length > 0 ? (
                <div className="flex items-center gap-1.5 text-blue-600 animate-pulse">
                  <span className="text-[10px] font-black uppercase tracking-wider">{typingUsers[0]} typing...</span>
                </div>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {onlineCount} Online • {groupData?.members_count || 0} Members
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
          <i className="fas fa-bars-staggered text-xs"></i>
        </button>
      </header>

      {/* Messages */}
      <div ref={chatBoxRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 bg-[#fbfcfd]">
        {messages.map((m) => {
          const isMe = m.sender === myUser;
          // Use userCache (which now contains Firebase URLs)
          const avatar = userCache[m.sender] || `https://ui-avatars.com/api/?name=${m.sender}&background=random`;
          return (
            <div key={m.id} className={`flex gap-3 w-full items-end ${isMe ? 'flex-row-reverse' : ''}`}>
              <img src={avatar} className="w-9 h-9 rounded-2xl shadow-sm border-2 border-white shrink-0 object-cover bg-slate-200" />
              <div className="flex flex-col max-w-[75%]">
                <div className={`p-4 rounded-[24px] text-[13px] relative ${isMe ? 'bg-blue-600 text-white rounded-br-none shadow-xl' : 'bg-white text-slate-800 rounded-bl-none shadow-sm border border-slate-100'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[9px] font-black uppercase tracking-tighter ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>{m.sender}</span>
                    {m.sender === groupData?.owner && <span className="bg-red-500 text-white text-[7px] px-1.5 py-0.5 rounded font-black uppercase ml-1">Admin</span>}
                  </div>
                  {m.reply_to_text && (
                    <div className={`text-[11px] p-2.5 mb-3 rounded-xl border-l-4 bg-black/5 ${isMe ? 'border-white/40 text-blue-50' : 'border-blue-500 text-slate-500'}`}>
                      <div className="truncate italic">"{m.reply_to_text}"</div>
                    </div>
                  )}
                  <p className="font-medium leading-relaxed break-words">{m.content}</p>
                  <div className="flex justify-between items-center mt-2 opacity-60">
                    <span className="text-[9px] font-bold uppercase">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.likes > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[9px] font-bold">❤️ {m.likes}</span>}
                  </div>
                </div>
                <div className={`flex gap-3 mt-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <button onClick={() => setActiveReply({ user: m.sender, text: m.content })} className="text-slate-400 hover:text-blue-500 text-[10px] font-bold uppercase tracking-tighter">Reply</button>
                  <button onClick={() => addLike(m.id, m.likes)} className={`${likedMessages.has(m.id) ? 'text-red-500' : 'text-slate-400'} text-[10px] font-bold uppercase tracking-tighter`}>Like</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply Preview and Input Area remains the same as your beautiful design... */}
      {/* [Rest of your UI code here] */}
      {activeReply && (
        <div className="px-6 py-3 bg-white border-t border-slate-50 flex justify-between items-center shrink-0">
          <div className="flex flex-col border-l-4 border-blue-500 pl-4">
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Replying to {activeReply.user}</span>
            <span className="text-xs text-slate-500 truncate max-w-[200px] font-medium">{activeReply.text}</span>
          </div>
          <button onClick={() => setActiveReply(null)} className="w-8 h-8 bg-slate-50 rounded-full text-slate-400"><i className="fas fa-times text-xs"></i></button>
        </div>
      )}

      <div className="p-5 bg-white border-t border-slate-100 shrink-0">
        {canChat ? (
          <div className="flex items-end gap-3 bg-slate-50 p-2.5 rounded-[28px] border-2 border-transparent focus-within:bg-white focus-within:border-blue-100 transition-all shadow-inner">
            <textarea
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
              placeholder="Write a message..."
              rows={1}
              className="bg-transparent flex-1 outline-none px-4 py-2.5 text-[14px] font-medium resize-none max-h-32"
            />
            <button onClick={sendMessage} className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition shrink-0">
              <i className="fas fa-paper-plane text-sm"></i>
            </button>
          </div>
        ) : (
          <div className="text-center py-5 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] bg-slate-50 rounded-[28px] border border-dashed border-slate-200">
            <i className="fas fa-lock mr-2"></i> This Hub is muted by Admin
          </div>
        )}
      </div>
      
      {/* Sidebar Overlay (remains as per your original code) */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex justify-end" onClick={() => setShowSettings(false)}>
            <div className="w-80 bg-white h-full p-8 shadow-2xl animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
               <div className="flex justify-between items-center mb-10">
                 <h3 className="text-xl font-black text-slate-900">Hub Settings</h3>
                 <button onClick={() => setShowSettings(false)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full"><i className="fas fa-times text-slate-400"></i></button>
               </div>
               <div className="space-y-8">
                  <div className="flex flex-col items-center text-center">
                      <img src={groupData?.group_pic || `https://ui-avatars.com/api/?name=H`} className="w-24 h-24 rounded-3xl object-cover shadow-xl mb-4 border-4 border-slate-50" />
                      <h2 className="font-extrabold text-lg text-slate-800">{groupData?.name}</h2>
                  </div>

                  {isOwner && (
                    <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 flex justify-between items-center">
                       <div>
                          <span className="text-[11px] font-black text-blue-900 uppercase tracking-wider block">Admin Mute</span>
                          <span className="text-[10px] text-blue-700/60 font-medium italic">Disable chat for members</span>
                       </div>
                       <button onClick={toggleMute} className={`w-12 h-6 rounded-full transition-all relative ${groupData?.is_muted ? 'bg-blue-600' : 'bg-slate-300'}`}>
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${groupData?.is_muted ? 'right-1' : 'left-1'}`}></div>
                       </button>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">About Hub</label>
                    <p className="mt-3 text-sm text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl">{groupData?.description || "No description."}</p>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100">
                    <button 
                      onClick={isOwner ? deleteHub : () => router.push('/learn')} 
                      className={`w-full py-4 rounded-2xl font-bold text-sm transition-all ${isOwner ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-600'}`}>
                      {isOwner ? 'Delete Hub Permanently' : 'Leave this Hub'}
                    </button>
                  </div>
               </div>
            </div>
        </div>
      )}
    </div>
  );
}