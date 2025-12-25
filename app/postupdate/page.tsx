"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PostUpdatePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- UI State ---
  const [currentTab, setCurrentTab] = useState<'global' | 'my'>('global');
  const [loading, setLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [likedId, setLikedId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{show: boolean, id: string | null}>({ show: false, id: null });

  // --- Data State ---
  const [posts, setPosts] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [postText, setPostText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // --- User State ---
  const [user, setUser] = useState({ username: "Guest", avatar: "", country: "Sierra Leone" });

  useEffect(() => {
    const username = localStorage.getItem("username") || "Guest";
    const avatar = localStorage.getItem("userAvatar") || "";
    const country = localStorage.getItem("userCountry") || "Sierra Leone";
    setUser({ username, avatar, country });

    fetchPosts();
    fetchTrending();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'global_feed' }, 
        () => {
          fetchPosts();
          fetchTrending();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentTab]);

  const fetchPosts = async () => {
    const currentUsername = localStorage.getItem("username") || "Guest";
    let query = supabase
      .from('global_feed')
      .select(`*, user_like_data:post_likes!student_project_like_link(user_id)`)
      .order('created_at', { ascending: false });

    if (currentTab === 'my') {
      query = query.eq('author_id', currentUsername);
    }

    const { data } = await query.limit(30);
    if (data) {
      const formattedPosts = data.map((post: any) => ({
        ...post,
        user_has_liked: post.user_like_data?.some((l: any) => l.user_id === currentUsername)
      }));
      setPosts(formattedPosts);
    }
    setLoading(false);
  };

  const fetchTrending = async () => {
    const { data } = await supabase.from('global_feed').select('author_id, author_avatar');
    if (data) {
      const counts: any = {};
      data.forEach(p => {
        counts[p.author_id] = { count: (counts[p.author_id]?.count || 0) + 1, avatar: p.author_avatar };
      });
      const sorted = Object.keys(counts)
        .map(id => ({ username: id, ...counts[id] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setTrending(sorted);
    }
  };

  const handleLike = async (postId: string) => {
    const currentPost = posts.find(p => p.id === postId);
    const isAlreadyLiked = currentPost?.user_has_liked;

    if (!isAlreadyLiked) {
        setLikedId(postId);
        setTimeout(() => setLikedId(null), 800);
    }

    // Optimistic UI update
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return { 
          ...p, 
          likes: isAlreadyLiked ? Math.max(0, (p.likes || 0) - 1) : (p.likes || 0) + 1,
          user_has_liked: !isAlreadyLiked 
        };
      }
      return p;
    }));

    const { error } = await supabase.rpc('toggle_like', { 
      target_post_id: postId, 
      target_user_id: user.username 
    });

    // --- SUPABASE NOTIFICATION FOR LIKES ---
    // Switched from Firebase to Supabase to match your Notification Page
    // Inside PostUpdatePage.tsx -> handleLike function
if (!isAlreadyLiked && currentPost.author_id !== user.username) {
  await supabase.from('notifications').insert([{
    receiver_id: currentPost.author_id,
    sender_id: user.username,
    sender_pic: user.avatar,    // Matches your DB 'sender_pic'
    sender_country: user.country,
    type: "like",
    content: "liked your post.", // Matches your DB 'content'
    is_read: false
  }]);
}

    if (error) fetchPosts();
  };

  const confirmDelete = async () => {
    if (!deleteModal.id) return;
    const { error } = await supabase.from('global_feed').delete().eq('id', deleteModal.id);
    if (!error) {
      setPosts(prev => prev.filter(p => p.id !== deleteModal.id));
      setDeleteModal({ show: false, id: null });
    }
  };

  const submitPost = async () => {
    if (!postText && !selectedFile) return;
    setIsPosting(true);
    try {
      let finalImageUrl = null;
      if (selectedFile) {
        const fileName = `${crypto.randomUUID()}.${selectedFile.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage.from('post-media').upload(fileName, selectedFile);
        if (!uploadError) {
          finalImageUrl = supabase.storage.from('post-media').getPublicUrl(fileName).data.publicUrl;
        }
      }

      // 1. Insert Post into Supabase
      const { error } = await supabase.from('global_feed').insert([{
        author_id: user.username, 
        author_name: user.username, 
        author_avatar: user.avatar,
        author_country: user.country, 
        content: postText, 
        media_url: finalImageUrl, 
        likes: 0
      }]);

      if (!error) {
        // 2. Insert Global Notification into Supabase
     // Inside PostUpdatePage.tsx -> submitPost function
const { error: notifError } = await supabase.from('notifications').insert([{
  receiver_id: "GLOBAL",
  sender_id: user.username,
  sender_pic: user.avatar,      // Changed from sender_avatar to sender_pic
  sender_country: user.country,
  type: "post",
  content: "shared a new update in the community.", // Changed from message to content
  is_read: false
}]);

        setPostText(""); setSelectedFile(null); setPreviewUrl(null);
        setShowToast(true); setTimeout(() => setShowToast(false), 3000);
        fetchPosts();
      }
    } finally { setIsPosting(false); }
  };

  return (
    <div className="bg-white min-h-screen pb-24 font-inter overflow-x-hidden">
      {/* Delete Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xs rounded-[2rem] p-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
              <i className="fas fa-trash-alt"></i>
            </div>
            <h3 className="font-black text-slate-800 mb-2">Delete Post?</h3>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleteModal({show: false, id: null})} className="flex-1 py-3 text-xs font-bold text-slate-400 bg-slate-50 rounded-full">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-3 text-xs font-bold text-white bg-red-500 rounded-full">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showToast && (
        <div className="fixed top-6 left-0 right-0 z-[250] flex justify-center px-6 animate-bounce">
          <div className="bg-emerald-500 text-white px-6 py-4 rounded-full shadow-xl flex items-center gap-3">
            <i className="fas fa-check"></i>
            <p className="font-bold text-xs uppercase tracking-widest">Shared!</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <header className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-slate-800"><i className="fas fa-chevron-left text-xl"></i></button>
            <h1 className="font-black text-xl tracking-tight text-slate-900">Community</h1>
          </div>
          {isPosting && <i className="fas fa-circle-notch fa-spin text-blue-600"></i>}
        </header>

        <div className="flex px-4 gap-8">
          <button 
            onClick={() => setCurrentTab('global')}
            className={`pb-3 text-[11px] font-black uppercase tracking-[0.2em] transition-all ${currentTab === 'global' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-300'}`}
          >Global</button>
          <button 
            onClick={() => setCurrentTab('my')}
            className={`pb-3 text-[11px] font-black uppercase tracking-[0.2em] transition-all ${currentTab === 'my' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-300'}`}
          >Mine</button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto">
        {/* Create Post Section */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex gap-4">
            <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.username}&background=random`} className="w-12 h-12 rounded-full object-cover border-2 border-slate-50 shadow-sm" alt="Me" />
            <div className="flex-1">
              <textarea 
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="What's on your mind?" 
                className="w-full bg-transparent pt-2 outline-none text-lg text-slate-800 placeholder:text-slate-300 resize-none min-h-[80px]"
              />
              {previewUrl && (
                <div className="relative my-3">
                  <img src={previewUrl} className="w-full rounded-2xl border border-slate-100" alt="Preview" />
                  <button onClick={() => {setSelectedFile(null); setPreviewUrl(null);}} className="absolute top-2 right-2 bg-slate-900/50 text-white w-8 h-8 rounded-full flex items-center justify-center">
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              )}
              <div className="flex justify-between items-center mt-2">
                <button onClick={() => fileInputRef.current?.click()} className="text-blue-600 w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center transition-transform active:scale-90">
                  <i className="fas fa-image text-lg"></i>
                </button>
                <input type="file" ref={fileInputRef} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setSelectedFile(file); setPreviewUrl(URL.createObjectURL(file)); }
                }} className="hidden" accept="image/*" />
                <button disabled={isPosting} onClick={submitPost} className="bg-blue-600 text-white px-8 py-2.5 rounded-full font-black text-xs uppercase tracking-widest shadow-lg disabled:opacity-50">
                  {isPosting ? '...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feed Section */}
        <div className="divide-y divide-slate-100">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-64 bg-slate-50/50 animate-pulse m-4 rounded-3xl" />)
          ) : (
            posts.map((post) => (
              <div key={post.id} className="p-4 bg-white transition-colors">
                <div className="flex gap-4">
                  <img src={post.author_avatar || `https://ui-avatars.com/api/?name=${post.author_id}&background=random`} className="w-12 h-12 rounded-full object-cover border border-slate-50 shadow-sm" alt="" />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-sm text-slate-900 leading-none inline-block mr-2">{post.author_id}</h4>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{post.author_country}</span>
                      </div>
                      {currentTab === 'my' && (
                        <button onClick={() => setDeleteModal({show: true, id: post.id})} className="text-slate-200 hover:text-red-500 transition-colors px-2">
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-300 font-bold mb-3">{new Date(post.created_at).toLocaleDateString()}</p>
                    {post.content && <p className="text-sm text-slate-600 leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>}
                    {post.media_url && (
                      <div className="relative rounded-2xl overflow-hidden mb-4 border border-slate-100 shadow-sm bg-slate-50">
                        <img src={post.media_url} className="w-full h-auto" alt="Post content" />
                        {likedId === post.id && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <i className="fas fa-heart text-white text-8xl animate-ping opacity-75 drop-shadow-2xl"></i>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between max-w-[280px] mt-2">
                      <button onClick={() => handleLike(post.id)} className="flex items-center gap-2 group">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                          post.user_has_liked ? 'bg-red-50 text-red-500 scale-110' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <i className={`${post.user_has_liked ? 'fas' : 'far'} fa-heart text-xs`}></i>
                        </div>
                        <span className={`text-xs font-black ${post.user_has_liked ? 'text-red-500' : 'text-slate-400'}`}>
                          {post.likes || 0}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}