import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class DeviceOfflineScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceOfflineScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.DEVICE_OFFLINE_SCHEDULER_INTERVAL_MS ?? 60_000);
    this.timer = setInterval(() => {
      void this.run();
    }, intervalMs);
    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private thresholdMinutes(): number {
    return Number(process.env.DEVICE_OFFLINE_THRESHOLD_MINUTES ?? 15);
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const threshold = this.thresholdMinutes();
      // Mark newly offline devices (idempotent: only devices not already offline).
      const offlineRows = await this.db.query<any>(
        `UPDATE geoventra.devices
            SET connectivity_status = 'offline',
                offline_since = COALESCE(offline_since, last_communication_at, now()),
                last_status_change_at = now(),
                offline_reason = 'no_telemetry',
                last_seen_at = COALESCE(last_seen_at, last_communication_at)
          WHERE active_flag = TRUE
            AND (connectivity_status IS NULL OR connectivity_status <> 'offline')
            AND COALESCE(last_communication_at, created_at) < now() - ($1::text || ' minutes')::interval
          RETURNING id, organisation_id, device_id`,
        [threshold],
      );
      for (const row of offlineRows) {
        await this.db.query(
          `INSERT INTO geoventra.alerts (organisation_id, vehicle_id, type, severity, status, title, message, occurred_at, dedupe_key)
           SELECT $1, da.vehicle_id, 'device_offline', 'high', 'open',
                  'Device offline', 'Device ' || $2 || ' has not reported telemetry', now(), $3
             WHERE NOT EXISTS (
               SELECT 1 FROM geoventra.alerts a
                WHERE a.organisation_id = $1 AND a.dedupe_key = $3 AND a.status IN ('open','acknowledged')
             )`,
          [row.organisation_id, row.device_id, `device_offline:${row.id}`],
        ).catch(() => undefined);
      }

      // Recover devices that have resumed telemetry.
      const recoveredRows = await this.db.query<any>(
        `UPDATE geoventra.devices
            SET connectivity_status = 'online',
                offline_since = NULL,
                last_status_change_at = now(),
                offline_reason = NULL,
                last_seen_at = COALESCE(last_communication_at, last_seen_at)
          WHERE active_flag = TRUE
            AND connectivity_status = 'offline'
            AND last_communication_at IS NOT NULL
            AND last_communication_at >= now() - ($1::text || ' minutes')::interval
          RETURNING id, organisation_id, device_id`,
        [threshold],
      );
      for (const row of recoveredRows) {
        await this.db.query(
          `INSERT INTO geoventra.alerts (organisation_id, vehicle_id, type, severity, status, title, message, occurred_at, dedupe_key)
           SELECT $1, da.vehicle_id, 'device_recovered', 'low', 'open',
                  'Device recovered', 'Device ' || $2 || ' is reporting again', now(), $3
             WHERE NOT EXISTS (
               SELECT 1 FROM geoventra.alerts a
                WHERE a.organisation_id = $1 AND a.dedupe_key = $3 AND a.status IN ('open','acknowledged')
             )`,
          [row.organisation_id, row.device_id, `device_recovered:${row.id}:${Math.floor(Date.now() / 3600000)}`],
        ).catch(() => undefined);
      }
    } catch (error) {
      this.logger.warn(`Device offline scheduler failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
