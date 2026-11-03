import { Menu } from "@base-ui/react/menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, ChartColumnIncreasing, ChevronDown, ClipboardCheck, FileCheck2, FilePenLine, FolderOpen, HelpCircle, Info, Moon, Package, Plus, ScanLine, Search, Settings2, Sun, X } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarPlanActions, sidebarMenuItemClass, sidebarMenuPopupClass } from "./sidebar-plan-actions";
import type { SavedPlan } from "../../../shared/planner";

type Props = {
  plans: { id: string; title: string; status: SavedPlan["status"] }[];
  activeId: string | null; pending: boolean; loading: boolean; error: string | null; canInspect: boolean;
  onSelect: (id: string) => void; onNew: () => void; onExample: () => void; onProperties: () => void;
  onDelete: (plan: { id: string; title: string }) => void; onSettings: () => void; onRetry: () => void;
};
type PlanFilter = "all" | "approved" | "draft";

export function WorkspaceSidebar({ plans, activeId, pending, loading, error, canInspect, onSelect, onNew, onExample, onProperties, onDelete, onSettings, onRetry }: Props) {
  const reporting = useRouterState({ select: state => state.location.pathname === "/reports" });
  const reviewing = useRouterState({ select: state => state.location.pathname === "/review" });
  const { setOpenMobile, setOpen, state, isMobile } = useSidebar();
  const searchId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const planList = useRef<HTMLDivElement>(null);
  const [focusSearch, setFocusSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains("dark"));
  const collapsed = state === "collapsed" && !isMobile;
  const themeAction = darkMode ? "Switch to light mode" : "Switch to dark mode";
  useEffect(() => {
    if (focusSearch && !collapsed) { searchInput.current?.focus(); setFocusSearch(false); }
  }, [focusSearch, collapsed]);
  function toggleTheme() {
    const next = !darkMode;
    document.documentElement.classList.toggle("dark", next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#171717" : "#f9fafb");
    try { localStorage.setItem("proofflow.theme", next ? "dark" : "light"); } catch { /* Keep the selected theme when storage is unavailable. */ }
    setDarkMode(next);
  }
  const query = search.trim().toLocaleLowerCase();
  const matches = plans.filter(plan => plan.title.toLocaleLowerCase().includes(query) && (filter === "all" || plan.status === filter));
  const visiblePlans = collapsed ? plans.filter(plan => plan.id === activeId) : matches;
  useEffect(() => {
    if (collapsed) return;
    const container = planList.current;
    const selected = container?.querySelector<HTMLElement>('[aria-current="page"]')?.closest("li");
    if (!container || !selected) return;
    const viewport = container.getBoundingClientRect();
    const bounds = selected.getBoundingClientRect();
    if (bounds.top < viewport.top) container.scrollTop += bounds.top - viewport.top;
    else if (bounds.bottom > viewport.bottom) container.scrollTop += bounds.bottom - viewport.bottom;
  }, [activeId, query, filter, collapsed, plans]);
  const approvedCount = plans.filter(plan => plan.status === "approved").length;
  function closeAfter(action: () => void) { setOpenMobile(false); action(); }
  function resetLibrary() { setSearch(""); setFilter("all"); }

  const menuClass = "h-11! gap-2.5 rounded-lg px-3 text-[13px] [&>svg]:size-[18px]! group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!";
  const activeClass = "data-active:bg-primary/10 data-active:text-foreground data-active:font-semibold";

  return <Sidebar collapsible="icon" aria-label="Workspace navigation">
    <SidebarHeader className="gap-4 px-3 pt-4 pb-3 group-data-[collapsible=icon]:px-0">
      <div className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ScanLine className="size-5" aria-hidden="true" /></span><span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">ProofFlow</span><SidebarTrigger aria-label="Collapse navigation" title="Collapse navigation" className="ml-auto hidden group-data-[collapsible=icon]:hidden md:flex" /><Button variant="ghost" size="icon" aria-label="Close navigation" className="ml-auto md:hidden" onClick={() => setOpenMobile(false)}><X /></Button></div>
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => closeAfter(() => { resetLibrary(); onNew(); })} disabled={pending} aria-label="New plan" tooltip="New plan" className={`${menuClass} bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground`}><Plus aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">New plan</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    </SidebarHeader>
    <SidebarGroup className="shrink-0 px-3 pt-0 pb-3 group-data-[collapsible=icon]:px-0"><SidebarGroupLabel className="px-3 text-[10px] font-semibold tracking-widest uppercase">Workspace</SidebarGroupLabel><nav aria-label="Workspace"><SidebarMenu className="gap-1">
      <SidebarMenuItem><SidebarMenuButton render={<Link to="/review" />} isActive={reviewing} aria-current={reviewing ? "page" : undefined} onClick={() => setOpenMobile(false)} aria-label="Manual review" tooltip="Manual review" className={`${menuClass} ${activeClass}`}><ClipboardCheck className={reviewing ? "text-primary" : "text-muted-foreground"} aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">Manual review</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton render={<Link to="/reports" search={{}} />} isActive={reporting} aria-current={reporting ? "page" : undefined} onClick={() => setOpenMobile(false)} aria-label="Reports" tooltip="Reports" className={`${menuClass} ${activeClass}`}><ChartColumnIncreasing className={reporting ? "text-primary" : "text-muted-foreground"} aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">Reports</span></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></nav></SidebarGroup>
    <SidebarContent className="gap-0 overflow-hidden border-t group-data-[collapsible=icon]:overflow-hidden">
      <SidebarGroup className="shrink-0 gap-2 px-3 pt-3 pb-2 group-data-[collapsible=icon]:px-0"><SidebarGroupLabel className="h-6 justify-between px-3"><span className="text-[10px] font-semibold tracking-widest uppercase">Plan library</span><span className="text-[11px] tabular-nums">{plans.length}</span></SidebarGroupLabel>
        {collapsed ? <SidebarMenu><SidebarMenuItem><SidebarMenuButton aria-label="Find a plan" tooltip="Find a plan" onClick={() => { setOpen(true); setFocusSearch(true); }} className={menuClass}><FolderOpen aria-hidden="true" /></SidebarMenuButton></SidebarMenuItem></SidebarMenu> : <>
          <div className="relative"><Search className="pointer-events-none absolute top-3.5 left-3 size-3.5 text-muted-foreground" aria-hidden="true" /><label htmlFor={searchId} className="sr-only">Search plans</label><SidebarInput ref={searchInput} id={searchId} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a plan…" className="h-11 rounded-lg pr-10 pl-9 text-xs [&::-webkit-search-cancel-button]:hidden" />{search && <button type="button" aria-label="Clear plan search" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" onClick={() => { setSearch(""); searchInput.current?.focus(); }}><X className="size-3.5" /></button>}</div>
          <div className="flex gap-1" aria-label="Plan status filters">{([{ value: "all", label: "All", count: plans.length }, { value: "approved", label: "Approved", count: approvedCount }, { value: "draft", label: "Drafts", count: plans.length - approvedCount }] as const).map(tab => <button key={tab.value} type="button" aria-label={`${tab.value === "draft" ? "Draft" : tab.label} plans (${tab.count})`} aria-pressed={filter === tab.value} onClick={() => setFilter(tab.value)} className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-primary ${filter === tab.value ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-muted"}`}>{tab.label}<span className="text-[9px] tabular-nums">{tab.count}</span></button>)}</div>
        </>}
      </SidebarGroup>
      <div ref={planList} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 group-data-[collapsible=icon]:px-0">
        {loading && <p className="px-3 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:sr-only" role="status">Loading plans…</p>}
        {error ? <div role="alert" className="px-3 py-3 text-xs leading-5 text-destructive group-data-[collapsible=icon]:sr-only">{error}<button onClick={onRetry} className="mt-2 block min-h-9 underline">Retry</button></div> : !loading && !collapsed && matches.length === 0 ? <div className="px-3 py-5 text-xs leading-5 text-muted-foreground"><p>{query || filter !== "all" ? "No plans match these filters." : "Your plans will appear here."}</p>{(query || filter !== "all") && <button onClick={resetLibrary} className="mt-2 min-h-9 font-medium text-foreground underline">Clear filters</button>}</div> : <nav aria-label="Saved plans"><SidebarMenu className="gap-0.5">{visiblePlans.map(plan => <SidebarMenuItem key={plan.id}>
          <SidebarMenuButton onClick={() => closeAfter(() => onSelect(plan.id))} disabled={pending} isActive={activeId === plan.id} aria-current={activeId === plan.id ? "page" : undefined} aria-label={`${plan.title} ${plan.status === "approved" ? "Approved" : "Draft"}`} title={`${plan.title} · ${plan.status === "approved" ? "Approved" : "Draft"}`} tooltip={`${plan.title} · ${plan.status === "approved" ? "Approved" : "Draft"}`} className={`${menuClass} ${activeClass} pr-14! group-data-[collapsible=icon]:pr-0!`}>
            {plan.status === "approved" ? <FileCheck2 className="text-muted-foreground" aria-hidden="true" /> : <FilePenLine className="text-muted-foreground" aria-hidden="true" />}<span className="min-w-0 flex-1 truncate text-xs font-medium group-data-[collapsible=icon]:hidden">{plan.title}</span><span title={plan.status === "approved" ? "Approved" : "Draft"} aria-hidden="true" className={`size-1.5 shrink-0 rounded-full group-data-[collapsible=icon]:hidden ${plan.status === "approved" ? "bg-emerald-700 dark:bg-emerald-400" : "bg-amber-600 dark:bg-amber-400"}`} />
          </SidebarMenuButton>
          <SidebarPlanActions plan={plan} active={activeId === plan.id} disabled={pending} canInspect={canInspect} mobile={isMobile} onOpen={() => closeAfter(() => onSelect(plan.id))} onProperties={() => closeAfter(onProperties)} onDelete={() => closeAfter(() => onDelete(plan))} onNavigate={() => setOpenMobile(false)} />
          {activeId === plan.id && !collapsed && <SidebarMenuSub className="mr-1 ml-5 border-primary/20"><SidebarMenuSubItem><SidebarMenuSubButton render={<button type="button" disabled={!canInspect || pending} />} onClick={() => closeAfter(onProperties)} className="min-h-10 text-[11px]"><Info aria-hidden="true" /><span>About this plan</span></SidebarMenuSubButton></SidebarMenuSubItem><SidebarMenuSubItem><SidebarMenuSubButton render={<Link to="/reports" search={{ planId: plan.id }} />} onClick={() => setOpenMobile(false)} className="min-h-10 text-[11px]"><ChartColumnIncreasing aria-hidden="true" /><span>Plan report</span></SidebarMenuSubButton></SidebarMenuSubItem></SidebarMenuSub>}

        </SidebarMenuItem>)}</SidebarMenu></nav>}
      </div>
    </SidebarContent>
    <SidebarFooter className="gap-1 border-t p-3 group-data-[collapsible=icon]:px-0" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <SidebarMenu><SidebarMenuItem><Menu.Root><Menu.Trigger render={<SidebarMenuButton tooltip="Help & examples" />} aria-label="Help & examples" className={`${menuClass} text-muted-foreground`}><HelpCircle aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">Help & examples</span><ChevronDown className="ml-auto size-3! group-data-[collapsible=icon]:hidden" aria-hidden="true" /></Menu.Trigger><Menu.Portal><Menu.Positioner side={collapsed ? "right" : "top"} align="start" sideOffset={6} className="z-60"><Menu.Popup className={sidebarMenuPopupClass} aria-label="Help & examples"><Menu.LinkItem render={<Link to="/" />} closeOnClick onClick={() => setOpenMobile(false)} className={sidebarMenuItemClass}><BookOpen />Home & guide</Menu.LinkItem><Menu.Item disabled={pending} onClick={() => closeAfter(() => { resetLibrary(); onExample(); })} className={sidebarMenuItemClass}><Package />Box packing example</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></SidebarMenuItem></SidebarMenu>
      <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col"><SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:w-full"><SidebarMenuItem><SidebarMenuButton onClick={() => closeAfter(onSettings)} aria-label="Settings" tooltip="Settings" className={`${menuClass} text-muted-foreground`}><Settings2 aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon" />} onClick={toggleTheme} aria-label={themeAction} title={themeAction} className="size-11 shrink-0 text-muted-foreground">{darkMode ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</TooltipTrigger><TooltipContent side={collapsed ? "right" : "top"}>{themeAction}</TooltipContent></Tooltip></div>
    </SidebarFooter>
  </Sidebar>;
}
