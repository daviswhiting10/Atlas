"use client";

import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ProspectFollowUpButton({ clientId }: { clientId: string }) {
  const router = useRouter();

  async function handleClick() {
    // Clear the reach-out date then navigate to outreach
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reachOutDate: null }),
    }).catch(() => {
      toast.error("Failed to clear follow-up date");
    });
    router.push(`/outreach?clientId=${clientId}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <MessageSquare className="w-3 h-3 md:mr-1" />
      <span className="hidden md:inline">Compose follow-up</span>
    </button>
  );
}
