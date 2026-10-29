"use client";

import { createContext } from "react";

export const OpenCards = createContext<((turnId: string) => void) | null>(null);
