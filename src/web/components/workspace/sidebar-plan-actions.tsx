import { PACK_DEMO } from "../../../shared/demo";
import { Menu } from "@base-ui/react/menu";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChartColumnIncreasing, Ellipsis, Info, Trash2 } from "lucide-react";
import { SidebarMenuAction } from "@/components/ui/sidebar";

export const sidebarMenuItemClass = "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-xs outline-none data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0";
export const sidebarMenuPopupClass = "min-w-52 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none";

type Props = {
  plan: { id: string; title: string; status: "draft" | "approved" }; active: boolean; disabled: boolean; canInspect: boolean; mobile: boolean;
  onOpen: () => void; onProperties: () => void; onDelete: () => void; onNavigate: () => void;
};

export function SidebarPlanActions({ plan, active, disabled, canInspect, mobile, onOpen, onProperties, onDelete, onNavigate }: Props) {
  return <Menu.Root><Menu.Trigger render={<SidebarMenuAction showOnHover />} disabled={disabled} aria-label={`Actions for ${plan.title}`} title={`Actions for ${plan.title}`} className="top-0! right-0! size-11! rounded-lg text-muted-foreground after:hidden data-popup-open:bg-muted [@media(hover:none)]:opacity-100!"><Ellipsis aria-hidden="true" /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner side={mobile ? "bottom" : "right"} align="start" sideOffset={6} className="z-60"><Menu.Popup className={sidebarMenuPopupClass} aria-label={`Plan actions: ${plan.title}`}><div className="max-w-64 border-b px-3 py-2.5"><p className="truncate text-xs font-semibold" title={plan.title}>{plan.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{plan.status === "approved" ? "Approved plan" : "Draft plan"}</p></div><Menu.Item onClick={onOpen} className={sidebarMenuItemClass}><ArrowUpRight />Open plan</Menu.Item><Menu.LinkItem render={<Link to="/reports" search={{ planId: plan.id }} />} closeOnClick onClick={onNavigate} className={sidebarMenuItemClass}><ChartColumnIncreasing />Plan report</Menu.LinkItem>{active && <Menu.Item disabled={!canInspect} onClick={onProperties} className={sidebarMenuItemClass}><Info />About this plan</Menu.Item>}{plan.id !== PACK_DEMO.planId && <><Menu.Separator className="my-1 h-px bg-border" /><Menu.Item onClick={onDelete} className={`${sidebarMenuItemClass} text-destructive data-highlighted:bg-destructive/10`}><Trash2 />Delete plan</Menu.Item></>}</Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
