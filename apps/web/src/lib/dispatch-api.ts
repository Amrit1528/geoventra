import { apiRequest } from './api';

export function fetchDispatches(params?: any) { return apiRequest<any>('/dispatch', { query: params }); }
export function createDispatch(body: any) { return apiRequest<any>('/dispatch', { method: 'POST', body }); }
export function assignDispatch(id: string, body: any) { return apiRequest<any>(`/dispatch/${id}/assign`, { method: 'PATCH', body }); }
export function updateDispatchStatus(id: string, status: string) { return apiRequest<any>(`/dispatch/${id}/status`, { method: 'PATCH', body: { status } }); }
