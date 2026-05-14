"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AppSettings {
  hrmisUrl: string;
  port: number;
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  onSaved?: (next: AppSettings, portChanged: boolean) => void;
}

export function SettingsDialog({
  open,
  onClose,
  apiBase,
  onSaved,
}: SettingsDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hrmisUrl, setHrmisUrl] = useState("");
  const [port, setPort] = useState<number>(4001);
  const [initial, setInitial] = useState<AppSettings | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    axios
      .get<AppSettings>(`${apiBase}/api/settings`)
      .then((res) => {
        const s = res.data;
        setHrmisUrl(s.hrmisUrl);
        setPort(s.port);
        setInitial(s);
      })
      .catch(() => setError("Could not load current settings."))
      .finally(() => setLoading(false));
  }, [open, apiBase]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const portChanged = initial !== null && port !== initial.port;
  const dirty =
    initial !== null && (hrmisUrl.trim() !== initial.hrmisUrl || portChanged);

  const validate = (): string | null => {
    const trimmed = hrmisUrl.trim();
    if (!trimmed) return "HRMIS URL is required.";
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return "HRMIS URL must start with http:// or https://";
      }
    } catch {
      return "HRMIS URL is not a valid URL.";
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return "Port must be between 1 and 65535.";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        hrmisUrl: hrmisUrl.trim().replace(/\/+$/, ""),
        port: Math.floor(port),
      };
      await axios.put(`${apiBase}/api/settings`, payload);
      onSaved?.(payload, portChanged);
      onClose();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : "Could not save settings. Please try again.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
      >
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4 flex items-center justify-between">
          <h2
            id="settings-title"
            className="text-white text-lg font-semibold flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          {loading ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              Loading current settings…
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="hrmis-url"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  HRMIS API URL
                </label>
                <Input
                  id="hrmis-url"
                  type="url"
                  value={hrmisUrl}
                  onChange={(e) => setHrmisUrl(e.target.value)}
                  placeholder="https://people-api.pglsystem.com"
                  disabled={saving}
                  className="bg-white/80 dark:bg-slate-700/80"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Attendance records will be POSTed to{" "}
                  <code className="text-xs">
                    {hrmisUrl
                      ? `${hrmisUrl.replace(/\/+$/, "")}/iclock/cdata`
                      : "…/iclock/cdata"}
                  </code>
                  . Takes effect immediately, no restart needed.
                </p>
              </div>

              <div>
                <label
                  htmlFor="port"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Listening port
                </label>
                <Input
                  id="port"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  disabled={saving}
                  className="bg-white/80 dark:bg-slate-700/80 w-40"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  The port your attendance devices POST to (e.g.{" "}
                  <code className="text-xs">PC_IP:{port}/iclock/cdata</code>).
                </p>
                {portChanged && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                    <strong>Heads up:</strong> changing the port will restart
                    the sync service. This page will briefly disconnect and must
                    be reopened at the new URL{" "}
                    <code>http://[this-PC]:{port}/</code>.
                  </div>
                )}
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="border-slate-300 dark:border-slate-600"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !dirty}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
