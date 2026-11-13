/**
 * GEOVENTRA — notification preferences panel.
 *
 * Lists the current user's in-app notification channel preferences and saves updates back
 * through the notifications API.
 */

'use client';

import { useState, type ReactElement } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingPanel } from '@geoventra/ui';
import type { NotificationPreference, Severity } from '@geoventra/contracts';

export interface NotificationPreferencesProps {
  preferences?: NotificationPreference[];
  isLoading?: boolean;
  error?: Error | null;
  /** Invoked with the (possibly updated) preference list when the operator saves. */
  onChange?: (preferences: NotificationPreference[]) => void;
}

const SEVERITY_OPTIONS: Severity[] = ['critical', 'high', 'medium', 'low'];

export function NotificationPreferences({
  preferences = [],
  isLoading = false,
  error = null,
  onChange,
}: NotificationPreferencesProps): ReactElement {
  const [draft, setDraft] = useState<NotificationPreference[]>(preferences);
  const [dirty, setDirty] = useState(preferences.length > 0);

  if (isLoading) {
    return <LoadingPanel label="Loading notification preferences…" />;
  }

  if (error) {
    return <EmptyState icon={<span aria-hidden="true">!</span>} title="Preferences unavailable" description={error.message} />;
  }

  const update = (updated: NotificationPreference[]) => {
    setDraft(updated);
    setDirty(true);
  };

  const toggle = (preference: NotificationPreference) => {
    update(
      draft.map((candidate) =>
        candidate.id === preference.id
          ? { ...candidate, enabled: !candidate.enabled }
          : candidate,
      ),
    );
  };

  const save = () => {
    onChange?.(draft);
    setDirty(false);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between py-3">
        <CardTitle as="h2" className="text-xs">Notification preferences</CardTitle>
        <Button size="sm" onClick={save} disabled={!dirty}>
          Save
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {preferences.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            No notification preferences yet. Alerting rules can create in-app notifications per alert type.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {preferences.map((preference) => (
              <li key={`${preference.alertType}-${preference.channel}`} className="flex items-center justify-between gap-2 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant={preference.enabled ? 'success' : 'neutral'}>{preference.channel}</Badge>
                  <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{preference.alertType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                    Min severity
                    <select
                      value={preference.minSeverity}
                      onChange={(event) =>
                        update(
                          draft.map((candidate) =>
                            candidate.id === preference.id
                              ? { ...candidate, minSeverity: event.target.value as Severity }
                              : candidate,
                          ),
                        )
                      }
                      className="h-7 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-[10px] text-[var(--text-primary)]"
                      data-testid={`notification-min-severity-${preference.alertType}-${preference.channel}`}
                    >
                      {SEVERITY_OPTIONS.map((severity) => (
                        <option key={severity} value={severity}>
                          {severity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={preference.enabled}
                      onChange={() => toggle(preference)}
                      className="accent-[var(--primary-500)]"
                      data-testid={`notification-enabled-${preference.alertType}-${preference.channel}`}
                    />
                    In-app
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        {preferences.length > 0 ? (
          <p className="text-[10px] text-[var(--text-muted)]">In-app delivery is evaluated per alert type and severity.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
