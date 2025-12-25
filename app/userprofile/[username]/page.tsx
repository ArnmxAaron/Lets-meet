"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, firebase } from "@/lib/firebaseConfig";
import { createClient } from "@supabase/supabase-js"; 
import Link from "next/link";
import dynamic from "next/dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function UserProfilePage() {
  const params = useParams();
  const usernameParam = params?.username; 
  const router = useRouter();
  
  const [userData, setUserData] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);

  const [modal, setModal] = useState<{show: boolean, msg: string, type: 'success' | 'error' | 'info'}>({
    show: false, msg: '', type: 'info'
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ class: "", bio: "", country: "" });

  const myUsername = typeof window !== 'undefined' ? localStorage.getItem("username") : null;
  const isMyProfile = myUsername?.toLowerCase() === usernameParam?.toString().toLowerCase();

  const showPopup = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setModal({ show: true, msg, type });
    setTimeout(() => setModal(prev => ({ ...prev, show: false })), 3000);
  };

  const getCountryCode = (name: string) => {
    const countries: any = { 
      'sierra leone': 'sl', 'nigeria': 'ng', 'ghana': 'gh', 'liberia': 'lr',
      'united states': 'us', 'united kingdom': 'gb', 'india': 'in', 'gambia': 'gm'
    };
    return countries[name?.toLowerCase()] || 'sl';
  };

  const formatLastSeen = (timestamp: any) => {
    if (!timestamp) return "Long ago";
    const date = timestamp.toDate();
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return date.toLocaleDateString();
  };

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
    if (!isLoggedIn) { router.replace("/profile"); return; }

    const fetchUserAndPosts = async () => {
      if (!usernameParam) return;
      const searchName = usernameParam.toString().trim();

      try {
        const unsubscribeUser = db.collection("users")
          .where("username", ">=", searchName)
          .where("username", "<=", searchName + '\uf8ff')
          .onSnapshot((querySnapshot) => {
            const doc = querySnapshot.docs.find(
              d => d.data().username.toLowerCase() === searchName.toLowerCase()
            );

            if (doc) {
              const data = doc.data();
              setUserData(data);
              setEditForm({
                class: data?.class || "JHS/JSS",
                bio: data?.bio || "",
                country: data?.country || "Sierra Leone"
              });

              // FIX: Case-insensitive follow check
              const amIFollowing = data.followersList?.some(
                (f: string) => f.toLowerCase() === myUsername?.toLowerCase()
              );
              setIsFollowing(!!amIFollowing);

            } else {
              setUserData(null);
            }
            setLoading(false);
          });

        const unsubscribePosts = db.collection("global_feed")
          .onSnapshot((snapshot) => {
            const posts: any[] = [];
            snapshot.forEach((doc) => {
              const postData = doc.data();
              if (postData.username?.toLowerCase() === searchName.toLowerCase()) {
                posts.push({ id: doc.id, ...postData });
              }
            });
            setUserPosts(posts.sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds));
          });

        return () => { unsubscribeUser(); unsubscribePosts(); };
      } catch (error) {
        console.error("Fetch error:", error);
        setLoading(false);
      }
    };

    fetchUserAndPosts();
  }, [usernameParam, router, myUsername]);

  const handleUpdateProfile = async () => {
    if (!userData || !myUsername) return;
    setIsUploading(true);
    try {
      // Use the fetched username for the doc ID to ensure it matches
      const userRef = db.collection("users").doc(userData.username);
      await userRef.update({
        class: editForm.class,
        bio: editForm.bio,
        country: editForm.country
      });
      showPopup("Profile Updated!", "success");
      setIsEditMode(false);
    } catch (err) { showPopup("Error updating", "error"); }
    finally { setIsUploading(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'profilePic' | 'coverPic') => {
    const file = e.target.files?.[0];
    if (!file || !userData) return;
    setIsUploading(true);
    const fileName = `${type}-${userData.username}-${Date.now()}`;
    try {
      const { data, error } = await supabase.storage.from('avatars').upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await db.collection("users").doc(userData.username).update({ [type]: publicUrl });
      showPopup("Photo Updated!", "success");
    } catch (err) { showPopup("Upload failed", "error"); }
    finally { setIsUploading(false); }
  };

  const handleFollow = async () => {
    if (!myUsername || isMyProfile || !userData) return;

    // Use exact casing from the database
    const targetDocName = userData.username; 
    const myDocName = myUsername; 

    const theirRef = db.collection("users").doc(targetDocName);
    const myRef = db.collection("users").doc(myDocName);

    try {
      if (isFollowing) {
        await theirRef.update({ 
          followers: firebase.firestore.FieldValue.increment(-1), 
          followersList: firebase.firestore.FieldValue.arrayRemove(myUsername) 
        });
        await myRef.update({ following: firebase.firestore.FieldValue.increment(-1) });
        setIsFollowing(false);
        showPopup("Unfollowed", "info");
      } else {
        await theirRef.update({ 
          followers: firebase.firestore.FieldValue.increment(1), 
          followersList: firebase.firestore.FieldValue.arrayUnion(myUsername) 
        });
        await myRef.update({ following: firebase.firestore.FieldValue.increment(1) });
        setIsFollowing(true);
        showPopup("Following!", "success");
      }
    } catch (err) { 
      console.error("Follow error:", err);
      showPopup("Action failed", "error");
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  if (!userData) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <h1 className="text-6xl font-black text-slate-200">404</h1>
      <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-4">Student "{usernameParam}" not found</p>
      <Link href="/" className="mt-8 px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase">Go Back Home</Link>
    </div>
  );

  return (
    <div className="bg-[#f8fafc] min-h-screen font-poppins pb-24">
      {modal.show && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl animate-in slide-in-from-top">{modal.msg}</div>
      )}

      {/* Hero Section */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto relative">
          <div className="h-48 md:h-72 bg-slate-200 relative overflow-hidden">
            {userData.coverPic ? <img src={userData.coverPic} className="w-full h-full object-cover" alt="cover" /> : <div className="w-full h-full bg-gradient-to-tr from-blue-600 to-indigo-900 flex items-center justify-center text-white/20 font-black text-[10px] uppercase tracking-widest">No Cover Photo</div>}
            {isMyProfile && isEditMode && (
              <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 cursor-pointer"><i className="fas fa-camera text-white mb-1"></i><span className="text-white text-[9px] font-black uppercase">Change Cover</span><input type="file" className="hidden" onChange={(e) => handleImageUpload(e, 'coverPic')} /></label>
            )}
            <Link href="/" className="absolute top-4 left-4 bg-white/20 p-2 rounded-full text-white backdrop-blur-md w-10 h-10 flex items-center justify-center z-40"><i className="fas fa-arrow-left"></i></Link>
          </div>

          <div className="px-5">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-6 -mt-16 md:-mt-20 relative z-10">
              <div className="relative">
                <img src={userData.profilePic || `https://ui-avatars.com/api/?name=${userData.username}&background=0284c7&color=fff`} className="w-36 h-36 md:w-44 md:h-44 rounded-[3rem] border-8 border-white object-cover shadow-2xl bg-white" alt="profile" />
                {isMyProfile && isEditMode && (
                  <label className="absolute inset-0 rounded-[3rem] flex items-center justify-center bg-black/40 cursor-pointer"><i className="fas fa-camera text-white"></i><input type="file" className="hidden" onChange={(e) => handleImageUpload(e, 'profilePic')} /></label>
                )}
                {userData.online && <div className="absolute bottom-4 right-4 w-6 h-6 border-4 border-white rounded-full bg-green-500 animate-pulse"></div>}
              </div>

              <div className="text-center md:text-left flex-1 mb-2">
                <div className="flex items-center justify-center md:justify-start gap-2">
                   <h1 className="text-3xl font-black text-slate-900 tracking-tight">{userData.username}</h1>
                   {userData.followers >= 50 && <i className="fas fa-check-circle text-blue-500 text-lg"></i>}
                </div>
                <div className="flex gap-4 text-[11px] font-black text-slate-400 uppercase tracking-widest mt-2 justify-center md:justify-start">
                   <p><span className="text-blue-600 font-black">{userData.followers || 0}</span> Fans</p>
                   <p><span className="text-slate-900 font-black">{userData.following || 0}</span> Following</p>
                </div>
                <p className="text-[9px] font-black uppercase mt-2">
                   {userData.online ? <span className="text-green-500">Currently Online</span> : <span className="text-slate-400">Active {formatLastSeen(userData.lastSeen)}</span>}
                </p>
              </div>

              {/* Arranged Follow Button Group */}
              <div className="flex gap-2 w-full md:w-auto mb-2">
                {isMyProfile ? (
                  <button 
                    onClick={() => setIsEditMode(!isEditMode)} 
                    className="flex-1 md:flex-none px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-slate-800 transition-all active:scale-95"
                  >
                    {isEditMode ? "Exit Edit" : "Edit Profile"}
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={handleFollow} 
                      className={`flex-1 md:flex-none px-12 py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg transition-all transform active:scale-95 ${
                        isFollowing 
                          ? 'bg-slate-100 text-slate-600 border border-slate-200' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                      }`}
                    >
                      {isFollowing ? (
                        <span className="flex items-center justify-center"><i className="fas fa-user-check mr-2"></i>Following</span>
                      ) : (
                        <span className="flex items-center justify-center"><i className="fas fa-user-plus mr-2"></i>Follow</span>
                      )}
                    </button>
                    
                    <button 
                      onClick={() => { localStorage.setItem('chattingWith', userData.username); router.push('/chat'); }} 
                      className="p-4 bg-white border border-slate-200 text-blue-600 rounded-2xl shadow-sm hover:bg-blue-50 transition-all active:scale-95"
                    >
                      <i className="fas fa-comment-dots text-lg"></i>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex mt-10 border-t border-slate-50">
              <button onClick={() => setActiveTab('posts')} className={`px-10 py-5 text-[10px] font-black uppercase border-b-2 transition-all ${activeTab === 'posts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>Activity Feed</button>
              <button onClick={() => setActiveTab('about')} className={`px-10 py-5 text-[10px] font-black uppercase border-b-2 transition-all ${activeTab === 'about' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>Full Bio</button>
            </div>
          </div>
        </div>
      </div>
      
      {/* ... Rest of your component (EditModePanel, Main Grid) stays exactly the same ... */}
      {isEditMode && isMyProfile && (
        <div className="max-w-4xl mx-auto px-5 mt-6 animate-in slide-in-from-top-4">
          <div className="bg-white p-8 rounded-[2.5rem] border-2 border-blue-50 shadow-2xl space-y-6">
            <h2 className="text-[10px] font-black uppercase text-blue-600 tracking-widest ml-2">Update Account Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Academic Level</label>
                <select value={editForm.class} onChange={(e) => setEditForm({...editForm, class: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-xs font-bold border-none outline-blue-500"><option value="JHS/JSS">JHS/JSS</option><option value="SHS/SSS">SHS/SSS</option><option value="University">University</option></select>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Country</label>
                <input type="text" value={editForm.country} onChange={(e) => setEditForm({...editForm, country: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-xs font-bold border-none outline-blue-500" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Personal Bio</label>
                <input type="text" value={editForm.bio} onChange={(e) => setEditForm({...editForm, bio: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-xs font-bold border-none outline-blue-500" />
              </div>
            </div>
            <button onClick={handleUpdateProfile} disabled={isUploading} className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase shadow-lg shadow-blue-100 disabled:opacity-50">{isUploading ? "Updating..." : "Save Profile Details"}</button>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-5 mt-10 grid grid-cols-1 md:grid-cols-5 gap-10">
        <div className="md:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
             <h3 className="font-black text-[10px] text-slate-300 uppercase tracking-[0.3em]">Quick Overview</h3>
             <div className="space-y-5">
                <div className="flex items-center gap-5">
                   <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-lg"><i className="fas fa-graduation-cap"></i></div>
                   <div><p className="text-[9px] font-bold text-slate-400 uppercase">Level</p><p className="text-sm font-black text-slate-800">{userData.class || 'Student'}</p></div>
                </div>
                <div className="flex items-center gap-5">
                   <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center">
                      <img src={`https://flagcdn.com/w40/${getCountryCode(userData.country)}.png`} className="w-6" alt="flag" />
                   </div>
                   <div><p className="text-[9px] font-bold text-slate-400 uppercase">From</p><p className="text-sm font-black text-slate-800">{userData.country || 'Sierra Leone'}</p></div>
                </div>
                <div className="pt-4 border-t border-slate-50"><p className="text-xs text-slate-500 italic leading-relaxed font-medium">"{userData.bio || 'This student hasn\'t added a bio yet.'}"</p></div>
             </div>
          </div>
        </div>

        <div className="md:col-span-3">
          {activeTab === 'posts' ? (
            <div className="space-y-8">
              {userPosts.length > 0 ? userPosts.map((post) => (
                <div key={post.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 mb-5">
                    <img src={post.profilePic || `https://ui-avatars.com/api/?name=${post.username}`} className="w-11 h-11 rounded-2xl object-cover" />
                    <div><p className="text-xs font-black text-slate-800">{post.username}</p><p className="text-[9px] text-slate-400 font-bold uppercase">{post.timestamp?.toDate().toLocaleDateString()}</p></div>
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed font-medium">{post.text}</p>
                </div>
              )) : (
                <div className="text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                  <p className="font-black text-slate-300 uppercase tracking-widest text-[10px]">No activity recorded</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 flex flex-col items-center justify-center text-center">
               <div className="w-20 h-20 bg-blue-50 rounded-[2rem] flex items-center justify-center text-blue-600 text-3xl mb-4"><i className="fas fa-fingerprint"></i></div>
               <h3 className="font-black uppercase text-xs text-slate-400 tracking-widest">Verified Account ID</h3>
               <p className="text-lg font-black text-blue-600 mt-2 uppercase">{userData.username}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(UserProfilePage), { ssr: false });