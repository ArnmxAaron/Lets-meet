"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, ChevronLeft, Send, X, 
  Check, CheckCheck, RefreshCcw, Lock, Home, Settings, LogOut, Trash2, UserMinus, Info, Reply
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import CryptoJS from 'crypto-js';
import { initializeApp, getApps, getApp } from "firebase/app"; // Added getApp
import { getFirestore, doc, getDoc } from "firebase/firestore";

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

// FIX: Check for existing app instance to prevent (app/duplicate-app) error
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ENCRYPTION_KEY = "meet_and_greet_secure_key_2024";

interface Message {
  id: string;
  sender: string;
  receiver: string;
  content: string;
  is_read: boolean;
  reply_metadata?: {
    id: string;
    sender: string;
    text: string;
  } | null;
  created_at: string;
  is_system?: boolean;
}

export default function ChatApp() {
  const router = useRouter();
  
  const [myUser, setMyUser] = useState<string>("");
  const [view, setView] = useState<'list' | 'chat' | 'settings'>('list');
  const [isLocked, setIsLocked] = useState(true);
  const [vaultMode, setVaultMode] = useState<'setup' | 'verify'>('verify');
  const [pin, setPin] = useState("");
  const [setupHint, setSetupHint] = useState("");
  const [dbPin, setDbPin] = useState<string | null>(null);
  const [timeoutPref, setTimeoutPref] = useState<number>(0); 

  const [inbox, setInbox] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [partnerStatus, setPartnerStatus] = useState({ online: false, typing: false });
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [userImages, setUserImages] = useState<Record<string, string>>({});
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // --- SELF DESTRUCT LOGIC (10 MINS) ---
  const runSelfDestruct = async () => {
    const tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString();
    
    // Deletes messages that were seen (is_read: true) more than 10 minutes ago
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('is_read', true)
      .lt('created_at', tenMinsAgo); 

    if (error) console.error("Self-destruct error:", error);
  };

  useEffect(() => {
    const user = localStorage.getItem('username');
    if (!user) { router.push('/profile'); return; }
    setMyUser(user);
    initVault(user);
    
    const heartbeat = setInterval(() => {
        supabase.from('profiles').upsert({ username: user, last_online: new Date().toISOString() }).then();
        runSelfDestruct(); // Run cleanup check every 30s
    }, 30000);

    return () => clearInterval(heartbeat);
  }, []);

  const getProfilePic = async (username: string) => {
    if (userImages[username]) return userImages[username];
    try {
      const userRef = doc(db, "users", username);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        const url = data.profilePic || `https://ui-avatars.com/api/?name=${username}&background=random&bold=true`;
        setUserImages(prev => ({ ...prev, [username]: url }));
        return url;
      }
    } catch (e) {
      console.error("Firebase Image Error:", e);
    }
    return `https://ui-avatars.com/api/?name=${username}&background=random&bold=true`;
  };

  const initVault = async (user: string) => {
    const { data, error } = await supabase.from('vault_configs').select('*').eq('username', user).single();
    if (error || !data) { setVaultMode('setup'); setIsLocked(true); } 
    else {
      setDbPin(data.pin);
      setTimeoutPref(data.lock_timeout || 0);
      setSetupHint(data.hint || "");
      const lastAuth = localStorage.getItem('vault_last_auth');
      const now = Date.now();
      const expiry = lastAuth ? parseInt(lastAuth) + (data.lock_timeout * 60000) : 0;
      
      if (now < expiry && data.lock_timeout !== 0) { setIsLocked(false); startChatLogic(user); } 
      else { setIsLocked(true); }
    }
  };

  const startChatLogic = (user: string) => {
    fetchInbox(user);
    const target = localStorage.getItem('chattingWith');
    if (target) { openChat(target); localStorage.removeItem('chattingWith'); }
  };

  const handlePinSubmit = async (val?: string) => {
    const finalPin = val || pin;
    if (vaultMode === 'setup') {
        if (finalPin.length < 4) return;
        await supabase.from('vault_configs').upsert({ username: myUser, pin: finalPin, hint: setupHint, lock_timeout: timeoutPref });
        unlockAccess();
    } else {
        if (finalPin === dbPin) unlockAccess();
        else { setPin(""); alert("Incorrect PIN"); pinInputRef.current?.focus(); }
    }
  };

  const unlockAccess = () => {
    localStorage.setItem('vault_last_auth', Date.now().toString());
    setIsLocked(false);
    startChatLogic(myUser);
    setPin("");
  };

  const fetchInbox = async (user: string) => {
    const { data } = await supabase.from('messages').select('*').or(`sender.eq.${user},receiver.eq.${user}`).order('created_at', { ascending: false });
    const unique: any[] = [];
    const seen = new Set();
    
    if (data) {
        for (const m of data) {
            const other = m.sender === user ? m.receiver : m.sender;
            if (!seen.has(other)) {
                seen.add(other);
                await getProfilePic(other);
                unique.push({ ...m, otherUser: other });
            }
        }
    }
    setInbox(unique);
  };

  const openChat = async (other: string) => {
    setCurrentChat(other);
    setView('chat');
    await getProfilePic(other);
    fetchMessages(other, myUser);
  };

  const fetchMessages = async (other: string, me: string) => {
    const { data } = await supabase.from('messages').select('*').or(`and(sender.eq.${me},receiver.eq.${other}),and(sender.eq.${other},receiver.eq.${me})`).order('created_at', { ascending: true });
    setMessages(data || []);
    await supabase.from('messages').update({ is_read: true }).eq('receiver', me).eq('sender', other);
    checkPartnerStatus(other);
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const checkPartnerStatus = async (username: string) => {
    const { data } = await supabase.from('profiles').select('last_online').eq('username', username).single();
    if (data) {
        const isOnline = (new Date().getTime() - new Date(data.last_online).getTime()) < 65000;
        setPartnerStatus(prev => ({ ...prev, online: isOnline }));
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !currentChat) return;
    
    const encrypted = CryptoJS.AES.encrypt(inputText, ENCRYPTION_KEY).toString();
    const meta = replyTo ? { 
        id: replyTo.id, 
        sender: replyTo.sender, 
        text: decrypt(replyTo.content, false) 
    } : null;

    const payload = { 
        sender: myUser, 
        receiver: currentChat, 
        content: encrypted,
        reply_metadata: meta,
        is_read: false
    };

    setInputText("");
    setReplyTo(null);
    await supabase.from('messages').insert([payload]);
  };

  const decrypt = (content: string, isSystem: boolean) => {
    if (isSystem) return content;
    try {
      const bytes = CryptoJS.AES.decrypt(content, ENCRYPTION_KEY);
      const original = bytes.toString(CryptoJS.enc.Utf8);
      return original || "🔒 Encrypted";
    } catch { return "🔒 Encrypted"; }
  };

  useEffect(() => {
    if (!myUser) return;
    const channel = supabase.channel('chat_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        if (currentChat) fetchMessages(currentChat, myUser);
        fetchInbox(myUser);
      })
      .on('broadcast', { event: 'typing' }, (p: any) => {
        if (p.payload.receiver === myUser && p.payload.sender === currentChat) {
            setPartnerStatus(prev => ({ ...prev, typing: true }));
            setTimeout(() => setPartnerStatus(prev => ({ ...prev, typing: false })), 3000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentChat, myUser]);

  const sendTypingEvent = () => {
    supabase.channel('chat_realtime').send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender: myUser, receiver: currentChat }
    });
  };

  // --- UI RENDERING (ORIGINAL STYLES PRESERVED) ---
  if (isLocked) {
    return (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-8 cursor-pointer" onClick={() => pinInputRef.current?.focus()}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mb-6">
            <Shield size={40} />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-800">Vault Locked</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-10 text-center">
            {vaultMode === 'setup' ? 'Set your 4-digit security PIN' : 'Authorization Required'}
          </p>
          <div className="flex gap-4 mb-12">
            {[0, 1, 2, 3].map(i => (
              <div key={`dot-${i}`} className={`w-4 h-4 rounded-full border-2 border-blue-600 transition-all duration-200 ${pin.length > i ? 'bg-blue-600 scale-125' : 'bg-transparent'}`} />
            ))}
          </div>
          <input 
            ref={pinInputRef}
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} 
            className="absolute opacity-0 w-full h-full cursor-default" autoFocus 
            value={pin} onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setPin(val);
                if (val.length === 4) handlePinSubmit(val);
            }} 
          />
          <button onClick={() => handlePinSubmit()} className="w-full max-w-xs bg-blue-600 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-sm active:scale-95 transition-transform shadow-lg">
            {vaultMode === 'setup' ? 'Set PIN' : 'Unlock'}
          </button>
        </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-screen flex flex-col bg-[#fdfdfd] text-slate-900 overflow-hidden font-sans">
      {view === 'list' && (
        <>
          <header className="px-6 py-5 flex justify-between items-center bg-white border-b border-slate-50 sticky top-0 z-10">
            <button onClick={() => router.push('/')} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center"><Home size={18}/></button>
            <h1 className="text-lg font-bold tracking-tight">Vault Messages</h1>
            <button onClick={() => setView('settings')} className="w-10 h-10 text-slate-400 flex items-center justify-center"><Settings size={20}/></button>
          </header>

          <div className="flex-1 overflow-y-auto pb-20">
            {inbox.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 p-10 text-center">
                    <Lock size={40} className="mb-4 opacity-20"/>
                    <p className="text-sm font-medium">No secure conversations yet.</p>
                </div>
            ) : inbox.map((chat) => (
              <div key={`chat-row-${chat.id}`} className="relative group overflow-hidden border-b border-slate-50">
                <motion.div whileTap={{ scale: 0.98 }} onClick={() => openChat(chat.otherUser)} className="p-4 flex items-center gap-4 bg-white active:bg-slate-50 transition-colors cursor-pointer relative z-10">
                    <img 
                      src={userImages[chat.otherUser] || `https://ui-avatars.com/api/?name=${chat.otherUser}&background=random&bold=true`} 
                      className="w-14 h-14 rounded-2xl object-cover bg-slate-100 border border-slate-50" 
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-sm text-slate-800">@{chat.otherUser}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{new Date(chat.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-400 truncate w-[80%] font-medium">{decrypt(chat.content, chat.is_system)}</p>
                            {chat.receiver === myUser && !chat.is_read && <span className="w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white shadow-sm"></span>}
                        </div>
                    </div>
                </motion.div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'chat' && (
        <>
          <header className="p-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3">
                <button onClick={() => setView('list')} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition-colors"><ChevronLeft size={22}/></button>
                <div className="relative">
                    <img src={userImages[currentChat!] || `https://ui-avatars.com/api/?name=${currentChat}&background=random&bold=true`} className="w-11 h-11 rounded-2xl object-cover bg-slate-100" />
                    <div className={`w-3 h-3 border-2 border-white rounded-full absolute -bottom-0.5 -right-0.5 shadow-sm transition-colors ${partnerStatus.online ? 'bg-green-500' : 'bg-slate-300'}`} />
                </div>
                <div className="flex flex-col">
                    <h2 className="font-bold text-sm text-slate-800 leading-none mb-1">@{currentChat}</h2>
                    <div className="flex items-center gap-1">
                        {partnerStatus.typing ? (
                            <div className="flex gap-0.5 items-center px-1">
                                <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-blue-600 rounded-full" />
                                <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-blue-600 rounded-full" />
                                <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-blue-600 rounded-full" />
                            </div>
                        ) : (
                            <span className={`text-[9px] font-black uppercase tracking-widest ${partnerStatus.online ? 'text-green-500' : 'text-slate-400'}`}>
                                {partnerStatus.online ? 'Active Now' : 'Offline'}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <button className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-red-500 rounded-xl transition-all"><UserMinus size={18}/></button>
          </header>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#f8fafc]">
            {messages.map((m) => {
              const isMe = m.sender === myUser;
              return (
                <motion.div 
                    key={`msg-${m.id}`} 
                    drag="x" dragConstraints={{ left: 0, right: 100 }}
                    onDragEnd={(e, info) => info.offset.x > 60 && setReplyTo(m)}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className={`px-4 py-3 rounded-2xl text-sm max-w-[85%] shadow-sm relative group ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                    {m.reply_metadata && (
                        <div className={`text-[10px] p-2 mb-2 rounded-lg border-l-4 truncate ${isMe ? 'bg-white/10 border-white text-white/80' : 'bg-slate-50 border-blue-500 text-slate-500'}`}>
                            <b className="block uppercase opacity-70">{m.reply_metadata.sender === myUser ? 'You' : m.reply_metadata.sender}</b>
                            {m.reply_metadata.text}
                        </div>
                    )}
                    <p className="font-medium leading-relaxed">{decrypt(m.content, m.is_system || false)}</p>
                    
                    <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                       <span className="text-[9px]">{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                       {isMe && (
                         m.is_read ? <CheckCheck size={12} className="text-blue-200" /> : <Check size={12} className="text-white/50" />
                       )}
                    </div>

                    <div className={`absolute top-1/2 -right-8 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 ${isMe ? 'left-[-32px] right-auto' : ''}`}>
                        <Reply size={16}/>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <div ref={scrollRef} className="h-4" />
          </div>

          <footer className="bg-white border-t border-slate-100 p-4 pb-8 space-y-3">
            <AnimatePresence>
                {replyTo && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border-l-4 border-blue-600 overflow-hidden">
                        <div className="flex-1 truncate pr-4">
                            <span className="text-[10px] font-black text-blue-600 uppercase block">Replying to {replyTo.sender === myUser ? 'yourself' : `@${replyTo.sender}`}</span>
                            <span className="text-xs text-slate-500 truncate">{decrypt(replyTo.content, false)}</span>
                        </div>
                        <button onClick={() => setReplyTo(null)} className="text-slate-400 p-1"><X size={16}/></button>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-2xl">
              <input 
                value={inputText} 
                onChange={e => { 
                    setInputText(e.target.value); 
                    sendTypingEvent();
                }} 
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
                placeholder="Type a secure message..." className="flex-1 bg-transparent px-3 py-2 outline-none text-sm font-medium" 
              />
              <button onClick={handleSendMessage} className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center active:scale-90 transition-transform"><Send size={18}/></button>
            </div>
          </footer>
        </>
      )}

      {view === 'settings' && (
        <div className="flex-1 p-8 space-y-10">
            <div className="flex items-center gap-4">
                <button onClick={() => setView('list')} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl"><ChevronLeft/></button>
                <h2 className="text-xl font-bold tracking-tight">Vault Security</h2>
            </div>
            <div className="pt-4 space-y-3">
                <button onClick={async () => {
                    await supabase.from('vault_configs').update({ lock_timeout: timeoutPref, hint: setupHint }).eq('username', myUser);
                    setView('list');
                }} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest">
                    Save Security Preferences
                </button>
                <button onClick={() => { setIsLocked(true); setPin(""); }} className="w-full py-5 rounded-2xl bg-red-50 text-red-500 font-black text-sm flex items-center justify-center gap-3">
                    <LogOut size={18}/> Lock Vault Now
                </button>
            </div>
        </div>
      )}
    </div>
  );
}