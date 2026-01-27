"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";

export function ClarityAnalytics() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      Clarity.init("v7wyf6c93r");
    }
  }, []);

  return null;
}
