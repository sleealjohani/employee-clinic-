import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";

export default async function RootPage() {
  const user = await requireUser();
  redirect(user.role === "EMPLOYEE" ? "/portal" : "/dashboard");
}
