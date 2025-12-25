"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LearnPage() {
  const router = useRouter();
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [currentTab, setCurrentTab] = useState<'other' | 'my' | 'joined'>('other');
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('username');
    if (!user) {
      router.push('/login');
    } else {
      setMyUsername(user);
      fetchGroups(user);
    }
  }, []);

  const fetchGroups = async (username: string) => {
    setLoading(true);
    const { data: groups } = await supabase
      .from('groups')
      .select('*')
      .order('members_count', { ascending: false });

    const { data: activity } = await supabase
      .from('member_activity')
      .select('group_id')
      .eq('username', username);

    const joinedIds = activity?.map(a => a.group_id) || [];

    const processed = (groups || []).map(g => ({
      ...g,
      isOwner: g.owner === username,
      isJoined: g.owner === username || joinedIds.includes(g.id),
      unreadCount: parseInt(localStorage.getItem(`unread_${g.id}`) || "0")
    }));

    setAllGroups(processed);
    setLoading(false);
  };

  const handleJoin = async (e: React.MouseEvent, group: any) => {
    e.stopPropagation(); 
    if (group.isJoined || group.isOwner) return;

    const { error } = await supabase.from('member_activity').upsert({
      username: myUsername,
      group_id: group.id,
      last_read_at: new Date().toISOString()
    }, { onConflict: 'username,group_id' });
    
    if (!error) {
        await supabase.rpc('increment_members', { group_id: group.id });
        localStorage.setItem(`unread_${group.id}`, "0");
        localStorage.setItem('currentGroupId', group.id);
        router.push('/group-chat'); 
    }
  };

  const enterGroup = (group: any) => {
    localStorage.setItem(`unread_${group.id}`, "0");
    localStorage.setItem('currentGroupId', group.id);
    router.push('/group-chat'); 
  };

  const launchHub = async () => {
    if (!groupName || !myUsername) return;
    setIsLaunching(true);

    let picUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=random&color=fff&size=128`;

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random()}_${Date.now()}.${fileExt}`;
      const filePath = `group-pics/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('groups')
        .upload(filePath, selectedFile);

      if (!uploadError) {
        const { data } = supabase.storage.from('groups').getPublicUrl(filePath);
        picUrl = data.publicUrl;
      }
    }

    const groupId = "grp_" + Date.now();
    const { error } = await supabase.from('groups').insert({
      id: groupId,
      name: groupName,
      description: groupDesc,
      owner: myUsername,
      group_pic: picUrl,
      members_count: 1
    });

    if (!error) {
      setIsModalOpen(false);
      setGroupName("");
      setGroupDesc("");
      setSelectedFile(null);
      fetchGroups(myUsername!);
    }
    setIsLaunching(false);
  };

  const exploreCount = allGroups.filter(g => !g.isJoined && !g.isOwner).length;

  const filteredGroups = allGroups.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase()));
    if (currentTab === 'my') return g.isOwner && matchesSearch;
    if (currentTab === 'joined') return g.isJoined && !g.isOwner && matchesSearch;
    return !g.isJoined && !g.isOwner && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 font-poppins">
      
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200/60 px-5 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm">
              <i className="fas fa-chevron-left text-slate-600"></i>
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Hubs</h1>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Learning Communities</p>
            </div>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95">
            <i className="fas fa-plus mr-2"></i>Create
          </button>
        </div>

        <div className="max-w-2xl mx-auto mt-5 relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input 
            type="text" 
            placeholder="Search for groups or topics..." 
            className="w-full bg-slate-100/80 border-none px-11 py-3.5 rounded-2xl outline-none text-sm transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-8">
        <div className="flex bg-slate-200/50 p-1.5 rounded-2xl mb-8">
          {[
            { id: 'other', label: 'Explore', icon: 'fa-compass', badge: exploreCount },
            { id: 'joined', label: 'Joined', icon: 'fa-check-circle', badge: 0 },
            { id: 'my', label: 'My Hubs', icon: 'fa-crown', badge: 0 }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as any)}
              className={`flex-1 relative flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                currentTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <i className={`fas ${tab.icon} text-[14px]`}></i>
              {tab.label}
              {tab.id === 'other' && tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-white">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="grid gap-5">
          {loading ? (
            <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
              <i className="fas fa-circle-notch fa-spin text-3xl"></i>
              <p className="text-sm font-semibold">Loading Hubs...</p>
            </div>
          ) : filteredGroups.length > 0 ? (
            filteredGroups.map(group => (
              <div 
                key={group.id} 
                className="bg-white border border-slate-200/70 p-5 rounded-[28px] shadow-sm flex items-center gap-4"
              >
                {/* Image Section */}
                <div className="relative flex-shrink-0">
                  <img src={group.group_pic} className="w-16 h-16 rounded-3xl object-cover bg-slate-50" />
                  {group.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                      {group.unreadCount}
                    </span>
                  )}
                </div>

                {/* Content Section */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-[16px] truncate">{group.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md">
                          {group.members_count} Members
                        </span>
                        {group.isOwner && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">Owner</span>
                        )}
                      </div>
                    </div>

                    {/* ONLY THESE BUTTONS ARE CLICKABLE */}
                    {!group.isJoined && !group.isOwner ? (
                      <button 
                        onClick={(e) => handleJoin(e, group)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black px-6 py-2.5 rounded-xl shadow-lg transition-all active:scale-90 flex-shrink-0"
                      >
                        JOIN
                      </button>
                    ) : (
                      <button 
                        onClick={() => enterGroup(group)}
                        className="w-10 h-10 bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-400 flex items-center justify-center rounded-xl transition-all active:scale-90"
                      >
                           <i className="fas fa-arrow-right text-xs"></i>
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-500 mt-2 line-clamp-1 font-medium">
                    {group.description || 'Welcome to this hub!'}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-white border border-dashed border-slate-200 rounded-[32px]">
              <i className="fas fa-ghost text-slate-200 text-4xl mb-4"></i>
              <p className="text-slate-400 font-medium">No hubs found here yet.</p>
            </div>
          )}
        </div>
      </main>

      {/* MODAL REMAINS THE SAME */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[1000] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm p-8 rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-slate-900 mb-2">New Community</h3>
            <p className="text-slate-400 text-sm mb-6 font-medium">Create a space to learn together.</p>
            
            <div className="space-y-4">
              <div className="flex flex-col items-center mb-2">
                <label className="relative cursor-pointer group">
                  <div className="w-20 h-20 bg-slate-100 rounded-[24px] border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                    {selectedFile ? (
                      <img src={URL.createObjectURL(selectedFile)} className="w-full h-full object-cover" />
                    ) : (
                      <i className="fas fa-camera text-slate-400 text-xl"></i>
                    )}
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                  <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-[10px] shadow-lg">
                    <i className="fas fa-plus"></i>
                  </div>
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hub Name</label>
                <input type="text" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Description</label>
                <textarea className="w-full p-4 bg-slate-50 rounded-2xl outline-none h-28 text-sm font-medium resize-none" value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} />
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 font-bold text-sm">Cancel</button>
                <button onClick={launchHub} disabled={isLaunching || !groupName} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-30">
                  {isLaunching ? <i className="fas fa-spinner fa-spin"></i> : "Launch Hub"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}