"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Trash2,
  CheckCheck,
  BellOff,
} from "lucide-react";
import { useNotifications, TransactionNotification, NotificationStatus, NotificationSeverity } from "@/lib/notification-context";

export function NotificationDrawer() {
  const {
    notifications,
    isDrawerOpen,
    closeDrawer,
    markAllAsRead,
    clearNotifications,
    unreadCount,
    markAsRead,
  } = useNotifications();

  const [severity, setSeverity] = useState<NotificationSeverity | "all">("all");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeDrawer(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawerOpen, closeDrawer]);
  if (!isDrawerOpen) return null;
  const filtered = notifications.filter(item => severity === "all" || (item.severity ?? (item.status === "failed" ? "error" : item.status === "confirmed" ? "success" : "info")) === severity);
  const groups = [
    { label: "Today", items: filtered.filter(item => new Date(item.timestamp).toDateString() === new Date().toDateString()) },
    { label: "Yesterday", items: filtered.filter(item => new Date(item.timestamp).toDateString() === new Date(Date.now() - 86400000).toDateString()) },
    { label: "Earlier", items: filtered.filter(item => new Date(item.timestamp).toDateString() !== new Date().toDateString() && new Date(item.timestamp).toDateString() !== new Date(Date.now() - 86400000).toDateString()) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      aria-labelledby="notification-drawer-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        onClick={closeDrawer}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-black/10 animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2
                id="notification-drawer-title"
                className="text-base font-bold text-black tracking-tight"
              >
                Notifications
              </h2>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllAsRead}
                    title="Mark all as read"
                    className="p-1.5 rounded-md text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors"
                  >
                    <CheckCheck size={16} />
                  </button>
                  <button
                    onClick={clearNotifications}
                    title="Clear all notifications"
                    className="p-1.5 rounded-md text-neutral-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
              <button
                onClick={closeDrawer}
                ref={closeRef}
                className="p-1.5 rounded-md text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors ml-1"
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 px-4 py-3 border-b border-black/10" aria-label="Filter notifications by severity">{(["all", "info", "success", "warning", "error"] as const).map(value => <button key={value} type="button" aria-pressed={severity === value} onClick={() => setSeverity(value)} className={`rounded-md px-2 py-1 text-xs capitalize ${severity === value ? "bg-black text-white" : "bg-neutral-100 text-neutral-600"}`}>{value}</button>)}</div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-neutral-400">
                <BellOff size={36} className="text-neutral-300 mb-3" />
                <p className="text-sm font-semibold text-neutral-700">
                  No notifications yet
                </p>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                  Real-time confirmations, customer subscriptions, and pull settlements will appear here as they occur.
                </p>
              </div>
            ) : (
              groups.filter(group => group.items.length).map(group => <section key={group.label}><h3 className="mb-2 text-xs font-semibold text-neutral-500">{group.label}</h3><div className="space-y-2">{group.items.map(item => <div key={item.id} onClick={() => markAsRead(item.id)}><NotificationItem notification={item} /></div>)}</div></section>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationItem({
  notification,
}: {
  notification: TransactionNotification;
}) {
  const explorerUrl = notification.txHash
    ? `https://stellar.expert/explorer/${
        notification.network === "public" ? "public" : "testnet"
      }/tx/${notification.txHash}`
    : null;

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all ${
        notification.read
          ? "bg-neutral-50/60 border-black/5 text-neutral-600"
          : "bg-white border-black/10 shadow-xs text-neutral-900"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <StatusBadge status={notification.status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold truncate leading-tight">
              {notification.title}
            </h4>
            <span className="text-[10px] text-neutral-400 shrink-0 font-mono">
              {formatTimeAgo(notification.timestamp)}
            </span>
          </div>

          <p className="text-xs text-neutral-600 mt-1 leading-snug">
            {notification.message}
          </p>

          {explorerUrl && (
            <div className="mt-2.5 pt-2 border-t border-black/5 flex items-center justify-between">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <span>View on Stellar Expert</span>
                <ExternalLink size={11} />
              </a>
              <span className="text-[10px] font-mono text-neutral-400">
                {notification.txHash?.slice(0, 6)}...{notification.txHash?.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: NotificationStatus }) {
  switch (status) {
    case "confirmed":
      return (
        <span className="p-1 rounded-full bg-emerald-100 text-emerald-700 block">
          <CheckCircle2 size={14} />
        </span>
      );
    case "pending":
      return (
        <span className="p-1 rounded-full bg-amber-100 text-amber-700 block">
          <Loader2 size={14} className="animate-spin" />
        </span>
      );
    case "submitted":
      return (
        <span className="p-1 rounded-full bg-blue-100 text-blue-700 block">
          <Clock size={14} />
        </span>
      );
    case "failed":
      return (
        <span className="p-1 rounded-full bg-rose-100 text-rose-700 block">
          <AlertCircle size={14} />
        </span>
      );
    default:
      return (
        <span className="p-1 rounded-full bg-neutral-100 text-neutral-700 block">
          <CheckCircle2 size={14} />
        </span>
      );
  }
}

function formatTimeAgo(timestamp: number): string {
  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
