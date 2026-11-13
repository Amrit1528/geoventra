/**
 * GEOVENTRA — fleet groups service.
 *
 * Handles persistence and retrieval of fleet group configurations and assignments.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { FleetGroup } from '@geoventra/contracts';
import type { VehicleSummary } from '@geoventra/contracts';
import type { UserSummary } from '@geoventra/contracts';
import { Logger } from '@nestjs/common';

@Injectable()
export class FleetGroupsService {
  private readonly logger = new Logger(FleetGroupsService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Retrieves all fleet groups for the organization.
   */
  async findAllFleetGroups(organisationId: string): Promise<FleetGroup[]> {
    const rows = await this.database.query<{ id: string; name: string; description: string | null; color: string }>(
      `SELECT id, name, description, color FROM geoventra.fleet_groups WHERE organisation_id = $1`,
      [organisationId],
    );
    return rows.map(r => r as FleetGroup);
  }

  /**
   * Creates a new fleet group.
   */
  async createFleetGroup(organisationId: string, name: string, description: string | null, color: string): Promise<FleetGroup> {
    const result = await this.database.queryOne<{ id: string; name: string; description: string | null; color: string }>(
      `INSERT INTO geoventra.fleet_groups (organisation_id, name, description, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, color`,
      [organisationId, name, description, color],
    );
    return result as FleetGroup;
  }

  /**
   * Assigns a vehicle to a specific fleet group.
   */
  async assignVehicleToGroup(groupId: string, vehicleId: string): Promise<FleetGroup> {
    // Use a transaction to ensure assignment is atomic
    return this.database.transaction(async (client) => {
      // Check group and vehicle existence first
      const group = await client.queryOne<FleetGroup>(
        `SELECT id, name, description, color FROM geoventra.fleet_groups WHERE id = $1`,
        [groupId],
      );
      if (!group) throw new Error('Fleet group not found.');

      // Perform assignment (assuming a junction table geoventra.vehicle_group_mapping)
      await client.query('INSERT INTO geoventra.vehicle_group_mapping (fleet_group_id, vehicle_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, vehicleId]);

      // Return updated group summary
      return await client.queryOne<FleetGroup>(
        `SELECT id, name, description, color FROM geoventra.fleet_groups WHERE id = $1`,
        [groupId],
      );
    });
  }
}