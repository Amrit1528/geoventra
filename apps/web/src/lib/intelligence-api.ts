import { apiRequest } from './api';

export function fetchIntelligenceOverview(params?: any) { return apiRequest<any>('/intelligence/overview', { query: params }); }
export function fetchIntelligenceFleet(params?: any) { return apiRequest<any>('/intelligence/fleet', { query: params }); }
export function fetchIntelligenceFuel(params?: any) { return apiRequest<any>('/intelligence/fuel', { query: params }); }
export function fetchIntelligenceDrivers(params?: any) { return apiRequest<any>('/intelligence/drivers', { query: params }); }
export function fetchIntelligenceTrips(params?: any) { return apiRequest<any>('/intelligence/trips', { query: params }); }
export function fetchIntelligenceMaintenance() { return apiRequest<any>('/intelligence/maintenance'); }
export function fetchIntelligenceAnomalies(params?: any) { return apiRequest<any>('/intelligence/anomalies', { query: params }); }
export function fetchIntelligenceRecommendations() { return apiRequest<any>('/intelligence/recommendations'); }
export function fetchIntelligenceForecast() { return apiRequest<any>('/intelligence/forecast'); }
export function fetchIntelligenceCosts(params?: any) { return apiRequest<any>('/intelligence/costs', { query: params }); }
export function fetchIntelligenceVehicleRanking(params?: any) { return apiRequest<any>('/intelligence/vehicle-ranking', { query: params }); }
export function fetchIntelligenceInsights() { return apiRequest<any>('/intelligence/insights'); }
export function askIntelligenceAssistant(question: string, params?: any) { return apiRequest<any>('/intelligence/assistant', { method: 'POST', body: { question, ...params } }); }