import { apiRequest } from './api';

export const fetchIntegrationProviders = () => apiRequest<any>('/integrations/providers');
export const fetchIntegrationProvider = (provider: string) => apiRequest<any>(`/integrations/providers/${provider}`);
export const saveIntegrationCredentials = (provider: string, body: any) => apiRequest<any>(`/integrations/providers/${provider}/credentials`, { method: 'PUT', body });
export const deleteIntegrationCredentials = (provider: string) => apiRequest<any>(`/integrations/providers/${provider}/credentials`, { method: 'DELETE' });
export const verifyIntegrationProvider = (provider: string) => apiRequest<any>(`/integrations/providers/${provider}/verify`, { method: 'POST' });
export const fetchQueueStats = () => apiRequest<any>('/integrations/queue/stats');
export const fetchQueueJobs = (query: any = {}) => apiRequest<any>('/integrations/queue/jobs', { query });
export const retryQueueJob = (id: string) => apiRequest<any>(`/integrations/queue/jobs/${id}/retry`, { method: 'POST' });
export const fetchDeadLetter = (query: any = {}) => apiRequest<any>('/integrations/queue/dead-letter', { query });
export const replayDeadLetter = (id: string) => apiRequest<any>(`/integrations/queue/dead-letter/${id}/replay`, { method: 'POST' });
export const processQueue = () => apiRequest<any>('/integrations/queue/process', { method: 'POST' });
export const enqueueNotification = (body: any) => apiRequest<any>('/integrations/queue/enqueue', { method: 'POST', body });
export const fetchWebhooks = (query: any = {}) => apiRequest<any>('/integrations/webhooks', { query });
export const fetchIntegrationAnalytics = () => apiRequest<any>('/integrations/analytics');
export const fetchDeviceTokens = () => apiRequest<any>('/integrations/device-tokens');
export const registerDeviceToken = (body: any) => apiRequest<any>('/integrations/device-tokens', { method: 'POST', body });