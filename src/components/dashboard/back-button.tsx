"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "~/components/ui/button";

export function BackButton() {
  const router = useRouter();

  return (
    <Button variant="ghost" className="mb-8" onClick={() => router.back()}>
      <ArrowLeft className="mr-2 size-4" />
      Retour
    </Button>
  );
}
