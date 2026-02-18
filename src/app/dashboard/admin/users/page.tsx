"use client";

import { useState } from "react";
import {
  Plus,
  Loader2,
  Ban,
  CheckCircle2,
  RotateCcw,
  Users,
  DollarSign,
  Activity,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "~/trpc/react";

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function formatCost(costCents: number): string {
  return `$${(costCents / 100).toFixed(2)}`;
}

export default function AdminUsersPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  const utils = api.useUtils();

  const { data: users, isLoading } = api.admin.listUsersWithUsage.useQuery();

  const createUser = api.admin.createBetaUser.useMutation({
    onSuccess: () => {
      void utils.admin.listUsersWithUsage.invalidate();
      setIsCreateDialogOpen(false);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
    },
  });

  const banUser = api.admin.banUser.useMutation({
    onSuccess: () => void utils.admin.listUsersWithUsage.invalidate(),
  });

  const unbanUser = api.admin.unbanUser.useMutation({
    onSuccess: () => void utils.admin.listUsersWithUsage.invalidate(),
  });

  const resetUsage = api.admin.resetUsage.useMutation({
    onSuccess: () => void utils.admin.listUsersWithUsage.invalidate(),
  });

  const handleCreateUser = () => {
    createUser.mutate({
      email: newUserEmail,
      password: newUserPassword,
      name: newUserName || undefined,
    });
  };

  // Stats
  const totalUsers = users?.length ?? 0;
  const activeUsers = users?.filter((u) => !u.banned).length ?? 0;
  const totalCostCents =
    users?.reduce((acc, u) => acc + (u.apiUsage?.totalCostCents ?? 0), 0) ?? 0;
  const totalTokens =
    users?.reduce(
      (acc, u) =>
        acc +
        (u.apiUsage?.totalInputTokens ?? 0) +
        (u.apiUsage?.totalOutputTokens ?? 0),
      0,
    ) ?? 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des utilisateurs</h1>
          <p className="text-muted-foreground text-sm">
            Gerez les comptes beta et suivez la consommation API
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              Creer un compte beta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Creer un compte beta</DialogTitle>
              <DialogDescription>
                Le compte sera cree avec un mot de passe temporaire.
                L&apos;utilisateur devra le changer a la premiere connexion.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nom (optionnel)</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe temporaire</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 caracteres"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
              </div>
              {createUser.error && (
                <p className="text-destructive text-sm">
                  {createUser.error.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={
                  createUser.isPending ||
                  !newUserEmail ||
                  !newUserPassword ||
                  newUserPassword.length < 8
                }
              >
                {createUser.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Creer le compte
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total utilisateurs
            </CardTitle>
            <Users className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Utilisateurs actifs
            </CardTitle>
            <CheckCircle2 className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Tokens consommes
            </CardTitle>
            <Activity className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTokens(totalTokens)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cout total</CardTitle>
            <DollarSign className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(totalCostCents)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Cree le</TableHead>
                  <TableHead className="text-right">Tokens In</TableHead>
                  <TableHead className="text-right">Tokens Out</TableHead>
                  <TableHead className="text-right">Cout</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.name ?? "—"}</div>
                        <div className="text-muted-foreground text-sm">
                          {user.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.role?.includes("admin") ? "default" : "secondary"
                        }
                      >
                        {user.role ?? "user"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatTokens(user.apiUsage?.totalInputTokens ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatTokens(user.apiUsage?.totalOutputTokens ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCost(user.apiUsage?.totalCostCents ?? 0)}
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="destructive">Banni</Badge>
                      ) : (
                        <Badge variant="outline">Actif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            ...
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {user.banned ? (
                            <DropdownMenuItem
                              onClick={() =>
                                unbanUser.mutate({ userId: user.id })
                              }
                            >
                              <CheckCircle2 className="mr-2 size-4" />
                              Debannir
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                banUser.mutate({ userId: user.id })
                              }
                              className="text-destructive"
                            >
                              <Ban className="mr-2 size-4" />
                              Bannir
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() =>
                              resetUsage.mutate({ userId: user.id })
                            }
                          >
                            <RotateCcw className="mr-2 size-4" />
                            Reset compteur
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {users?.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-muted-foreground py-12 text-center"
                    >
                      Aucun utilisateur trouve
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
