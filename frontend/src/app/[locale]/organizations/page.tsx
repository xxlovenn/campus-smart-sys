'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { Modal } from '@/components/Modal';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

type Org = {
  id: string;
  nameZh: string;
  nameEn: string;
  nameRu: string;
  typeZh: string;
  typeEn: string;
  typeRu: string;
  descriptionZh?: string;
  descriptionEn?: string;
  descriptionRu?: string;
  logoUrl?: string | null;
  leader?: { id: string; name?: string; email?: string; studentId?: string | null } | null;
  adminAccount?: string | null;
  adminPassword?: string | null;
  status?: 'ACTIVE' | 'PAUSED';
  statusChangedAt?: string | null;
  _count?: { members: number };
};
type Me = { role: string; managedOrgIds?: string[] };
type SearchMode = 'name' | 'studentId' | 'idCard';
type LeaderCandidate = {
  id: string;
  name: string;
  email: string;
  studentId?: string | null;
  idCardMasked?: string | null;
};
type OrgDetail = {
  id: string;
  nameZh: string;
  nameEn: string;
  nameRu: string;
  typeZh: string;
  typeEn: string;
  typeRu: string;
  descriptionZh?: string;
  descriptionEn?: string;
  descriptionRu?: string;
  logoUrl?: string | null;
  leader?: { id: string; name?: string; email?: string; studentId?: string | null } | null;
  adminAccount?: string | null;
  adminPassword?: string | null;
  status?: 'ACTIVE' | 'PAUSED';
  statusChangedAt?: string | null;
  members: Array<{
    userId: string;
    roleZh: string;
    user: { id: string; name: string; email: string; studentId?: string | null };
  }>;
};
type OrgChangeLog = {
  id: string;
  action: string;
  detailZh?: string;
  detailEn?: string;
  detailRu?: string;
  createdAt?: string;
  actor?: { name?: string; email?: string } | null;
};
type CreatedCredential = {
  orgName: string;
  account: string;
  password: string;
};

