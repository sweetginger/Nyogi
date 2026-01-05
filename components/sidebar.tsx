"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Video, Languages, Settings } from "lucide-react";
import { UserButton, SignInButton, useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const menuItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/translation", label: "Custom Translation", icon: Languages },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useUser();

  return (
    <aside className="w-64 border-r border-border bg-card">
      <div className="flex h-full flex-col p-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Nyogi</h1>
        </div>
        <nav className="flex flex-col space-y-2 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || 
              (item.href !== "/" && pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t border-border">
          {isSignedIn ? (
            <div className="flex items-center justify-center">
              <UserButton afterSignOutUrl="/" />
            </div>
          ) : (
            <SignInButton mode="modal">
              <button className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Sign In
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    </aside>
  );
}

