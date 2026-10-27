import { useId, useState } from "react";
import { FileText, LockKeyhole, Package, Plus, ScanLine, Search, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarMenu, SidebarMenuButton,
  SidebarMenuAction, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import type { SavedPlan } from "../../../shared/planner";

type Props = {
  plans: { id: string; title: string; status: SavedPlan["status"] }[];
  activeId: string | null;
  pending: boolean;
  loading: boolean;
  error: string | null;
  canInspect: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onExample: () => void;
  onProperties: () => void;
  onDelete: (plan: { id: string; title: string }) => void;
  onSettings: () => void;
  onRetry: () => void;
};

export function WorkspaceSidebar({ plans, activeId, pending, loading, error, canInspect, onSelect, onNew, onExample, onProperties, onDelete, onSettings, onRetry }: Props) {
  const { setOpenMobile, state, isMobile } = useSidebar();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const collapsed = state === "collapsed" && !isMobile;
  const query = collapsed ? "" : search.trim().toLocaleLowerCase();
  const matches = plans.filter((plan) => plan.title.toLocaleLowerCase().includes(query));
  function closeAfter(action: () => void) { setOpenMobile(false); action(); }

  const menuButtonClass = "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-5! group-has-data-[sidebar=menu-action]/menu-item:pr-12";

  return <Sidebar collapsible="icon">
    <SidebarHeader className="gap-4 px-3 pt-5 pb-4 group-data-[collapsible=icon]:px-0">
      <div className="flex items-center gap-2.5 overflow-hidden px-1 text-lg font-semibold tracking-tight group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:size-10"><ScanLine className="size-5" aria-hidden="true" /></span><span className="group-data-[collapsible=icon]:hidden">ProofFlow</span><SidebarTrigger aria-label="Close plans sidebar" className="ml-auto md:hidden" /></div>
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => closeAfter(() => { setSearch(""); onNew(); })} disabled={pending} aria-label="New plan" tooltip="New plan" className={`${menuButtonClass} h-10 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground`}><Plus /><span className="group-data-[collapsible=icon]:hidden">New plan</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    </SidebarHeader>
    <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto">
      <SidebarGroup className="group-data-[collapsible=icon]:px-0">
        <SidebarGroupLabel className="justify-between"><span>Plans</span><span>{plans.length}</span></SidebarGroupLabel>
        {plans.length > 0 && <div className="relative mt-1 mb-3 group-data-[collapsible=icon]:hidden"><Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground" aria-hidden="true" /><label htmlFor={searchId} className="sr-only">Search plans</label><SidebarInput id={searchId} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a plan…" className="h-9 pl-9" /></div>}
        <SidebarGroupContent>
          {loading && <p className="px-2 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:sr-only" role="status">Loading plans…</p>}
          {error ? <div role="alert" className="px-2 py-3 text-xs leading-5 text-destructive group-data-[collapsible=icon]:sr-only">{error}<button onClick={onRetry} className="mt-2 block underline">Retry</button></div> : !loading && matches.length === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:sr-only">{query ? "No matching plans." : "No saved plans yet."}</p> : <nav aria-label="Saved plans"><SidebarMenu className="gap-1 group-data-[collapsible=icon]:gap-2">{matches.map((plan) => <SidebarMenuItem key={plan.id}>
            <SidebarMenuButton onClick={() => closeAfter(() => onSelect(plan.id))} disabled={pending} isActive={activeId === plan.id} aria-current={activeId === plan.id ? "page" : undefined} size="lg" title={plan.title} tooltip={plan.title} aria-label={collapsed ? plan.title : undefined} className={`${menuButtonClass} data-active:bg-primary/8 data-active:text-foreground`}>
              {plan.status === "approved" ? <LockKeyhole aria-hidden="true" /> : <FileText className="text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block truncate text-sm font-medium">{plan.title}</span><span className={`mt-0.5 block text-[11px] ${plan.status === "approved" ? "text-emerald-700" : "text-muted-foreground"}`}>{plan.status === "approved" ? "Approved" : "Draft"}</span></span>
            </SidebarMenuButton>
            <SidebarMenuAction showOnHover onClick={() => closeAfter(() => onDelete(plan))} disabled={pending} aria-label={`Delete ${plan.title}`} title="Delete plan" className="top-2! right-1 size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive [@media(hover:none)]:opacity-100!"><Trash2 aria-hidden="true" /></SidebarMenuAction>
            {activeId === plan.id && <SidebarMenuSub><SidebarMenuSubItem><SidebarMenuSubButton render={<button type="button" disabled={!canInspect || pending} />} onClick={() => closeAfter(onProperties)}><SlidersHorizontal aria-hidden="true" /><span>Properties</span></SidebarMenuSubButton></SidebarMenuSubItem></SidebarMenuSub>}
          </SidebarMenuItem>)}</SidebarMenu></nav>}
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="border-t p-3 group-data-[collapsible=icon]:px-0">
      <SidebarMenu className="gap-2">
        <SidebarMenuItem><SidebarMenuButton onClick={() => closeAfter(() => { setSearch(""); onExample(); })} disabled={pending} aria-label="Box packing example" tooltip="Box packing example" className={menuButtonClass}><Package aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">Box packing example</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton onClick={() => closeAfter(onSettings)} aria-label="Settings" tooltip="Settings" className={menuButtonClass}><Settings2 aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">Settings</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>;
}
