"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useMemo, useState } from "react";

import { PHONE_QUERY, useMediaQuery } from "@/client/use-media-query";
import { basename, homeRelative, relativeStamp } from "@/lib/format";
import type { FolderChoice } from "@/lib/types";

import styles from "./folder-picker.module.css";
import { IconFolder, IconSearch, IconXmark } from "./icons";

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`);
}

function typedPath(query: string, home: string, folders: FolderChoice[]): string | null {
  let raw = query.trim();
  if (raw.startsWith("~")) raw = `${home}${raw.slice(1)}`;
  if (!raw.startsWith("/")) return null;
  while (raw.length > 1 && raw.endsWith("/")) raw = raw.slice(0, -1);
  if (folders.some((folder) => folder.cwd === raw)) return null;
  return folders.some((folder) => under(raw, folder.cwd)) ? raw : null;
}

export function FolderPicker({
  folders,
  home,
  onClose,
  onPick,
  open,
}: {
  folders: FolderChoice[];
  home: string;
  onClose: () => void;
  onPick: (cwd: string) => void;
  open: boolean;
}) {
  const [query, setQuery] = useState("");
  const phone = useMediaQuery(PHONE_QUERY);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return folders;
    return folders.filter(
      (folder) =>
        folder.label.toLowerCase().includes(needle) || folder.cwd.toLowerCase().includes(needle),
    );
  }, [folders, query]);

  const typed = useMemo(() => typedPath(query, home, folders), [folders, home, query]);

  function pick(cwd: string) {
    setQuery("");
    onPick(cwd);
  }

  function close() {
    setQuery("");
    onClose();
  }

  return (
    <Dialog fullScreen={phone} fullWidth maxWidth="sm" onClose={close} open={open}>
      <DialogTitle className={styles.title}>
        Where should this chat run?
        <span className={styles.subtitle}>
          Claude Code works inside one folder. Pick the folder you want it to read and change.
        </span>
      </DialogTitle>

      <DialogContent className={styles.content} dividers>
        <TextField
          autoFocus
          fullWidth
          id="folder-search"
          name="folder-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search folders"
          size="small"
          slotProps={{
            htmlInput: { "aria-label": "Search folders" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <IconSearch />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton aria-label="Clear search" onClick={() => setQuery("")}>
                    <IconXmark />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          value={query}
        />

        <div className={styles.list}>
          {typed && (
            <div className={styles.group}>
              <p className={styles.groupHead}>
                <span className={styles.groupName}>Use this path</span>
                <span className={styles.groupNote}>It sits inside a folder you trust</span>
              </p>

              <button className={styles.item} onClick={() => pick(typed)} type="button">
                <span className={styles.glyph}>
                  <IconFolder />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{basename(typed)}</span>
                  <span className={styles.path}>{homeRelative(typed, home)}</span>
                </span>
                <span className={styles.meta}>open here</span>
              </button>
            </div>
          )}

          {matches.length === 0 ? (
            typed ? null : (
              <p className={styles.empty}>
                {folders.length === 0
                  ? "No folders yet. Run claude in a folder once and say yes to the trust prompt, then reload this page."
                  : "Nothing matches that search."}
              </p>
            )
          ) : (
            <div className={styles.group}>
              {matches.map((folder) => (
                <button
                  className={styles.item}
                  key={folder.cwd}
                  onClick={() => pick(folder.cwd)}
                  type="button"
                >
                  <span className={styles.glyph}>
                    <IconFolder />
                  </span>
                  <span className={styles.text}>
                    <span className={styles.name}>{folder.label}</span>
                    <span className={styles.path}>{homeRelative(folder.cwd, home)}</span>
                  </span>
                  <span className={styles.meta}>
                    {folder.sessionCount > 0
                      ? `${folder.sessionCount} chat${folder.sessionCount > 1 ? "s" : ""}`
                      : "no chats yet"}
                    {folder.lastModified !== null && ` · ${relativeStamp(folder.lastModified)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>

      <DialogActions>
        <Button color="inherit" onClick={close} variant="text">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
