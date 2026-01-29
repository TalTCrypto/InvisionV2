"use client";

import { useEffect, useCallback } from "react";
import Clarity from "@microsoft/clarity";

export function useClarityIdentify(
  userId?: string,
  userEmail?: string,
  userName?: string,
) {
  useEffect(() => {
    if (userId && typeof window !== "undefined") {
      Clarity.identify(userId, undefined, undefined, userName ?? userEmail);
    }
  }, [userId, userEmail, userName]);
}

export function useClarityTag(key: string, value: string | string[]) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      Clarity.setTag(key, value);
    }
  }, [key, value]);
}

export function useClarityEvent() {
  return useCallback((eventName: string) => {
    if (typeof window !== "undefined") {
      Clarity.event(eventName);
    }
  }, []);
}

export const clarityEvent = (eventName: string) => {
  if (typeof window !== "undefined") {
    Clarity.event(eventName);
  }
};

export const clarityUpgrade = (reason: string) => {
  if (typeof window !== "undefined") {
    Clarity.upgrade(reason);
  }
};
