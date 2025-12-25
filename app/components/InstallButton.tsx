"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      // Prevent Chrome from showing the tiny default bar
      e.preventDefault();
      // Save the event so we can trigger it later
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    // Show the native Android install dialog
    deferredPrompt.prompt();
    
    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 z-[2000] animate-in slide-in-from-bottom-10 duration-500">
      <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-blue-400">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Download size={20} />
          </div>
          <div>
            <p className="font-bold text-sm">Install Let's Meet</p>
            <p className="text-[10px] opacity-80">Add to home screen for a better experience</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleInstall}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform"
          >
            Install
          </button>
          <button onClick={() => setIsVisible(false)} className="p-1 opacity-50">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}