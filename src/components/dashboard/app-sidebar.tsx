"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, Plug, Users, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarRail,
} from "~/components/ui/sidebar";
import { api } from "~/trpc/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import { ChevronDown, LogOut } from "lucide-react";
import { authClient } from "~/server/better-auth/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Label } from "~/components/ui/label";

const navigation = [
  { name: "Accueil", href: "/dashboard", icon: Home },
  { name: "Chat IA", href: "/dashboard/chat", icon: MessageSquare },
  { name: "Intégrations", href: "/dashboard/integrations", icon: Plug },
  { name: "Organisation", href: "/dashboard/organization", icon: Users },
];

const adminNavigation = [
  { name: "Workflows", href: "/dashboard/admin/workflows", icon: Settings },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChangingOrg, setIsChangingOrg] = useState(false);

  const { data: organizations, isLoading: isLoadingOrgs } =
    api.organization.getUserOrganizations.useQuery();

  const { data: currentOrg, isLoading: isLoadingCurrent } =
    api.organization.getCurrentOrganization.useQuery();

  // Note: La vérification admin se fait côté serveur dans le layout admin
  // On affiche le menu admin si on est sur une route admin (déjà vérifié côté serveur)
  const isAdminRoute = pathname?.startsWith("/dashboard/admin");

  const utils = api.useUtils();

  const setActiveOrg = api.organization.setActiveOrganization.useMutation({
    onSuccess: () => {
      // Invalider toutes les queries qui dépendent de l'organisation active
      void utils.organization.getCurrentOrganization.invalidate();
      void utils.organization.getUserOrganizations.invalidate();

      // Invalider les queries du chat qui dépendent de l'organisation
      void utils.chat.getWorkflows.invalidate();
      void utils.chat.getSessions.invalidate();
      void utils.chat.getSession.invalidate();

      // Invalider les queries d'intégrations qui dépendent de l'organisation
      void utils.integrations.list.invalidate();
      void utils.integrations.getConnected.invalidate();
      void utils.integrations.getYouTubeMetrics.invalidate();
      void utils.integrations.getInstagramMetrics.invalidate();

      // Invalider les queries admin (au cas où elles dépendent de l'organisation)
      void utils.admin.listWorkflows.invalidate();
      void utils.admin.listOrganizations.invalidate();
      void utils.admin.listOrganizationMembers.invalidate();

      // Rafraîchir la page pour s'assurer que tout est à jour
      router.refresh();
      setIsChangingOrg(false);
    },
  });

  const handleOrgChange = (orgId: string) => {
    setIsChangingOrg(true);
    setActiveOrg.mutate({ organizationId: orgId });
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/auth/signin");
    router.refresh();
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg font-bold">
              IV
            </div>
            <span className="text-lg font-semibold">InVision</span>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname?.startsWith(item.href + "/");
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href}>
                        <Icon className="size-5" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {/* Menu Admin - visible si on est sur une route admin */}
              {isAdminRoute && (
                <>
                  <SidebarSeparator className="my-2" />
                  <div className="px-2 py-1.5">
                    <p className="text-muted-foreground text-xs font-semibold">
                      Administration
                    </p>
                  </div>
                  {adminNavigation.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname?.startsWith(item.href + "/");
                    const Icon = item.icon;

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link href={item.href}>
                            <Icon className="size-5" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />

      {/* Organization Selector and User Menu at bottom */}
      <SidebarFooter className="pb-8">
        <div className="space-y-3 px-2">
          {/* Organization Selector */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">
              Organisation
            </Label>
            {isLoadingOrgs || isLoadingCurrent ? (
              <div className="bg-muted h-9 w-full animate-pulse rounded-md" />
            ) : (
              <Select
                value={currentOrg?.id}
                onValueChange={handleOrgChange}
                disabled={isChangingOrg}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {currentOrg?.name ?? "Sélectionner une organisation"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {organizations?.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      <div className="flex items-center gap-2">
                        {org.logo ? (
                          <img
                            src={org.logo}
                            alt={org.name}
                            className="size-5 rounded"
                          />
                        ) : (
                          <div className="bg-primary/10 text-primary flex size-5 items-center justify-center rounded text-xs font-medium">
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{org.name}</span>
                        {org.role === "owner" && (
                          <span className="text-muted-foreground ml-auto text-xs">
                            Propriétaire
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* User Menu */}
          <UserAccountMenu onSignOut={handleSignOut} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function UserAccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const userDisplayName =
    user?.name ?? user?.email?.split("@")[0] ?? "Utilisateur";
  const userEmail = user?.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="-ml-3 h-9 w-full justify-start gap-2 px-0 py-2"
        >
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full font-medium">
            {userDisplayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-1 flex-col items-start text-left">
            <span className="text-sm font-medium">{userDisplayName}</span>
            {userEmail && (
              <span className="text-muted-foreground text-xs">{userEmail}</span>
            )}
          </div>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm leading-none font-medium">
              {userDisplayName}
            </p>
            {userEmail && (
              <p className="text-muted-foreground text-xs leading-none">
                {userEmail}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings" className="cursor-pointer">
            Paramètres
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="cursor-pointer">
          <LogOut className="mr-2 size-4" />
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
