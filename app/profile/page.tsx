"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, supabase, firebase } from "@/lib/firebaseConfig";
import CryptoJS from "crypto-js";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [loading, setLoading] = useState(false);
  
  // Previews
  const [imgPreview, setImgPreview] = useState("https://ui-avatars.com/api/?background=f1f5f9&color=cbd5e1&name=?");
  const [coverPreview, setCoverPreview] = useState("");
  
  // Files
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCover, setSelectedCover] = useState<File | null>(null);

  const [localUser, setLocalUser] = useState({
    username: "",
    avatar: "",
    class: "",
    country: "",
    bio: ""
  });

  const [formData, setFormData] = useState({
    username: "",
    uClass: "JHS/JSS",
    uCountry: "Sierra Leone",
    uBio: "",
    uPin: ""
  });

  const [notification, setNotification] = useState({ show: false, text: "", type: 'info' });

  useEffect(() => {
    const logged = localStorage.getItem('isLoggedIn');
    if (logged === 'true') {
      setIsLoggedIn(true);
      setLocalUser({
        username: localStorage.getItem('username') || "",
        avatar: localStorage.getItem('userAvatar') || "",
        class: localStorage.getItem('userClass') || "",
        country: localStorage.getItem('userCountry') || "",
        bio: localStorage.getItem('userBio') || ""
      });
      updateOnlineStatus(localStorage.getItem('username'));
    }
  }, []);

  const showNotification = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
    setNotification({ show: true, text, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3500);
  };

  const updateOnlineStatus = async (user: string | null, status: boolean = true) => {
    if (user) {
      await db.collection("users").doc(user.toLowerCase()).update({
        online: status,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => { });
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    const { username, uClass, uCountry, uBio, uPin } = formData;
    const cleanUsername = username.trim().toLowerCase();
    const hash = CryptoJS.SHA256("salt_" + uPin).toString();

    try {
      if (authMode === 'signup') {
        if (!selectedFile) throw new Error("Profile picture is mandatory");
        if (username.includes('@')) throw new Error("Username cannot be an email");
        if (uPin.length < 4) throw new Error("PIN must be at least 4 digits");

        const checkDoc = await db.collection("users").doc(cleanUsername).get();
        if (checkDoc.exists) throw new Error("Username already taken!");

        // 1. Upload Profile Picture
        const pfpExt = selectedFile.name.split('.').pop();
        const pfpName = `${cleanUsername}-pfp-${Date.now()}.${pfpExt}`;
        const { error: pfpError } = await supabase.storage.from('avatars').upload(pfpName, selectedFile);
        if (pfpError) throw new Error("Profile picture upload failed");
        const { data: { publicUrl: pfpUrl } } = supabase.storage.from('avatars').getPublicUrl(pfpName);

        // 2. Upload Cover Photo
        let finalCoverUrl = "";
        if (selectedCover) {
            const cvrExt = selectedCover.name.split('.').pop();
            const cvrName = `${cleanUsername}-cover-${Date.now()}.${cvrExt}`;
            const { error: cvrError } = await supabase.storage.from('avatars').upload(cvrName, selectedCover);
            if (!cvrError) {
                const { data: { publicUrl: cvrUrl } } = supabase.storage.from('avatars').getPublicUrl(cvrName);
                finalCoverUrl = cvrUrl;
            }
        }

        const userData = {
          username: cleanUsername,
          class: uClass,
          country: uCountry,
          bio: uBio || "Student at Aaron's Learning",
          profilePic: pfpUrl,
          coverPic: finalCoverUrl,
          pinHash: hash,
          online: true,
          followers: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("users").doc(cleanUsername).set(userData);
        saveLocal(userData);
        showNotification("Account created! Redirecting...", "success");

      } else {
        const doc = await db.collection("users").doc(cleanUsername).get();
        if (!doc.exists) throw new Error("User not found");

        const dbData = doc.data();
        if (dbData?.pinHash !== hash) throw new Error("Invalid PIN");

        saveLocal(dbData);
        await updateOnlineStatus(cleanUsername, true);
        showNotification("Welcome back!", "success");
      }

      setTimeout(() => { window.location.href = "/"; }, 500);

    } catch (err: any) {
      showNotification(err.message, 'error');
      setLoading(false);
    }
  };

  const saveLocal = (data: any) => {
    localStorage.setItem('username', data.username);
    localStorage.setItem('userAvatar', data.profilePic || data.avatar);
    localStorage.setItem('userClass', data.class);
    localStorage.setItem('userCountry', data.country);
    localStorage.setItem('userBio', data.bio);
    localStorage.setItem('isLoggedIn', 'true');
  };

  return (
    <div className="bg-[#f8fafc] min-h-screen font-poppins text-slate-900 pb-10">
      
      {/* Dynamic Cover Preview */}
      <div className={`h-44 w-full relative transition-all duration-500 overflow-hidden ${!coverPreview ? 'bg-gradient-to-br from-blue-600 to-blue-800' : ''}`}>
        {coverPreview && <img src={coverPreview} className="w-full h-full object-cover animate-in fade-in" alt="cover" />}
        <Link href="/" className="absolute top-6 left-6 text-white/80 z-20"><i className="fas fa-arrow-left"></i></Link>
        
        {/* Fixed "Add Cover" positioning so it doesn't block tabs */}
        {authMode === 'signup' && (
            <label className="absolute top-6 right-6 bg-white/20 backdrop-blur-md text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase cursor-pointer border border-white/30 hover:bg-white/40 transition-all z-20 shadow-lg">
                <i className="fas fa-camera mr-2"></i> Cover Photo
                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                    if (e.target.files?.[0]) {
                        setSelectedCover(e.target.files[0]);
                        setCoverPreview(URL.createObjectURL(e.target.files[0]));
                    }
                }} />
            </label>
        )}
      </div>

      <div className="px-6 -mt-10 relative z-10 max-w-md mx-auto">
        {isLoggedIn ? (
          <div className="bg-white rounded-[2rem] p-6 shadow-xl text-center animate-in fade-in zoom-in duration-300">
            <img src={localUser.avatar || ""} className="w-24 h-24 rounded-3xl mx-auto -mt-16 border-4 border-white shadow-lg object-cover" alt="pfp" />
            <h2 className="font-bold text-lg mt-4 uppercase tracking-tight">{localUser.username}</h2>
            <div className="flex justify-center gap-2 mt-2">
              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold">{localUser.class}</span>
              <span className="px-3 py-1 bg-slate-50 text-slate-500 rounded-full text-[10px] font-bold">{localUser.country}</span>
            </div>
            <button
              onClick={() => {
                updateOnlineStatus(localUser.username, false).then(() => {
                  localStorage.clear();
                  window.location.href = "/profile";
                });
              }}
              className="w-full mt-6 py-3 text-red-500 font-bold text-xs border border-red-50 rounded-xl active:bg-red-50 transition-colors"
            >LOG OUT</button>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            {/* Added Icons to Tabs */}
            <div className="flex bg-slate-50 border-b border-slate-100">
              <button onClick={() => setAuthMode('signup')} className={`flex-1 py-5 text-[10px] font-black tracking-widest transition-all flex items-center justify-center gap-2 ${authMode === 'signup' ? 'bg-white text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                <i className="fas fa-user-plus text-xs"></i> SIGN UP
              </button>
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-5 text-[10px] font-black tracking-widest transition-all flex items-center justify-center gap-2 ${authMode === 'login' ? 'bg-white text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                <i className="fas fa-right-to-bracket text-xs"></i> LOG IN
              </button>
            </div>

            <form onSubmit={handleAuth} className="p-6 space-y-4">
              {authMode === 'signup' && (
                <div className="flex items-center gap-4 mb-2 animate-in slide-in-from-top-2">
                  <div className="relative">
                    <img src={imgPreview} className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-100 shadow-sm" alt="Preview" />
                    <label className="absolute -bottom-1 -right-1 bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer border-2 border-white shadow-md hover:bg-blue-700">
                      <i className="fas fa-camera text-[10px]"></i>
                      <input type="file" className="hidden" onChange={(e) => {
                        if (e.target.files?.[0]) {
                          setSelectedFile(e.target.files[0]);
                          setImgPreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }} accept="image/*" />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 font-black uppercase leading-tight">Profile Photo<br /><span className="text-blue-500 font-bold">is Required</span></p>
                </div>
              )}

              <div className="relative">
                <i className={`fas ${formData.username.includes('@') ? 'fa-circle-xmark text-red-500' : 'fa-at text-blue-400'} absolute left-4 top-1/2 -translate-y-1/2 text-sm`}></i>
                <input
                  type="text" placeholder="Username (No @)" required
                  className="w-full pl-11 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs focus:bg-white focus:border-blue-300 transition-all outline-none font-medium"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.slice(0, 12) })}
                />
              </div>

              {authMode === 'signup' && (
                <div className="space-y-4 animate-in fade-in duration-500">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <i className="fas fa-graduation-cap absolute left-4 top-1/2 -translate-y-1/2 text-purple-400 text-sm"></i>
                      <select
                        className="w-full pl-11 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] outline-none appearance-none font-bold"
                        value={formData.uClass} onChange={(e) => setFormData({ ...formData, uClass: e.target.value })}
                      >
                        <option>JHS/JSS</option>
                        <option>SHS/SSS</option>
                        <option>University</option>
                      </select>
                    </div>
                    <div className="relative">
                      <i className="fas fa-globe-africa absolute left-4 top-1/2 -translate-y-1/2 text-green-400 text-sm"></i>
                      <select
                        className="w-full pl-11 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] outline-none appearance-none font-bold"
                        value={formData.uCountry} onChange={(e) => setFormData({ ...formData, uCountry: e.target.value })}
                      >
                        <option>Sierra Leone</option>
                        <option>Ghana</option>
                        <option>Nigeria</option>
                        <option>Liberia</option>
                      </select>
                    </div>
                  </div>
                  <div className="relative">
                    <i className="fas fa-quote-left absolute left-4 top-1/2 -translate-y-1/2 text-orange-400 text-sm"></i>
                    <input
                      type="text" placeholder="Short Bio (e.g. Science Student)"
                      className="w-full pl-11 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs focus:bg-white focus:border-blue-300 outline-none font-medium"
                      value={formData.uBio} onChange={(e) => setFormData({ ...formData, uBio: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="relative">
                <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-red-400 text-sm"></i>
                <input
                  type="password" placeholder="PIN Number" required maxLength={8}
                  className="w-full pl-11 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs focus:bg-white focus:border-blue-300 outline-none font-black tracking-[0.3em]"
                  value={formData.uPin} onChange={(e) => setFormData({ ...formData, uPin: e.target.value.replace(/\D/g, '') })}
                />
              </div>

              <button disabled={loading} type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-xl mt-2 text-[11px] tracking-widest uppercase active:scale-95 transition-all disabled:opacity-50">
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <i className="fas fa-spinner animate-spin"></i> Processing
                    </span>
                ) : "Continue"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* NOTIFICATION TOAST */}
      {notification.show && (
        <div className="fixed inset-x-6 bottom-10 z-[1000] flex justify-center animate-bounce-in">
          <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10 max-w-sm w-full">
            <i className={`fas ${notification.type === 'error' ? 'fa-circle-exclamation text-red-400' : 'fa-circle-check text-green-400'} text-lg`}></i>
            <p className="text-[11px] font-bold flex-1">{notification.text}</p>
            <button onClick={() => setNotification({ ...notification, show: false })} className="text-[10px] font-black text-blue-400 uppercase ml-2">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}