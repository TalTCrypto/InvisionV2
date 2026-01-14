import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Vérifier si l'utilisateur est admin
  const userRole = session.user.role;
  const isAdmin = userRole?.split(",").includes("admin") ?? false;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
