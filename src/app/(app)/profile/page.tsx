"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProfileSkeleton } from "@/components/molecules";
import { useSession } from "@/hooks/use-session";
import { ExpertProfileView } from "./_components/expert-profile-view";
import { FresherProfileView } from "./_components/fresher-profile-view";
import { InstitutionProfileView } from "./_components/institution-profile-view";
import { StartupProfileView } from "./_components/startup-profile-view";

const STAKEHOLDER_ROLES = ["expert", "fresher", "startup", "institution"];

export default function ProfilePage() {
  const router = useRouter();
  // (app)/layout.tsx already guarantees a session exists before this page
  // mounts — only the "role isn't one of the 4 stakeholder roles" case
  // needs handling here.
  const session = useSession();
  const role = session?.roleName.toLowerCase() ?? null;
  const isValidRole = role !== null && STAKEHOLDER_ROLES.includes(role);

  useEffect(() => {
    if (session && !isValidRole) {
      router.replace("/events");
    }
  }, [session, isValidRole, router]);

  // Waiting on the session / redirecting away: hold the page's shape.
  if (!isValidRole) return <ProfileSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      {role === "expert" && <ExpertProfileView />}
      {role === "fresher" && <FresherProfileView />}
      {role === "startup" && <StartupProfileView />}
      {role === "institution" && <InstitutionProfileView />}
    </div>
  );
}
