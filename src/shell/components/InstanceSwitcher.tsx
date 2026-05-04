/**
 * InstanceSwitcher.tsx — popover for switching between world instances (playthroughs).
 *
 * Shows when a world has more than one instance. Lists instances with:
 * - inline rename (PATCH /api/instances/:worldId/:instanceId)
 * - delete (DELETE with confirm)
 * - "+ New playthrough" (POST createInstance then navigate)
 *
 * Hidden when instances.length <= 1.
 */

import { h, Fragment } from "preact";
import type { VNode } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { createInstance } from "../../sdk/api.js";
import type { InstanceSummary } from "../../sdk/api.js";
import { navigate } from "../router.js";
import { fetchJSON } from "../../sdk/utils.js";

interface InstanceSwitcherProps {
  worldId: string;
  currentInstanceId: string;
  instances: InstanceSummary[];
  onInstancesChange?: () => void; // callback to re-fetch instances after mutation
}

export function InstanceSwitcher({
  worldId,
  currentInstanceId,
  instances,
  onInstancesChange,
}: InstanceSwitcherProps): VNode | null {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (instances.length <= 1) {
    // Only show the "+ New playthrough" link when only one instance
    return (
      <button
        class="instance-switcher-new-solo"
        type="button"
        disabled={busy}
        onClick={handleNewPlaythrough}
      >
        + New playthrough
      </button>
    );
  }

  async function handleRename(instanceId: string) {
    if (!renameValue.trim()) return;
    setBusy(true);
    try {
      await fetchJSON(
        `/api/instances/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ displayName: renameValue.trim() }),
        }
      );
      setRenamingId(null);
      onInstancesChange?.();
    } catch (err) {
      console.error("[Parley] rename instance failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(instanceId: string, displayName: string) {
    const confirmed = window.confirm(
      `Delete "${displayName}"? This cannot be undone.`
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await fetchJSON(
        `/api/instances/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}`,
        { method: "DELETE" }
      );
      setOpen(false);
      // If we just deleted the active instance, route to the next one or L1
      if (instanceId === currentInstanceId) {
        const remaining = instances.filter((i) => i.instanceId !== instanceId);
        if (remaining.length > 0) {
          // Sort by lastPlayedAt desc
          const next = [...remaining].sort((a, b) => {
            if (!a.lastPlayedAt && !b.lastPlayedAt) return 0;
            if (!a.lastPlayedAt) return 1;
            if (!b.lastPlayedAt) return -1;
            return (
              new Date(b.lastPlayedAt).getTime() -
              new Date(a.lastPlayedAt).getTime()
            );
          })[0];
          navigate(`/world/${encodeURIComponent(worldId)}/${encodeURIComponent(next.instanceId)}`);
        } else {
          navigate("/");
        }
      }
      onInstancesChange?.();
    } catch (err) {
      console.error("[Parley] delete instance failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleNewPlaythrough() {
    setBusy(true);
    try {
      const newInstance = await createInstance(worldId);
      setOpen(false);
      navigate(
        `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(newInstance.instanceId)}`
      );
    } catch (err) {
      console.error("[Parley] create instance failed:", err);
    } finally {
      setBusy(false);
    }
  }

  function startRename(instance: InstanceSummary) {
    setRenamingId(instance.instanceId);
    setRenameValue(instance.displayName);
  }

  return (
    <div class="instance-switcher" ref={popoverRef}>
      <button
        class="instance-switcher-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="instance-switcher-label">
          {instances.find((i) => i.instanceId === currentInstanceId)?.displayName ??
            currentInstanceId}
        </span>
        <span class="instance-switcher-chevron" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div class="instance-switcher-popover" role="listbox">
          {instances.map((inst) => (
            <div
              key={inst.instanceId}
              class={`instance-switcher-row${inst.instanceId === currentInstanceId ? " current" : ""}`}
            >
              {renamingId === inst.instanceId ? (
                // Inline rename form
                <form
                  class="instance-rename-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRename(inst.instanceId);
                  }}
                >
                  <input
                    class="instance-rename-input"
                    value={renameValue}
                    onInput={(e) =>
                      setRenameValue(
                        (e.target as HTMLInputElement).value
                      )
                    }
                    autoFocus
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    class="instance-rename-save"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    class="instance-rename-cancel"
                    onClick={() => setRenamingId(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <button
                    class="instance-switcher-name"
                    type="button"
                    role="option"
                    aria-selected={inst.instanceId === currentInstanceId}
                    onClick={() => {
                      setOpen(false);
                      if (inst.instanceId !== currentInstanceId) {
                        navigate(
                          `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(inst.instanceId)}`
                        );
                      }
                    }}
                  >
                    {inst.displayName}
                  </button>
                  <span class="instance-switcher-actions">
                    <button
                      type="button"
                      class="instance-action-btn"
                      title="Rename"
                      aria-label={`Rename ${inst.displayName}`}
                      onClick={() => startRename(inst)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      class="instance-action-btn"
                      title="Delete"
                      aria-label={`Delete ${inst.displayName}`}
                      disabled={busy}
                      onClick={() =>
                        handleDelete(inst.instanceId, inst.displayName)
                      }
                    >
                      🗑️
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}

          <div class="instance-switcher-new">
            <button
              type="button"
              class="instance-new-btn"
              disabled={busy}
              onClick={handleNewPlaythrough}
            >
              + New playthrough
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
