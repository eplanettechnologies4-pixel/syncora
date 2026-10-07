"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LogOut, Loader2 } from "lucide-react";

interface LogoutButtonProps {
  variant?: "sidebar" | "header" | "compact";
  className?: string;
  showText?: boolean;
}

export default function LogoutButton({
  variant = "sidebar",
  className = "",
  showText = true,
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoading) return;

    try {
      setIsLoading(true);
      await supabase.auth.signOut();
      // Ensure router navigates to login and triggers server refresh
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Sign out error:", err);
      // Always fallback to login page
      router.push("/login");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isLoading}
        title="Log out"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
        ) : (
          <LogOut className="w-3.5 h-3.5" />
        )}
        {showText && <span className="hidden sm:inline">Log out</span>}
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isLoading}
        title="Log out"
        className={`p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
        ) : (
          <LogOut className="w-3.5 h-3.5" />
        )}
      </button>
    );
  }

  // Default sidebar variant
  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLoading}
      title="Log out of account"
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
      ) : (
        <LogOut className="w-3.5 h-3.5" />
      )}
      {showText && <span>Log out</span>}
    </button>
  );
}