export default function OrgsPage() {
  const t = useTranslations('orgs');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: '',
    logoUrl: '',
    leaderUserId: '',
  });
  const [leaderSearchMode, setLeaderSearchMode] = useState<SearchMode>('name');
  const [leaderKeyword, setLeaderKeyword] = useState('');
  const [leaderCandidates, setLeaderCandidates] = useState<LeaderCandidate[]>([]);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    type: '',
    description: '',
    logoUrl: '',
    leaderUserId: '',
  });
  const [editLeaderMode, setEditLeaderMode] = useState<SearchMode>('name');
  const [editLeaderKeyword, setEditLeaderKeyword] = useState('');
  const [editLeaderCandidates, setEditLeaderCandidates] = useState<LeaderCandidate[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Org | null>(null);
  const [operatorName, setOperatorName] = useState('');
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRoleZh, setAddMemberRoleZh] = useState('成员');
  const [memberSearchMode, setMemberSearchMode] = useState<SearchMode>('name');
  const [memberKeyword, setMemberKeyword] = useState('');
  const [memberCandidates, setMemberCandidates] = useState<LeaderCandidate[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [credEdit, setCredEdit] = useState<Record<string, { account: string; password: string }>>({});
  const [createdCredential, setCreatedCredential] = useState<CreatedCredential | null>(null);
  const [orgLogs, setOrgLogs] = useState<OrgChangeLog[]>([]);

  const isLeagueAdmin = me?.role === 'LEAGUE_ADMIN';
  const isOrgAdmin = !isLeagueAdmin && (me?.managedOrgIds ?? []).length > 0;
  const allowedModes: SearchMode[] = isLeagueAdmin ? ['name', 'studentId', 'idCard'] : ['name', 'studentId'];
  const canManageOrg = (orgId: string) =>
    isLeagueAdmin || (me?.managedOrgIds ?? []).includes(orgId);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);
      const list = await apiFetch<Org[]>(
        m.role === 'LEAGUE_ADMIN' ? '/organizations/admin/list' : '/organizations',
        { token },
      );
      setOrgs(Array.isArray(list) ? list : []);
      if (m.role !== 'LEAGUE_ADMIN') setLeaderCandidates([]);
      if (m.role !== 'LEAGUE_ADMIN') setCreatedCredential(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!form.name.trim() || !form.type.trim()) {
      setErr('请填写组织名称和组织类型');
      return;
    }
    if (!confirmAction('确认新建该组织吗？')) return;
    try {
      const created = await apiFetch<Org>('/organizations', {
        method: 'POST',
        token,
        body: JSON.stringify({
          nameZh: form.name.trim(),
          nameEn: form.name.trim(),
          nameRu: form.name.trim(),
          descriptionZh: form.description.trim(),
          descriptionEn: form.description.trim(),
          descriptionRu: form.description.trim(),
          typeZh: form.type.trim(),
          typeEn: form.type.trim(),
          typeRu: form.type.trim(),
          logoUrl: form.logoUrl.trim() || undefined,
          leaderUserId: form.leaderUserId || undefined,
        }),
      });
      setCreatedCredential({
        orgName: created.nameZh || form.name.trim(),
        account: created.adminAccount || '—',
        password: created.adminPassword || '—',
      });
      setForm({
        name: '',
        description: '',
        type: '',
        logoUrl: '',
        leaderUserId: '',
      });
      setLeaderKeyword('');
      setLeaderCandidates([]);
      setErr(null);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function searchLeader() {
    if (!token) return;
    try {
      const list = await apiFetch<LeaderCandidate[]>(
        `/profile/admin/students?keyword=${encodeURIComponent(leaderKeyword)}&mode=${leaderSearchMode}`,
        { token },
      );
      setLeaderCandidates(Array.isArray(list) ? list : []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function openDetail(id: string) {
    if (!token) return;
    try {
      const d = await apiFetch<OrgDetail>(`/organizations/${id}/detail`, { token });
      setDetail(d);
      setEditForm({
        name: d.nameZh || '',
        type: d.typeZh || '',
        description: d.descriptionZh || '',
        logoUrl: d.logoUrl || '',
        leaderUserId: d.leader?.id || '',
      });
      setEditLeaderKeyword('');
      setEditLeaderCandidates([]);
      setMemberKeyword('');
      setMemberCandidates([]);
      setAddMemberUserId('');
      setCredEdit((prev) => ({
        ...prev,
        [id]: {
          account: d.adminAccount || '',
          password: d.adminPassword || '',
        },
      }));
      const logs = await apiFetch<OrgChangeLog[]>(`/organizations/${id}/change-logs?limit=20`, { token });
      setOrgLogs(Array.isArray(logs) ? logs : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function updateOrgStatus(status: 'ACTIVE' | 'PAUSED') {
    if (!token || !detail) return;
    const isPause = status === 'PAUSED';
    if (!confirmAction(isPause ? '确认暂停该组织吗？' : '确认启用该组织吗？')) return;
    try {
      const d = await apiFetch<OrgDetail>(`/organizations/${detail.id}/status`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      });
      setDetail(d);
      const logs = await apiFetch<OrgChangeLog[]>(`/organizations/${detail.id}/change-logs?limit=20`, { token });
      setOrgLogs(Array.isArray(logs) ? logs : []);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function searchEditLeader() {
    if (!token) return;
    try {
      const list = await apiFetch<LeaderCandidate[]>(
        `/profile/admin/students?keyword=${encodeURIComponent(editLeaderKeyword)}&mode=${editLeaderMode}`,
        { token },
      );
      setEditLeaderCandidates(Array.isArray(list) ? list : []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function saveOrgInfo() {
    if (!token || !detail) return;
    if (!editForm.name.trim() || !editForm.type.trim()) {
      setErr('请填写组织名称和组织类型');
      return;
    }
    if (!confirmAction('确认保存组织信息修改吗？')) return;
    try {
      const d = await apiFetch<OrgDetail>(`/organizations/${detail.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          nameZh: editForm.name.trim(),
          nameEn: editForm.name.trim(),
          nameRu: editForm.name.trim(),
          descriptionZh: editForm.description.trim(),
          descriptionEn: editForm.description.trim(),
          descriptionRu: editForm.description.trim(),
          typeZh: editForm.type.trim(),
          typeEn: editForm.type.trim(),
          typeRu: editForm.type.trim(),
          logoUrl: editForm.logoUrl.trim() || undefined,
          leaderUserId: editForm.leaderUserId || undefined,
        }),
      });
      setDetail(d);
      await load();
      if (detail) {
        const logs = await apiFetch<OrgChangeLog[]>(`/organizations/${detail.id}/change-logs?limit=20`, { token });
        setOrgLogs(Array.isArray(logs) ? logs : []);
      }
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function addMember() {
    if (!token || !detail || !addMemberUserId) return;
    if (!confirmAction('确认添加该成员到组织吗？')) return;
    try {
      const d = await apiFetch<OrgDetail>(`/organizations/${detail.id}/members`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          userId: addMemberUserId,
          roleZh: addMemberRoleZh,
          memberRole: addMemberRoleZh.includes('负责') ? 'ORG_ADMIN' : 'MEMBER',
        }),
      });
      setDetail(d);
      setAddMemberUserId('');
      setAddMemberRoleZh('成员');
      load();
      if (detail) {
        const logs = await apiFetch<OrgChangeLog[]>(`/organizations/${detail.id}/change-logs?limit=20`, { token });
        setOrgLogs(Array.isArray(logs) ? logs : []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function searchMembers() {
    if (!token) return;
    try {
      const list = await apiFetch<LeaderCandidate[]>(
        `/profile/admin/students?keyword=${encodeURIComponent(memberKeyword)}&mode=${memberSearchMode}`,
        { token },
      );
      setMemberCandidates(Array.isArray(list) ? list : []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function removeMember(userId: string) {
    if (!token || !detail) return;
    if (!confirmAction('确认移除该成员吗？')) return;
    try {
      const d = await apiFetch<OrgDetail>(`/organizations/${detail.id}/members/${userId}`, {
        method: 'DELETE',
        token,
      });
      setDetail(d);
      load();
      if (detail) {
        const logs = await apiFetch<OrgChangeLog[]>(`/organizations/${detail.id}/change-logs?limit=20`, { token });
        setOrgLogs(Array.isArray(logs) ? logs : []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function removeOrg() {
    if (!token || !deleteTarget || !operatorName.trim()) return;
    if (!confirmAction(`确认删除组织「${deleteTarget.nameZh}」吗？此操作不可恢复。`)) return;
    try {
      await apiFetch(`/organizations/${deleteTarget.id}`, {
        method: 'DELETE',
        token,
        body: JSON.stringify({ operatorName }),
      });
      setDeleteTarget(null);
      setOperatorName('');
      setDetail(null);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function saveCredential(orgId: string) {
    if (!token || !isLeagueAdmin) return;
    const row = credEdit[orgId];
    if (!row?.account?.trim() || !row?.password?.trim()) {
      setErr('请填写账号和密码');
      return;
    }
    if (!confirmAction('确认修改该组织账号和密码吗？')) return;
    try {
      await apiFetch(`/organizations/${orgId}/credential`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          account: row.account.trim(),
          password: row.password.trim(),
        }),
      });
      await load();
      if (detail?.id === orgId) await openDetail(orgId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  if (!ready || !token) {
    return (
      <div className="page-card">
        <p className="page-subtitle">正在校验登录状态...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>
              {isLeagueAdmin ? '组织管理' : isOrgAdmin ? '本组织管理' : '我的组织'}
            </h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              {isLeagueAdmin
                ? '团委端可在此新建组织、设置负责人并维护成员。'
                : isOrgAdmin
                ? '社团端可在此管理自己负责的组织信息与成员。'
                : '学生端可查看所属组织信息与组织账号公告。'}
            </p>
          </div>
          <button type="button" onClick={load}>
            {tc('refresh')}
          </button>
        </div>
        {err && <div style={{ color: 'crimson' }}>{err}</div>}

      {isLeagueAdmin && (
        <form onSubmit={onCreate} className="card-soft" style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
          <h3 style={{ marginBottom: 2 }}>{t('new')}</h3>
          <p className="topbar-muted" style={{ marginBottom: 2 }}>
            仅需填写一套信息，系统会自动同步到三语言字段。
          </p>
          <input
            placeholder="组织名称（自动同步 EN/RU）"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            required
          />
          <input
            placeholder="组织类型（自动同步 EN/RU）"
            value={form.type}
            onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
            required
          />
          <textarea
            placeholder="组织简介（自动同步 EN/RU）"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
          />
          <input
            placeholder="组织 Logo URL（可选）"
            value={form.logoUrl}
            onChange={(e) => setForm((s) => ({ ...s, logoUrl: e.target.value }))}
          />

          <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>负责人选择（档案式检索）</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={leaderSearchMode}
                onChange={(e) => setLeaderSearchMode(e.target.value as SearchMode)}
                style={{ maxWidth: 160 }}
              >
                <option value="name">姓名</option>
                <option value="studentId">学号</option>
                {allowedModes.includes('idCard') ? <option value="idCard">身份证</option> : null}
              </select>
              <input
                placeholder="输入关键词检索负责人"
                value={leaderKeyword}
                onChange={(e) => setLeaderKeyword(e.target.value)}
                style={{ flex: 1, minWidth: 260 }}
              />
              <button type="button" onClick={searchLeader}>
                查询
              </button>
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflow: 'auto' }}>
              {leaderCandidates.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '8px 10px',
                  }}
                >
                  <input
                    type="radio"
                    name="leader"
                    checked={form.leaderUserId === c.id}
                    onChange={() => setForm((s) => ({ ...s, leaderUserId: c.id }))}
                    style={{ width: 16 }}
                  />
                  <span>
                    {c.name} · {c.studentId ?? '—'}
                    {isLeagueAdmin ? ` · ${c.idCardMasked ?? '—'}` : ''}
                  </span>
                </label>
              ))}
            </div>
            {form.leaderUserId ? (
              <button
                type="button"
                className="modal-close"
                onClick={() => setForm((s) => ({ ...s, leaderUserId: '' }))}
                style={{ width: 'fit-content' }}
              >
                清除负责人
              </button>
            ) : null}
          </div>

          <button type="submit">{tc('create')}</button>
        </form>
      )}

      {isLeagueAdmin && createdCredential ? (
        <div className="card-soft" style={{ display: 'grid', gap: 6 }}>
          <h4 style={{ margin: 0 }}>新建组织账号已生成</h4>
          <div className="topbar-muted">组织：{createdCredential.orgName}</div>
          <div className="topbar-muted">账号：{createdCredential.account}</div>
          <div className="topbar-muted">密码：{createdCredential.password}</div>
        </div>
      ) : null}

        <section className="card-soft" style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>组织概览</h3>
          <ul className="list-clean">
            {orgs.map((o) => (
              <li key={o.id} className="list-item">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    {o.logoUrl ? (
                      <img
                        src={o.logoUrl}
                        alt={triField(o as unknown as Record<string, unknown>, 'name', locale)}
                        style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border)', objectFit: 'cover' }}
                      />
                    ) : null}
                    <strong>{triField(o as unknown as Record<string, unknown>, 'name', locale)}</strong>
                    <span className="topbar-muted">
                      {triField(o as unknown as Record<string, unknown>, 'type', locale)}
                      {typeof o._count?.members === 'number' ? ` · 成员 ${o._count.members}` : ''}
                    </span>
                    <span className={`badge ${o.status === 'PAUSED' ? 'badge-red' : 'badge-green'}`}>
                      {o.status === 'PAUSED' ? t('statusPaused') : t('statusActive')}
                    </span>
                    {isLeagueAdmin ? (
                      <span className="topbar-muted">
                        账号：{o.adminAccount || '—'} · 密码：{o.adminPassword || '—'}
                      </span>
                    ) : null}
                  </div>
                  {canManageOrg(o.id) ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => openDetail(o.id)}>
                        管理
                      </button>
                      {isLeagueAdmin ? (
                        <button type="button" className="logout-btn" onClick={() => setDeleteTarget(o)}>
                          删除
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {detail ? (
        <div className="page-card" style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>组织管理：{detail.nameZh}</h3>
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                setDetail(null);
                setEditLeaderCandidates([]);
              }}
            >
              收起
            </button>
          </div>
          <div className="card-soft" style={{ display: 'grid', gap: 10 }}>
            <h4 style={{ margin: 0 }}>编辑组织信息</h4>
            <p className="topbar-muted" style={{ margin: 0 }}>
              单端输入后将自动同步至三语言字段。
            </p>
            <input
              placeholder="组织名称（自动同步 EN/RU）"
              value={editForm.name}
              onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
            />
            <input
              placeholder="组织类型（自动同步 EN/RU）"
              value={editForm.type}
              onChange={(e) => setEditForm((s) => ({ ...s, type: e.target.value }))}
            />
            <textarea
              placeholder="组织简介（自动同步 EN/RU）"
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm((s) => ({ ...s, description: e.target.value }))}
            />
            <input
              placeholder="组织 Logo URL（可选）"
              value={editForm.logoUrl}
              onChange={(e) => setEditForm((s) => ({ ...s, logoUrl: e.target.value }))}
            />
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <h4 style={{ margin: 0 }}>负责人选择（档案式检索）</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={editLeaderMode}
                  onChange={(e) => setEditLeaderMode(e.target.value as SearchMode)}
                  style={{ maxWidth: 160 }}
                >
                  <option value="name">姓名</option>
                  <option value="studentId">学号</option>
                  {allowedModes.includes('idCard') ? <option value="idCard">身份证</option> : null}
                </select>
                <input
                  placeholder="输入关键词检索负责人"
                  value={editLeaderKeyword}
                  onChange={(e) => setEditLeaderKeyword(e.target.value)}
                  style={{ flex: 1, minWidth: 260 }}
                />
                <button type="button" onClick={searchEditLeader}>
                  查询
                </button>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflow: 'auto' }}>
                {editLeaderCandidates.map((c) => (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '8px 10px',
                    }}
                  >
                    <input
                      type="radio"
                      name="editLeader"
                      checked={editForm.leaderUserId === c.id}
                      onChange={() => setEditForm((s) => ({ ...s, leaderUserId: c.id }))}
                      style={{ width: 16 }}
                    />
                    <span>
                      {c.name} · {c.studentId ?? '—'}
                      {isLeagueAdmin ? ` · ${c.idCardMasked ?? '—'}` : ''}
                    </span>
                  </label>
                ))}
              </div>
              {editForm.leaderUserId ? (
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setEditForm((s) => ({ ...s, leaderUserId: '' }))}
                  style={{ width: 'fit-content' }}
                >
                  清除负责人
                </button>
              ) : null}
            </div>
            <button type="button" onClick={saveOrgInfo}>
              保存组织信息
            </button>
          </div>
          <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>{t('statusTitle')}</h4>
            <div className="topbar-muted">
              当前状态：
              <strong style={{ marginLeft: 6 }}>
                {detail.status === 'PAUSED' ? t('statusPaused') : t('statusActive')}
              </strong>
              {detail.statusChangedAt ? ` · 最近变更：${new Date(detail.statusChangedAt).toLocaleString()}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => updateOrgStatus('ACTIVE')}
                disabled={detail.status === 'ACTIVE'}
              >
                {t('enableOrg')}
              </button>
              <button
                type="button"
                className="logout-btn"
                onClick={() => updateOrgStatus('PAUSED')}
                disabled={detail.status === 'PAUSED'}
              >
                {t('pauseOrg')}
              </button>
            </div>
          </div>
          <div className="topbar-muted">简介：{detail.descriptionZh || '—'}</div>
          {isLeagueAdmin ? (
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <h4 style={{ margin: 0 }}>组织账号管理</h4>
              <input
                placeholder="组织账号"
                value={credEdit[detail.id]?.account ?? detail.adminAccount ?? ''}
                onChange={(e) =>
                  setCredEdit((s) => ({
                    ...s,
                    [detail.id]: { account: e.target.value, password: s[detail.id]?.password ?? detail.adminPassword ?? '' },
                  }))
                }
              />
              <input
                placeholder="组织密码"
                value={credEdit[detail.id]?.password ?? detail.adminPassword ?? ''}
                onChange={(e) =>
                  setCredEdit((s) => ({
                    ...s,
                    [detail.id]: { account: s[detail.id]?.account ?? detail.adminAccount ?? '', password: e.target.value },
                  }))
                }
              />
              <button type="button" onClick={() => saveCredential(detail.id)}>
                保存账号密码
              </button>
            </div>
          ) : null}
          <h4 style={{ margin: 0 }}>成员管理</h4>
          <ul className="list-clean">
            {detail.members.map((m) => (
              <li key={m.userId} className="list-item" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {m.user.name} · {m.user.studentId ?? '—'} · {m.roleZh}
                </span>
                <button type="button" className="logout-btn" onClick={() => removeMember(m.userId)}>
                  移除
                </button>
              </li>
            ))}
          </ul>
          <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>添加成员</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={memberSearchMode}
                onChange={(e) => setMemberSearchMode(e.target.value as SearchMode)}
                style={{ maxWidth: 160 }}
              >
                <option value="name">姓名</option>
                <option value="studentId">学号</option>
                {allowedModes.includes('idCard') ? <option value="idCard">身份证</option> : null}
              </select>
              <input
                placeholder="输入关键词检索成员"
                value={memberKeyword}
                onChange={(e) => setMemberKeyword(e.target.value)}
                style={{ flex: 1, minWidth: 260 }}
              />
              <button type="button" onClick={searchMembers}>
                查询
              </button>
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflow: 'auto' }}>
              {memberCandidates.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '8px 10px',
                  }}
                >
                  <input
                    type="radio"
                    name="member"
                    checked={addMemberUserId === c.id}
                    onChange={() => setAddMemberUserId(c.id)}
                    style={{ width: 16 }}
                  />
                  <span>
                    {c.name} · {c.studentId ?? '—'}
                  </span>
                </label>
              ))}
            </div>
            <input
              value={addMemberRoleZh}
              onChange={(e) => setAddMemberRoleZh(e.target.value)}
              placeholder="组织内身份（成员/负责人）"
            />
            <button type="button" onClick={addMember}>
              添加
            </button>
          </div>
          <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>{t('changeLogsTitle')}</h4>
            {orgLogs.length === 0 ? (
              <div className="topbar-muted">{t('changeLogsEmpty')}</div>
            ) : (
              <ul className="audit-timeline">
                {orgLogs.map((row) => (
                  <li key={row.id} className="audit-timeline-item">
                    <span className="audit-timeline-dot audit-timeline-dot-pending" />
                    <div className="audit-timeline-main">
                      <div className="audit-timeline-head">
                        <strong>{triField(row as unknown as Record<string, unknown>, 'detail', locale) || row.action}</strong>
                        <span className="topbar-muted">
                          {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="topbar-muted" style={{ fontSize: 12 }}>
                        {t('operator')}：{row.actor?.name || row.actor?.email || 'System'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <Modal
        open={!!deleteTarget}
        title="删除组织确认"
        onClose={() => setDeleteTarget(null)}
        width={620}
      >
        {deleteTarget ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              即将删除：<strong>{deleteTarget.nameZh}</strong>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>请输入操作者名称</span>
              <input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
            </label>
            <button
              type="button"
              className="logout-btn"
              disabled={!operatorName.trim()}
              onClick={removeOrg}
            >
              确认删除
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
