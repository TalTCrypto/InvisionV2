"use client";

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function ChatIAButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed right-6 bottom-6 z-50 size-14 rounded-full shadow-lg transition-all hover:scale-110",
          "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        size="icon"
      >
        <MessageSquare className="size-6" />
        <span className="sr-only">Ouvrir le chat IA</span>
      </Button>

      {isOpen && (
        <div className="border-border bg-background fixed right-6 bottom-24 z-50 w-96 rounded-lg border shadow-xl">
          <div className="border-border flex items-center justify-between border-b p-4">
            <h3 className="font-semibold">Chat IA</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="size-8"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="p-4">
            <p className="text-muted-foreground text-sm">
              Interface de chat IA à venir...
            </p>
          </div>
        </div>
      )}
    </>
  );
}
