'use client';
import { type ReactElement, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Shield, Users } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, KpiCard, LoadingPanel, PageLayout, Select } from '@geoventra/ui';
import { createAdminUser, deleteAdminUser, fetchAdminUsers, fetchRoles } from '@/lib/admin-api';

export default function UsersPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', roleId: '', status: 'active' });
  const usersQ = useQuery({ queryKey: ['admin-users', search, status, page], queryFn: () => fetchAdminUsers({ search: search || undefined, status: status === 'all' ? undefined : status, page, pageSize: 25 }) });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });
  const roles = Array.isArray(rolesQ.data) ? rolesQ.data : (rolesQ.data?.data ?? []);
  const createMut = useMutation({ mutationFn: () => createAdminUser(form), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setOpen(false); setForm({ name: '', email: '', phone: '', password: '', roleId: '', status: 'active' }); } });
  const delMut = useMutation({ mutationFn: (id: string) => deleteAdminUser(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }) });
  const data = usersQ.data?.data ?? [];
  const meta = usersQ.data?.meta as any;
  return (
    <PageLayout title="Users & Access" description="Manage organisation users, roles and account status." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Organisation' }, { label: 'Users & Access' }]}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Users size={18} />} label="Users" value={String(meta?.total ?? data.length)} unit="total" />
        <KpiCard icon={<Shield size={18} />} label="Roles" value={String(roles.length)} unit="available" />
        <KpiCard icon={<Users size={18} />} label="Active" value={String(data.filter((u:any)=>u.status==='active').length)} unit="on page" tone="positive" />
        <KpiCard icon={<Users size={18} />} label="Suspended" value={String(data.filter((u:any)=>u.status==='suspended').length)} unit="on page" tone={data.some((u:any)=>u.status==='suspended')?'warning':'neutral'} />
      </div>
      <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative max-w-md flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /><input value={search} onChange={(e)=>{setSearch(e.target.value); setPage(1);}} placeholder="Search name or email…" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm outline-none" /></div>
          <Select aria-label="Status" value={status} onChange={(e)=>{setStatus(e.target.value); setPage(1);}} options={[{value:'all',label:'All statuses'},{value:'active',label:'Active'},{value:'invited',label:'Invited'},{value:'suspended',label:'Suspended'}]} />
        </div>
        <Button variant="primary" size="sm" onClick={()=>setOpen(v=>!v)}><Plus size={14}/> Add user</Button>
      </CardContent></Card>
      {open ? <Card><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Full name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Phone" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} />
        <input type="password" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Password (min 8 characters)" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} />
        <span className="text-xs text-[var(--text-muted)]">Password must be at least 8 characters long.</span>
        <Select aria-label="Role" value={form.roleId} onChange={(e)=>setForm({...form,roleId:e.target.value})} options={[{value:'',label:'Select role'}, ...roles.map((r:any)=>({value:r.id,label:r.name||r.label||r.id}))]} />
        <Select aria-label="Status" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} options={[{value:'active',label:'Active'},{value:'invited',label:'Invited'},{value:'suspended',label:'Suspended'}]} />
        <div className="md:col-span-3 flex gap-2"><Button variant="primary" size="sm" disabled={!form.name || !form.email || !form.password || !form.roleId || createMut.isPending} onClick={()=>createMut.mutate()}>{createMut.isPending?'Saving…':'Create user'}</Button><Button variant="secondary" size="sm" onClick={()=>setOpen(false)}>Cancel</Button>{createMut.isError ? <span className="text-sm text-red-600">{(createMut.error as any)?.message || 'Failed to create user.'} Please use a password with at least 8 characters.</span> : null}</div>
      </CardContent></Card> : null}
      {usersQ.isLoading ? <LoadingPanel label="Loading users…" /> : null}
      {!usersQ.isLoading && data.length===0 ? <EmptyState title="No users found" description="Add users and assign roles to manage access." icon={<Users size={28}/>} action={<Button variant="primary" size="sm" onClick={()=>setOpen(true)}><Plus size={14}/> Add user</Button>} /> : null}
      {data.length>0 ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last login</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>
        {data.map((u:any)=>(<tr key={u.id} className="border-t border-[var(--border)]"><td className="px-4 py-3"><div className="font-medium">{u.name}</div><div className="text-xs text-[var(--text-muted)]">{u.email}{u.phone?` · ${u.phone}`:''}</div></td><td className="px-4 py-3">{u.role_name||u.roleName||u.role_id||'—'}</td><td className="px-4 py-3"><Badge variant={u.status==='active'?'success':u.status==='suspended'?'critical':'warning'} dot>{u.status}</Badge></td><td className="px-4 py-3 text-[var(--text-secondary)]">{u.last_login_at?new Date(u.last_login_at).toLocaleString():'—'}</td><td className="px-4 py-3"><Button variant="danger" size="sm" disabled={delMut.isPending} onClick={()=>{if(confirm('Suspend/delete this user?')) delMut.mutate(u.id);}}>Remove</Button></td></tr>))}
      </tbody></table></div></CardContent></Card> : null}
    </PageLayout>
  );
}
