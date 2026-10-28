"use client";

import { createContext } from "react";

export type SessionIdentity = { branch: string | null; cwd: string | null; title: string };

export const SessionIdentity = createContext<SessionIdentity>({
  branch: null,
  cwd: null,
  title: "",
});
