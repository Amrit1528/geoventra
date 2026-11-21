import { apiRequest } from './api';
export function fetchInsuranceSummary() { return apiRequest<any>('/insurance/summary'); }