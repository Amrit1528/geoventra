/**
 * GEOVENTRA — alert center.
 *
 * Lists the alerts raised by the geofence engine (entry, exit, excessive dwell) with the
 * operator lifecycle actions (acknowledge / resolve) and the in-app notification preferences.
 */

'use client';

import { useState, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageLayout, Select, EmptyState, LoadingPanel } from '@geoventra/ui';
import type { AlertSummary, Notification, NotificationPreference } from '@geoventra/contracts';
import { AlertCenter } from '@/components/alerts/AlertCenter';
import { NotificationPreferences } from '@/components/alerts/NotificationPreferences';
import {
  acknowledgeGeofenceAlert,
  fetchGeofenceAlerts,
  fetchNotifications,
  fetchNotificationPreferences,
  fetchSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
  resolveGeofenceAlert,
  updateNotificationPreferences,
} from '@/lib/track-api';

type AlertStatusFilter = 'open' | 'acknowledged' | 'resolved' | 'all';
type AlertSeverityFilter = 'critical' | 'high' | 'medium' | 'low' | 'all';

export default function AlertsPage(): ReactElement {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AlertStatusFilter>('open');
  const [severity, setSeverity] = useState<AlertSeverityFilter>('all');
  const [vehicleId, setVehicleId] = useState('');

  const alertsQuery = useQuery({
    queryKey: ['alerts', status, severity, vehicleId],
    queryFn: ({ signal }) =>
      fetchGeofenceAlerts(
        {
          status: status === 'all' ? undefined : status,
          severity: severity === 'all' ? undefined : severity,
          vehicleId: vehicleId || undefined,
          limit: 100,
        },
        signal,
      ),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alert: AlertSummary) => acknowledgeGeofenceAlert(alert.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (alert: AlertSummary) => resolveGeofenceAlert(alert.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: ({ signal }) => fetchNotificationPreferences(signal),
  });

  const savePreferencesMutation = useMutation({
    mutationFn: (preferences: NotificationPreference[]) => updateNotificationPreferences(preferences),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const notificationsInboxQuery = useQuery({
    queryKey: ['notifications', 'inbox'],
    queryFn: ({ signal }) => fetchNotifications({ limit: 50 }, signal),
  });

  const fleetQuery = useQuery({
    queryKey: ['tracking-snapshot'],
    queryFn: ({ signal }) => fetchSnapshot(signal),
  });

  const alerts = alertsQuery.data?.data ?? [];
  const notificationPreferences = notificationsQuery.data ?? [];
  const notifications = notificationsInboxQuery.data?.data ?? [];
  const vehicles = fleetQuery.data?.positions ?? [];

  const pendingIds = new Set<string>();
  for (const alert of alerts) {
    if (acknowledgeMutation.isPending) pendingIds.add(alert.id);
    if (resolveMutation.isPending) pendingIds.add(alert.id);
  }

  return (
    <PageLayout
      title="Alerts"
      description="Automated geofence alerts with acknowledgement and resolution workflows."
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as AlertStatusFilter)}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'all', label: 'All' },
            ]}
            ariaLabel="Alert status filter"
            className="h-8"
          />
          <Select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as AlertSeverityFilter)}
            options={[
              { value: 'all', label: 'All severities' },
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
            ariaLabel="Alert severity filter"
            className="h-8"
          />
          <Select
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            options={[
              { value: '', label: 'All vehicles' },
              ...vehicles.map((vehicle) => ({ value: vehicle.vehicleId, label: `${vehicle.registrationNumber} — ${vehicle.name}` })),
            ]}
            ariaLabel="Alert vehicle filter"
            className="h-8"
          />
        </div>
      }
    >
      {alertsQuery.isLoading ? (
        <LoadingPanel label="Loading alerts…" />
      ) : alertsQuery.error ? (
        <EmptyState icon={<span aria-hidden="true">!</span>} title="Alerts unavailable" description={alertsQuery.error.message} />
      ) : (
        <AlertCenter
          alerts={alerts}
          isLoading={alertsQuery.isLoading}
          error={alertsQuery.error ?? null}
          onAcknowledge={(alert) => void acknowledgeMutation.mutateAsync(alert)}
          onResolve={(alert) => void resolveMutation.mutateAsync(alert)}
          onRefresh={() => void alertsQuery.refetch()}
          pendingIds={pendingIds}
        />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <NotificationPreferences
          preferences={notificationPreferences}
          isLoading={notificationsQuery.isLoading}
          error={notificationsQuery.error ?? null}
          onChange={(preferences) => void savePreferencesMutation.mutateAsync(preferences)}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Inbox</p>
            <button
              type="button"
              onClick={() => void markAllReadMutation.mutateAsync()}
              disabled={markAllReadMutation.isPending}
              className="text-[10px] font-semibold text-[var(--primary-500)] hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>
          {notificationsInboxQuery.isLoading ? (
            <LoadingPanel label="Loading notifications…" />
          ) : (notificationsInboxQuery.data?.data ?? []).length === 0 ? (
            <EmptyState
              icon={<span aria-hidden="true">!</span>}
              title="No notifications"
              description="In-app alerts raised by the geofence engine will appear here."
            />
          ) : (
            <ul className="flex max-h-[60vh] flex-col divide-y divide-[var(--border)] overflow-y-auto scroll-thin">
              {(notificationsInboxQuery.data?.data ?? []).map((notification: Notification) => (
                <li
                  key={notification.id}
                  data-testid={`notification-item-${notification.id}`}
                  className="flex items-start justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{notification.title}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{notification.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void markReadMutation.mutateAsync(notification.id)}
                    disabled={markReadMutation.isPending}
                    className="shrink-0 text-[10px] font-semibold text-[var(--primary-500)] hover:underline disabled:opacity-50"
                  >
                    Mark read
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
