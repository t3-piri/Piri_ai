import React, { useState } from 'react';
import {
  Search,
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  LogOut,
  Hash,
  ChevronDown,
  ChevronRight,
  Inbox,
  Calendar,
  Activity,
  CreditCard,
  Globe,
  Terminal,
  Blocks,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
  X
} from 'lucide-react';

export type NavTone = "violet" | "blue" | "amber" | "emerald" | "cyan" | "rose" | "zinc";

export type NavItemData = {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: number | string;
  shortcut?: string;
  tone?: NavTone;
  children?: NavItemData[];
};

/** Her sayfa kendi renk kimligini tasir: ikon her zaman renkli, aktif satirda
 *  ayni renk arka plana ve sol seride tasar. Sinif adlari statik yazilir -
 *  Tailwind'in derleme zamani tarayicisi sablonla uretilen adlari goremez. */
const TONE_STYLES: Record<NavTone, { icon: string; activeIcon: string; activeBg: string; rail: string; badge: string }> = {
  violet: {
    icon: "text-violet-500/70 group-hover:text-violet-500",
    activeIcon: "text-violet-500",
    activeBg: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    rail: "bg-violet-500",
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  },
  blue: {
    icon: "text-blue-500/70 group-hover:text-blue-500",
    activeIcon: "text-blue-500",
    activeBg: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    rail: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  },
  amber: {
    icon: "text-amber-500/70 group-hover:text-amber-500",
    activeIcon: "text-amber-500",
    activeBg: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rail: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  },
  emerald: {
    icon: "text-emerald-500/70 group-hover:text-emerald-500",
    activeIcon: "text-emerald-500",
    activeBg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    rail: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  cyan: {
    icon: "text-cyan-500/70 group-hover:text-cyan-500",
    activeIcon: "text-cyan-500",
    activeBg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    rail: "bg-cyan-500",
    badge: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
  },
  rose: {
    icon: "text-rose-500/70 group-hover:text-rose-500",
    activeIcon: "text-rose-500",
    activeBg: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    rail: "bg-rose-500",
    badge: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  },
  zinc: {
    icon: "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300",
    activeIcon: "text-zinc-700 dark:text-zinc-200",
    activeBg: "bg-black/5 dark:bg-white/10 text-foreground",
    rail: "bg-zinc-400",
    badge: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  },
};

export type NavGroupData = {
  heading?: string;
  items: NavItemData[];
};

export const mockNavGroups: NavGroupData[] = [
  {
    items: [
      { id: 'search', title: 'Search', icon: Search, shortcut: '⌘K' },
      { id: 'home', title: 'Home', icon: LayoutDashboard },
      { id: 'inbox', title: 'Inbox', icon: Inbox, badge: 12 },
      { id: 'analytics', title: 'Analytics', icon: Activity },
    ]
  },
  {
    heading: 'Workspace',
    items: [
      {
        id: 'projects',
        title: 'Projects',
        icon: FolderKanban,
        children: [
          { id: 'p-active', title: 'Active', icon: Hash },
          { id: 'p-archived', title: 'Archived', icon: Hash },
        ]
      },
      { id: 'calendar', title: 'Calendar', icon: Calendar },
      {
        id: 'team',
        title: 'Team',
        icon: Users,
        children: [
          { id: 't-design', title: 'Designers', icon: Hash },
          { id: 't-eng', title: 'Engineering', icon: Hash },
          { id: 't-product', title: 'Product', icon: Hash },
        ]
      },
      {
        id: 'customers',
        title: 'Customers',
        icon: Globe,
        children: [
          { id: 'c-enterprise', title: 'Enterprise', icon: Hash },
          { id: 'c-smb', title: 'SMB', icon: Hash },
        ]
      },
      { id: 'finance', title: 'Finance', icon: CreditCard },
    ]
  },
  {
    heading: 'Developers',
    items: [
      { id: 'api', title: 'API Keys', icon: Terminal },
      { id: 'webhooks', title: 'Webhooks', icon: Blocks },
    ]
  }
];

export const mockBottomItems: NavItemData[] = [
  { id: 'settings', title: 'Settings', icon: Settings, shortcut: '⌘,' },
  { id: 'logout', title: 'Log out', icon: LogOut },
];

function WorkspaceSwitcher({ selected }: { selected?: string, onSelect?: (ws: string) => void }) {
  const name = selected || "Piri";
  return (
    <div className="flex items-center gap-3 px-2 py-2 mb-4 select-none">
      <div className="w-8 h-8 rounded-[6px] bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-[14px] text-white shadow-sm">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-[13px] font-semibold leading-none mb-0.5 text-foreground truncate max-w-[140px]">{name}</span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none">Yönetim Paneli</span>
      </div>
    </div>
  );
}

function NavItem({
  item,
  activeId,
  onSelect,
  level = 0
}: {
  item: NavItemData;
  activeId: string;
  onSelect: (id: string) => void;
  level?: number;
}) {
  const isActive = activeId === item.id;
  const hasChildren = !!item.children;
  const [isOpen, setIsOpen] = useState(false);
  const tone = TONE_STYLES[item.tone ?? "zinc"];
  const handleClick = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    } else {
      onSelect(item.id);
    }
  };
  return (
    <div className="flex flex-col w-full">
      <div
        className={`group relative flex items-center justify-between px-2.5 py-[7px] rounded-[6px] cursor-pointer transition-all duration-200 select-none
          ${isActive
            ? `${tone.activeBg} font-medium`
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'
          }
        `}
        style={{ paddingLeft: `${level * 12 + 10}px` }}
        onClick={handleClick}
      >
        {isActive && (
          <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-r-full ${tone.rail}`} />
        )}
        <div className="flex items-center gap-2.5">
          <item.icon
            className={`w-[16px] h-[16px] transition-colors ${isActive ? tone.activeIcon : tone.icon}`}
            strokeWidth={1.75}
          />
          <span className="text-[13px] tracking-wide truncate">
            {item.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {item.shortcut && (
            <kbd className="hidden group-hover:inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-medium font-mono text-muted-foreground/60 bg-background/50 border border-border/50 rounded-[4px] shadow-xs">
              {item.shortcut}
            </kbd>
          )}
          {item.badge !== undefined && item.badge !== 0 && (
            <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-semibold rounded-full ${tone.badge}`}>
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <ChevronRight
              className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
              strokeWidth={2}
            />
          )}
        </div>
      </div>
      {hasChildren && (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden min-h-0 relative flex flex-col gap-0.5 mt-0.5">
            <div
              className="absolute top-0 bottom-0 border-l border-black/5 dark:border-white/5"
              style={{ left: `${level * 12 + 17.5}px` }}
            />
            {item.children!.map(child => (
              <NavItem
                key={child.id}
                item={child}
                activeId={activeId}
                onSelect={onSelect}
                level={level + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({
  className = '',
  activeId,
  onSelect,
  activeWorkspace,
  onWorkspaceSelect,
  groups,
  bottomItems
}: {
  className?: string,
  activeId?: string,
  onSelect?: (id: string) => void,
  activeWorkspace?: string,
  onWorkspaceSelect?: (ws: string) => void,
  groups?: NavGroupData[],
  bottomItems?: NavItemData[]
}) {
  const [internalId, setInternalId] = useState('home');
  const currentId = activeId !== undefined ? activeId : internalId;
  const handleSelect = onSelect || setInternalId;
  const displayGroups = groups ?? mockNavGroups;
  const displayBottom = bottomItems ?? mockBottomItems;
  return (
    <div className={`flex flex-col w-[260px] h-full bg-card border-r border-border/50 p-3 font-sans ${className}`}>
      <WorkspaceSwitcher selected={activeWorkspace} onSelect={onWorkspaceSelect} />
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4 mt-2">
        {displayGroups.map((group, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            {group.heading && (
              <span className="px-2.5 mb-1 text-[11px] font-semibold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">
                {group.heading}
              </span>
            )}
            {group.items.map(item => (
              <NavItem
                key={item.id}
                item={item}
                activeId={currentId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-auto pt-4 border-t border-border/50 flex flex-col gap-0.5">
        {displayBottom.map(item => (
          <NavItem
            key={item.id}
            item={item}
            activeId={currentId}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}

const allItems = [...mockNavGroups.flatMap(g => g.items), ...mockBottomItems];
const flattenItems = (items: NavItemData[]): NavItemData[] => {
  return items.reduce((acc, item) => {
    acc.push(item);
    if (item.children) acc.push(...flattenItems(item.children));
    return acc;
  }, [] as NavItemData[]);
};
export const flatMockData = flattenItems(allItems);

export default function SidebarNavPreview() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeId, setActiveId] = useState('home');
  const [activeWorkspace, setActiveWorkspace] = useState('Acme Corp');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const activeItem = flatMockData.find(i => i.id === activeId);
  const activeTitle = activeItem ? activeItem.title : 'Dashboard';
  const handleSelect = (id: string) => {
    if (id === 'search') {
      setIsSearchOpen(true);
      return;
    }
    setActiveId(id);
  };
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[700px] bg-background p-4 md:p-8">
      <div className="relative w-full max-w-4xl h-[700px] bg-card rounded-xl border border-border/50 flex overflow-hidden shadow-sm ring-1 ring-black/5 dark:ring-white/5">
        <div
          className={`h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden bg-card border-r border-border/50 ${
            isOpen ? 'w-[260px] opacity-100' : 'w-0 opacity-0 border-none'
          }`}
        >
          <SidebarNav
            className="w-[260px] border-none bg-transparent"
            activeId={activeId}
            onSelect={handleSelect}
            activeWorkspace={activeWorkspace}
            onWorkspaceSelect={setActiveWorkspace}
          />
        </div>
        <div className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col min-w-0 transition-all duration-300">
           <div className="h-14 border-b border-border/50 flex items-center px-4 justify-between bg-card shrink-0">
             <div className="flex items-center gap-3">
               <button
                 onClick={() => setIsOpen(!isOpen)}
                 className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors"
               >
                 {isOpen ? <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} /> : <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />}
               </button>
               <div className="flex items-center gap-2 text-sm text-muted-foreground">
                 <span className="truncate">{activeWorkspace}</span>
                 <span>/</span>
                 <span className="font-medium text-foreground truncate">{activeTitle}</span>
               </div>
             </div>
             <div className="flex items-center gap-3">
               <div className="w-64 h-8 bg-black/5 dark:bg-white/5 rounded-md hidden md:block" />
               <div className="w-8 h-8 bg-primary/10 rounded-full border border-primary/20" />
             </div>
           </div>
           <div className="p-6 md:p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
             <div className="flex items-center justify-between mb-8">
               <div className="w-48 h-8 bg-black/5 dark:bg-white/5 rounded-md" />
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
               <div className="h-32 bg-card rounded-xl border border-border/50 shadow-sm" />
               <div className="h-32 bg-card rounded-xl border border-border/50 shadow-sm" />
             </div>
             <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm p-6">
                <div className="w-1/3 h-5 bg-black/5 dark:bg-white/5 rounded-md mb-6" />
                <div className="w-full h-[1px] bg-border/50 mb-6" />
                <div className="flex flex-col gap-4">
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
               </div>
             </div>
           </div>
        </div>
        {isSearchOpen && (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/40 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)} />
            <div className="relative w-full max-w-xl bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center px-4 border-b border-border/50">
                <Search className="w-[18px] h-[18px] text-muted-foreground/70 mr-3 shrink-0" strokeWidth={1.5} />
                <input
                  autoFocus
                  className="flex-1 bg-transparent py-4 outline-none text-[14px] text-foreground placeholder:text-muted-foreground/50"
                  placeholder="Search projects, docs, or actions..."
                />
                <kbd
                  onClick={() => setIsSearchOpen(false)}
                  className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 ml-2 text-[10px] font-medium font-mono text-muted-foreground/70 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-[4px] cursor-pointer hover:text-foreground hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                >
                  ESC
                </kbd>
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="ml-3 p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="w-[18px] h-[18px]" strokeWidth={1.5} />
                </button>
              </div>
              <div className="p-2 py-8 flex flex-col items-center justify-center">
                 <Command className="w-6 h-6 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
                 <p className="text-[13px] text-muted-foreground font-medium">Type a command or search...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
