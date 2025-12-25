"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebaseConfig"; 
import firebase from "firebase/compat/app"; 
import { createClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";

// Initialize Supabase Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function HomePage() {
  const router = useRouter();
  
  // States
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [trendingUsers, setTrendingUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSplash, setShowSplash] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [followedList, setFollowedList] = useState<string[]>([]);
  const [modal, setModal] = useState({ show: false, username: "" });
  const [isProcessing, setIsProcessing] = useState(false);
  const [localUser, setLocalUser] = useState({ username: "", avatar: "" });

  const itemsPerPage = 8;

  // Assets Helpers
  const fallbackAvatar = (name: string) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=0284c7&color=fff`;
  const defaultCover = "https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000&auto=format&fit=crop";

  // --- NEW UPDATE: WRAPPED IN CALLBACK FOR STABILITY ---
  const fetchUnreadCount = useCallback(async (username: string) => {
    if (!username) return;
    try {
      const lastCleared = localStorage.getItem(`lastCleared_${username}`);
      
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .or(`receiver_id.eq.${username},receiver_id.eq.GLOBAL`)
        .eq('is_read', false);

      if (lastCleared) {
        query = query.gt('created_at', lastCleared);
      }

      const { count, error } = await query;
      if (!error) setNotifCount(count || 0);
    } catch (err) {
      console.error("Error fetching count:", err);
    }
  }, []);

  // --- EFFECT: AUTH, DATA INITIALIZATION & REALTIME ---
  useEffect(() => {
    const loggedIn = localStorage.getItem("isLoggedIn") === "true";
    const savedUsername = localStorage.getItem("username") || "";
    const savedAvatar = localStorage.getItem("userAvatar") || "";
    const savedFollows = JSON.parse(localStorage.getItem("followed_list") || "[]");
    
    setFollowedList(savedFollows);

    if (loggedIn) {
      setIsAuthorized(true);
      setLocalUser({
        username: savedUsername,
        avatar: savedAvatar && savedAvatar.trim() !== "" ? savedAvatar : fallbackAvatar(savedUsername)
      });

      if (sessionStorage.getItem("splashShown")) {
        setShowSplash(false);
      } else {
        const timer = setTimeout(() => {
          setShowSplash(false);
          sessionStorage.setItem("splashShown", "true");
        }, 2500);
        return () => clearTimeout(timer);
      }
    } else {
      router.replace("/profile");
      return;
    }

    const myUsername = savedUsername.toLowerCase();
    
    // FETCHING USERS FROM FIREBASE (Realtime Stream)
    const unsubscribeUsers = db.collection("users")
      .orderBy("followers", "desc")
      .onSnapshot((snapshot) => {
        const users: any[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.username?.toLowerCase() !== myUsername) {
            users.push({ id: doc.id, ...data });
          }
        });
        setAllUsers(users);
        setTrendingUsers(users.slice(0, 8));
        setFilteredUsers(users);
        setLoading(false);
      }, (error) => {
        console.error("Firebase error:", error);
        setLoading(false);
      });

    // 1. Initial Call
    fetchUnreadCount(savedUsername);

    // 2. NEW UPDATE: WINDOW FOCUS LISTENER (Clears badge when returning to home)
    const handleFocus = () => fetchUnreadCount(savedUsername);
    window.addEventListener('focus', handleFocus);

    // 3. SUPABASE REALTIME NOTIFICATIONS
    const notifChannel = supabase
      .channel('home-notif-sync')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'notifications' }, 
        () => {
          fetchUnreadCount(savedUsername);
        }
      ).subscribe();

    return () => {
      unsubscribeUsers();
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(notifChannel);
    };
  }, [router, fetchUnreadCount]);

  // --- EFFECT: SEARCH LOGIC ---
  useEffect(() => {
    const query = searchQuery.toLowerCase();
    const filtered = allUsers.filter(user => 
      user.username?.toLowerCase().includes(query) || 
      user.country?.toLowerCase().includes(query) || 
      user.class?.toLowerCase().includes(query)
    );
    setFilteredUsers(filtered);
    setCurrentPage(1);
  }, [searchQuery, allUsers]);

  // --- FUNCTION: HANDLE FOLLOW ---
  const handleFollow = async (targetUser: any) => {
    if (followedList.includes(targetUser.id) || isProcessing) return;
    setIsProcessing(true);
    try {
      const myUsername = localStorage.getItem("username") || "Guest";
      const myCountry = localStorage.getItem("userCountry") || "Sierra Leone";

      await db.collection("users").doc(targetUser.id).update({
        followers: firebase.firestore.FieldValue.increment(1)
      });

      await supabase.from('user_follows').insert([
        { follower_id: myUsername, following_id: targetUser.username }
      ]);

      await supabase.from('notifications').insert([{
        receiver_id: targetUser.username,
        sender_id: myUsername,
        sender_pic: localUser.avatar,
        sender_country: myCountry,
        type: "follow",
        content: "started following you!",
        is_read: false
      }]);

      const newFollowedList = [...followedList, targetUser.id];
      setFollowedList(newFollowedList);
      localStorage.setItem("followed_list", JSON.stringify(newFollowedList));
      setModal({ show: true, username: targetUser.username });
    } catch (error) {
      console.error("Follow error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- FUNCTION: HANDLE SHARE ---
  const handleShare = async () => {
    const shareData = { title: "Let's Meet", text: "Join me on Aaron's Easy Learning!", url: window.location.origin };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        navigator.clipboard.writeText(window.location.origin);
        setModal({ show: true, username: "Link Copied!" });
      }
    } catch (err) { console.log(err); }
  };

  // --- HELPER: COUNTRY CODE ---
  const getCountryCode = (name: string) => {
    const countries: any = { 
        'sierra leone': 'sl', 'nigeria': 'ng', 'ghana': 'gh', 'liberia': 'lr',
        'united states': 'us', 'united kingdom': 'gb', 'india': 'in' 
    };
    return countries[name?.toLowerCase()] || 'sl';
  };

  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (!isAuthorized && !showSplash) return null;

  return (
    <div className="pb-24 bg-[#f8fafc] min-h-screen font-poppins text-slate-900 overflow-x-hidden">
      
      {/* SUCCESS MODAL */}
      {modal.show && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setModal({ ...modal, show: false })}></div>
          <div className="relative bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 shadow-inner">
              <i className="fas fa-user-plus"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">Success!</h3>
            <p className="text-slate-500 font-medium mb-8">
              You are now following <span className="text-blue-600 font-bold">@{modal.username}</span>
            </p>
            <button onClick={() => setModal({ ...modal, show: false })} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 active:scale-95 transition-transform">
              Great!
            </button>
          </div>
        </div>
      )}

      {/* SIDE DRAWER */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)}></div>
          <div className="relative w-72 bg-white h-full shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
            <div className="p-6 bg-blue-600 text-white">
                <h2 className="font-black text-2xl tracking-tighter">Menu</h2>
                <p className="text-[10px] uppercase font-bold opacity-70">Aaron's Learning</p>
            </div>
            <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                <Link href="/exams" className="flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl">
                    <i className="fas fa-file-signature text-blue-500 w-5"></i>
                    <span className="text-sm font-bold text-slate-700">Take Exam</span>
                </Link>
                <Link href="/developer" className="flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl">
                    <i className="fas fa-code text-purple-500 w-5"></i>
                    <span className="text-sm font-bold text-slate-700">Developer</span>
                </Link>
                <button onClick={handleShare} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl text-left">
                    <i className="fas fa-paper-plane text-orange-500 w-5"></i>
                    <span className="text-sm font-bold text-slate-700">Share with Friends</span>
                </button>
            </div>
          </div>
        </div>
      )}

      {/* SPLASH SCREEN */}
      {showSplash && (
        <div className="fixed inset-0 z-[9999] bg-blue-600 flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center mb-6">
            <div className="w-[60px] h-[60px] border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            <div className="absolute text-white text-2xl"><i className="fas fa-bolt"></i></div>
          </div>
          <h1 className="text-white text-3xl font-bold tracking-tight">Let's Meet</h1>
          <p className="text-blue-100 text-[10px] mt-2 uppercase tracking-widest font-black">Aaron's Easy Learning</p>
        </div>
      )}

      {/* STICKY HEADER */}
      <header className="bg-white/80 backdrop-blur-md p-4 flex justify-between items-center sticky top-0 z-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsDrawerOpen(true)} className="w-10 h-10 flex items-center justify-center text-slate-600">
            <i className="fas fa-bars-staggered text-lg"></i>
          </button>
          <h1 className="font-black text-xl text-blue-600 tracking-tighter">LM.</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/notification" className="relative cursor-pointer">
            <i className="fas fa-bell text-slate-400 text-xl"></i>
            {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white animate-pulse">
                    {notifCount > 9 ? '9+' : notifCount}
                </span>
            )}
          </Link>

          <Link href={`/userprofile/${encodeURIComponent(localUser.username)}`}>
            <img src={localUser.avatar || fallbackAvatar(localUser.username)} className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover" alt="Me" />
          </Link>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* SEARCH BAR */}
        <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-100">
          <div className="flex items-center bg-slate-50 rounded-2xl px-4 py-3">
            <i className="fas fa-search text-slate-300 text-sm"></i>
            <input 
              type="text" 
              placeholder="Search students..." 
              className="bg-transparent border-none outline-none text-xs ml-3 w-full font-bold text-slate-600"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* TRENDING SECTION */}
        {!searchQuery && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <i className="fas fa-fire text-orange-500 text-xs"></i>
              <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Trending</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
              {trendingUsers.map((user) => (
                <Link href={`/userprofile/${encodeURIComponent(user.username)}`} key={user.id} className="flex-shrink-0 flex flex-col items-center gap-2">
                  <div className="relative p-0.5 border-2 border-blue-500 rounded-full">
                    <img src={(user.profilePic && user.profilePic.trim() !== "") ? user.profilePic : fallbackAvatar(user.username)} className="w-14 h-14 rounded-full object-cover bg-white" alt={user.username} />
                  </div>
                  <span className="text-[9px] font-black text-slate-700 truncate w-16 text-center">{user.username}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* PAGINATION CONTROLS */}
        <div className="flex justify-between items-center px-1">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discover All</h2>
          <div className="flex items-center gap-2 bg-white rounded-full border border-slate-100 px-3 py-1">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="text-blue-600 disabled:text-slate-200"><i className="fas fa-caret-left"></i></button>
            <span className="text-[10px] font-black text-slate-600">{currentPage}</span>
            <button disabled={currentPage * itemsPerPage >= filteredUsers.length} onClick={() => setCurrentPage(p => p + 1)} className="text-blue-600 disabled:text-slate-200"><i className="fas fa-caret-right"></i></button>
          </div>
        </div>

        {/* USER GRID */}
        <div className="grid grid-cols-2 gap-4">
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-[2.2rem] h-52 animate-pulse border border-slate-100"></div>)
          ) : paginatedUsers.map((user) => {
            const isFollowed = followedList.includes(user.id);
            return (
              <div key={user.id} className="bg-white rounded-[2.2rem] overflow-hidden border border-slate-100 shadow-sm flex flex-col">
                <Link href={`/userprofile/${encodeURIComponent(user.username)}`}>
                  <div className="h-20 w-full relative">
                      <img src={(user.coverPic && user.coverPic.trim() !== "") ? user.coverPic : defaultCover} className="w-full h-full object-cover" alt="cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                  </div>
                  <div className="px-4 pb-2 -mt-8 relative z-10">
                    <div className="flex justify-between items-start">
                      <div className="relative">
                        <img src={(user.profilePic && user.profilePic.trim() !== "") ? user.profilePic : fallbackAvatar(user.username)} className="w-14 h-14 rounded-2xl object-cover border-4 border-white shadow-md bg-white" alt={user.username} />
                        <div className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${user.online ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                      </div>
                      <div className="text-right mt-9">
                        <p className="text-[11px] font-black text-blue-600 leading-none">{user.followers || 0}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">Fans</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center gap-1">
                        <h4 className="font-black text-[12px] text-slate-800 truncate">{user.username}</h4>
                        {user.followers >= 500 && <i className="fas fa-check-circle text-blue-500 text-[9px]"></i>}
                      </div>
                      <div className="flex items-center gap-1">
                        <img src={`https://flagcdn.com/w20/${getCountryCode(user.country)}.png`} className="w-3 rounded-[1px]" alt="flag" />
                        <p className="text-[8px] font-black text-slate-400 uppercase truncate">{user.country}</p>
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="px-3 pb-4 flex gap-2 mt-auto">
                  <button 
                    disabled={isFollowed || isProcessing}
                    onClick={() => handleFollow(user)}
                    className={`flex-1 text-[8px] font-black py-2.5 rounded-xl uppercase transition-all ${isFollowed ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white active:scale-95 shadow-md shadow-blue-100'}`}
                  >
                    {isFollowed ? 'Following' : 'Follow'}
                  </button>
                  <button onClick={() => { localStorage.setItem('chattingWith', user.username); router.push('/chat'); }} className="w-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center active:bg-slate-200">
                    <i className="fas fa-comment-dots text-xs"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 w-full h-[85px] bg-white/80 backdrop-blur-xl border-t border-slate-100 flex justify-around items-center px-6 z-[100]">
          <Link href="/" className="flex flex-col items-center text-blue-600">
            <i className="fas fa-house text-lg"></i><span className="text-[9px] font-black mt-1">Home</span>
          </Link>
          <Link href="/chat" className="flex flex-col items-center text-slate-300">
            <i className="fas fa-message text-lg"></i><span className="text-[9px] font-black mt-1">Chats</span>
          </Link>
          <Link href="/postupdate" className="w-14 h-14 bg-blue-600 rounded-2xl -mt-10 border-4 border-[#f8fafc] flex items-center justify-center text-white shadow-xl shadow-blue-200 rotate-45">
            <i className="fas fa-plus -rotate-45 text-xl"></i>
          </Link>
          <Link href="/learn" className="flex flex-col items-center text-slate-300">
            <i className="fas fa-book-open text-lg"></i><span className="text-[9px] font-black mt-1">Learn</span>
          </Link>
          <Link href="/videos" className="flex flex-col items-center text-slate-300">
            <i className="fas fa-circle-play text-lg"></i><span className="text-[9px] font-black mt-1">Videos</span>
          </Link>
      </nav>
    </div>
  );
}

export default dynamic(() => Promise.resolve(HomePage), { ssr: false });