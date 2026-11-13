import { apiRequest } from './api';
export function fetchFleetSummary() { return apiRequest<any>('/reports/fleet-summary'); }
export function fetchTripsReport(query: any = {}) { return apiRequest<any>('/reports/trips', { query }); }
