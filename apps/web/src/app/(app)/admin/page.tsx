'use client';
import { type ReactElement, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Layers, ScrollText, Shield, Users } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import { createAdminUser, createApiKey, createFleetGroup, deleteAdminUser, deleteFleetGroup, fetchAdminUsers, fetchApiKeys, fetchAuditLogs, fetchFleetGroups, fetchRoles, updateAdminUser } from '@/lib/admin-api';
import { fetchGpsFreshness, updateGpsFreshness } from '@/lib/track-api';

export default function AdminPage(): ReactElement {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'users'|'roles'|'audit'|'keys'|'groups'>('users');
  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => fetchAdminUsers({ page:1, pageSize:50 }), enabled: tab==='users' });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: fetchRoles, enabled: tab==='roles' });
  const auditQ = useQuery({ queryKey: ['audit'], queryFn: () => fetchAuditLogs({ page:1, pageSize:50 }), enabled: tab==='audit' });
  const keysQ = useQuery({ queryKey: ['api-keys'], queryFn: () => fetchApiKeys({ page:1, pageSize:50 }), enabled: tab==='keys' });
  const groupsQ = useQuery({ queryKey: ['fleet-groups'], queryFn: fetchFleetGroups, enabled: tab==='groups' });
  const freshnessQ = useQuery({ queryKey: ['gps-freshness'], queryFn: fetchGpsFreshness });
  const [freshnessInput, setFreshnessInput] = useState('');
  const saveFreshness = useMutation({ mutationFn: (m: number) => updateGpsFreshness(m), onSuccess: () => qc.invalidateQueries({ queryKey: ['gps-freshness'] }) });
  const createKey = useMutation({ mutationFn: () => createApiKey({ name: `API Key ${new Date().toLocaleString()}` }), onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }) });
  const users = usersQ.data?.data ?? [];
  const roles = Array.isArray(rolesQ.data) ? rolesQ.data : (rolesQ.data?.data ?? []);
  const audit = auditQ.data?.data ?? [];
  const keys = keysQ.data?.data ?? [];
  const groups = Array.isArray(groupsQ.data) ? groupsQ.data : (groupsQ.data?.data ?? []);
  const tabs: Array<{id: typeof tab; label: string; icon: any}> = [
    {id:'users', label:'Users', icon:<Users size={14}/>},
    {id:'roles', label:'Roles & Permissions', icon:<Shield size={14}/>},
    {id:'audit', label:'Audit Logs', icon:<ScrollText size={14}/>},
    {id:'keys', label:'API Keys', icon:<KeyRound size={14}/>},
    {id:'groups', label:'Fleet Groups', icon:<Layers size={14}/>},
  ];
  return (
    <PageLayout title="Administration" description="Organisation settings, roles, audit trail, API keys and fleet grouping." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Organisation' }, { label: 'Administration' }]}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Shield size={18} />} label="Roles" value={String(roles.length || '—')} unit="configured" />
        <KpiCard icon={<ScrollText size={18} />} label="Audit entries" value={String(auditQ.data?.meta?.total ?? (tab==='audit'?audit.length:'—'))} unit="recent scope" />
        <KpiCard icon={<KeyRound size={18} />} label="API keys" value={String(keysQ.data?.meta?.total ?? (tab==='keys'?keys.length:'—'))} unit="issued" />
        <KpiCard icon={<Layers size={18} />} label="Fleet groups" value={String(groups.length || '—')} unit="groups" />
      </div>
      <Card><CardHeader><CardTitle>GPS freshness threshold</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-center gap-3 text-sm"><span>Current: <b>{(freshnessQ.data as any)?.minutes ?? '—'}</b> minutes (default {(freshnessQ.data as any)?.defaultMinutes ?? 15})</span><input value={freshnessInput || String((freshnessQ.data as any)?.minutes ?? '')} onChange={(e)=>setFreshnessInput(e.target.value)} className="h-9 w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" /><Button variant="primary" size="sm" onClick={()=>{const n=Number(freshnessInput); if(Number.isFinite(n)&&n>=1&&n<=1440) saveFreshness.mutate(n);}} disabled={saveFreshness.isPending}>Save</Button></div><p className="mt-2 text-xs text-[var(--text-muted)]">Used for GPS stale/offline classification and nearby vehicle filtering.</p></CardContent></Card>
      <div className="flex flex-wrap gap-2">{tabs.map(t => <button key={t.id} onClick={()=>setTab(t.id)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tab===t.id?'border-teal-500 bg-teal-50 text-teal-800 [html[data-theme=dark]_&]:bg-teal-950/30 [html[data-theme=dark]_&]:text-teal-200':'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'}`}>{t.icon}{t.label}</button>)}</div>

      {tab==='users' ? <Card><CardHeader><CardTitle>Users</CardTitle></CardHeader><CardContent>{usersQ.isLoading?<LoadingPanel label="Loading users…"/>:users.length===0?<EmptyState title="No users" description="Create users to grant access to the platform."/>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Last login</th><th className="px-3 py-2">Actions</th></tr></thead><tbody>{users.map((u:any)=>(<tr key={u.id} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-medium">{u.name}</td><td className="px-3 py-2">{u.email}</td><td className="px-3 py-2">{u.role_name||u.roleName||'—'}</td><td className="px-3 py-2"><Badge variant={u.status==='active'?'success':u.status==='suspended'?'critical':'neutral'}>{u.status}</Badge></td><td className="px-3 py-2">{u.last_login_at?new Date(u.last_login_at).toLocaleString():'—'}</td><td className="px-3 py-2"><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={()=>updateAdminUser(u.id,{status:u.status==='active'?'suspended':'active'}).then(()=>usersQ.refetch())}>{u.status==='active'?'Suspend':'Activate'}</Button><Button variant="danger" size="sm" onClick={()=>{if(confirm('Delete user?')) deleteAdminUser(u.id).then(()=>usersQ.refetch());}}>Delete</Button></div></td></tr>))}</tbody></table></div>}</CardContent></Card> : null}

      {tab==='roles' ? <Card><CardHeader><CardTitle>Roles</CardTitle></CardHeader><CardContent>{rolesQ.isLoading?<LoadingPanel label="Loading roles…"/>:roles.length===0?<EmptyState title="No roles" description="Roles and permissions will appear here when configured."/>:<div className="space-y-2">{roles.map((r:any)=><div key={r.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"><div><div className="font-medium">{r.name}</div><div className="text-xs text-[var(--text-muted)]">{r.description || 'Role permissions managed by backend policy.'}</div></div><Badge variant={r.is_system?'info':'neutral'}>{r.is_system?'System':'Custom'}</Badge></div>)}</div>}</CardContent></Card> : null}

      {tab==='audit' ? <Card><CardHeader><CardTitle>Audit log</CardTitle></CardHeader><CardContent>{auditQ.isLoading?<LoadingPanel label="Loading audit logs…"/>:audit.length===0?<EmptyState title="No audit entries" description="Administrative and security-relevant actions will be recorded here."/>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">User</th></tr></thead><tbody>{audit.map((a:any,i:number)=><tr key={a.id||i} className="border-t border-[var(--border)]"><td className="px-3 py-2">{a.created_at?new Date(a.created_at).toLocaleString():a.createdAt?new Date(a.createdAt).toLocaleString():'—'}</td><td className="px-3 py-2 font-medium">{a.action}</td><td className="px-3 py-2">{a.entity_type||a.entityType} {a.entity_id||a.entityId||''}</td><td className="px-3 py-2">{a.user_id||a.userId||'—'}</td></tr>)}</tbody></table></div>}</CardContent></Card> : null}

      {tab==='keys' ? <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>API keys</CardTitle><Button variant="primary" size="sm" disabled={createKey.isPending} onClick={()=>createKey.mutate()}>{createKey.isPending?'Creating…':'Create key'}</Button></CardHeader><CardContent>{keysQ.isLoading?<LoadingPanel label="Loading API keys…"/>:keys.length===0?<EmptyState title="No API keys" description="Create API keys for integrations and device ingestion." action={<Button variant="primary" size="sm" onClick={()=>createKey.mutate()}>Create key</Button>}/>:<div className="space-y-2">{keys.map((k:any)=><div key={k.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"><div><div className="font-medium">{k.name||'API Key'}</div><div className="text-xs text-[var(--text-muted)]">{k.prefix||k.key_prefix||k.id} · Created {k.created_at?new Date(k.created_at).toLocaleString():'—'}</div></div><Badge variant={k.revoked_at?'critical':'success'}>{k.revoked_at?'Revoked':'Active'}</Badge></div>)}</div>}</CardContent></Card> : null}

      {tab==='groups' ? <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Fleet groups</CardTitle><Button variant="primary" size="sm" onClick={async()=>{const name=prompt('Group name'); if(name){await createFleetGroup({name}); groupsQ.refetch();}}}>Create group</Button></CardHeader><CardContent>{groupsQ.isLoading?<LoadingPanel label="Loading fleet groups…"/>:groups.length===0?<EmptyState title="No fleet groups" description="Fleet groups help organise vehicles and access scope." action={<Button variant="primary" size="sm" onClick={async()=>{const name=prompt('Group name'); if(name){await createFleetGroup({name}); groupsQ.refetch();}}}>Create group</Button>}/>:<div className="grid gap-2 md:grid-cols-2">{groups.map((g:any)=><div key={g.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex items-center justify-between"><div className="font-medium">{g.name}</div><Button variant="danger" size="sm" onClick={async()=>{ try { if(!confirm('Delete group?')) return; await deleteFleetGroup(g.id); qc.invalidateQueries({ queryKey: ['fleet-groups'] }); } catch(e:any){ alert(e?.message || 'Delete failed'); } }}>Delete</Button></div><div className="text-xs text-[var(--text-muted)]">{g.description||'No description'} · Vehicles: {g.vehicle_count ?? '—'}</div></div>)}</div>}</CardContent></Card> : null}
    </PageLayout>
  );
}
