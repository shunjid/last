"use client";

import Snackbar from "@mui/material/Snackbar";

import { useBackGuard } from "@/client/back";

import styles from "./back-guard.module.css";

export function BackGuard() {
  const leaving = useBackGuard();

  return (
    <Snackbar
      anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
      className={styles.toast}
      message="Swipe back again to leave"
      open={leaving}
      slotProps={{ content: { className: styles.content } }}
    />
  );
}
