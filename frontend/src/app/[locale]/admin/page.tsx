'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { confirmAction } from '@/lib/confirm';
import { Modal } from '@/components/Modal';

type Me = { role: string };
type PendingProfile = {
  userId: string;
  user: { id: string; name: string; email: string; studentId?: string | null };
  reviewStatus: string;
};
type AdminOrg = {
  id: string;
  nameZh: string;
  typeZh: string;
  createdAt: string;
  leader?: { name?: string; email?: string; studentId?: string | null } | null;
  _count?: { members: number };
};
type OrgDetail = {
  id: string;
  nameZh: string;
  descriptionZh?: string;
  leader?: { id: string; name: string; email: string; studentId?: string | null } | null;
  members: Array<{
    userId: string;
    memberRole: string;
    roleZh: string;
    user: { id: string; name: string; email: string; studentId?: string | null };
  }>;
  _count?: { members: number };
};
type UserOption = { id: string; name?: string; email?: string; studentId?: string | null };

export default function AdminPage() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const token = getToken();
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [reviewTarget, setReviewTarget] = useState<PendingProfile | null>(null);
  const [orgTarget, setOrgTarget] = useState<OrgDetail | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRoleZh, setAddMemberRoleZh] = useState('成员');
  const [deleteConfirmOrg, setDeleteConfirmOrg] = useState<AdminOrg | null>(null);
  const [operatorName, setOperatorName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);
      if (m.role !== 'LEAGUE_ADMIN') {
        setPending([]);
        setOrgs([]);
        return;
      }
      const [pendingList, orgList, userList] = await Promise.all([
        apiFetch<PendingProfile[]>('/profile/admin/pending', { token }),
        apiFetch<AdminOrg[]>('/organizations/admin/list', { token }),
        apiFetch<UserOption[]>('/users', { token }),
      ]);
      setPending(Array.isArray(pendingList) ? pendingList : []);
      setOrgs(Array.isArray(orgList) ? orgList : []);
      setUsers(Array.isArray(userList) ? userList : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(userId: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? '确认通过该档案审核吗？' : '确认驳回该档案审核吗？')) return;
    await apiFetch(`/profile/admin/${userId}/review`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ approve, reason: approve ? undefined : reason[userId] || 'Rejected' }),
    });
    setReviewTarget(null);
    load();
  }

  async function openOrgDetail(id: string) {
    if (!token) return;
    try {
      const detail = await apiFetch<OrgDetail>(`/organizations/${id}/detail`, { token });
      setOrgTarget(detail);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function addMember() {
    if (!token || !orgTarget || !addMemberUserId) return;
    if (!confirmAction('确认添加该成员到组织吗？')) return;
    try {
      const detail = await apiFetch<OrgDetail>(`/organizations/${orgTarget.id}/members`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          userId: addMemberUserId,
          roleZh: addMemberRoleZh,
          memberRole: addMemberRoleZh.includes('负责') ? 'ORG_ADMIN' : 'MEMBER',
        }),
      });
      setOrgTarget(detail);
      setAddMemberUserId('');
      setAddMemberRoleZh('成员');
      await load();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function removeMember(userId: string) {
    if (!token || !orgTarget) return;
    if (!confirmAction('确认从组织中移除该成员吗？')) return;
    try {
      const detail = await apiFetch<OrgDetail>(`/organizations/${orgTarget.id}/members/${userId}`, {
        method: 'DELETE',
        token,
      });
      setOrgTarget(detail);
      await load();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function removeOrg() {
    if (!token || !deleteConfirmOrg) return;
    if (!confirmAction(`确认删除组织「${deleteConfirmOrg.nameZh}」吗？`)) return;
    try {
      await apiFetch(`/organizations/${deleteConfirmOrg.id}`, {
        method: 'DELETE',
        token,
        body: JSON.stringify({ operatorName }),
      });
      setDeleteConfirmOrg(null);
      setOperatorName('');
      setOrgTarget(null);
      await load();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  if (!token) {
    return (
      <p>
        <Link href="/">Login</Link>
      </p>
    );
  }

  if (me && me.role !== 'LEAGUE_ADMIN') {
    return <p>League admin only. Current role: {me.role}</p>;
  }

  return (
    <div className="page-container">
      <div className="page-card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>
              团委后台
            </h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              集中处理档案审核与组织管理。
            </p>
          </div>
          <button type="button" onClick={load}>
            {tc('refresh')}
          </button>
        </div>
        {err && <div style={{ color: 'crimson' }}>{err}</div>}

        <section className="card-soft">
          <h3 style={{ marginBottom: 12 }}>待审核档案（{pending.length}）</h3>
          <ul className="list-clean">
            {pending.map((row) => (
              <li key={row.userId} className="list-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span>
                    {row.user.name} · {row.user.studentId ?? '—'}
                  </span>
                  <button type="button" onClick={() => setReviewTarget(row)}>
                    查看详情
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-soft">
          <h3 style={{ marginBottom: 12 }}>组织管理（{orgs.length}）</h3>
          <ul className="list-clean">
            {orgs.map((org) => (
              <li key={org.id} className="list-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>
                    {org.nameZh} · {org.typeZh} · 人数 {org._count?.members ?? 0}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => openOrgDetail(org.id)}>
                      管理
                    </button>
                    <button type="button" className="logout-btn" onClick={() => setDeleteConfirmOrg(org)}>
                      删除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p>
          团委任务入口：<Link href="/tasks">/tasks</Link>
        </p>
      </div>

      <Modal
        open={!!reviewTarget}
        title="档案审核详情"
        onClose={() => setReviewTarget(null)}
        width={720}
      >
        {reviewTarget ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <strong>{reviewTarget.user.name}</strong> · {reviewTarget.user.email} ·{' '}
              {reviewTarget.user.studentId ?? '—'}
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>驳回原因（可选）</span>
              <input
                value={reason[reviewTarget.userId] ?? ''}
                onChange={(e) => setReason((s) => ({ ...s, [reviewTarget.userId]: e.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => review(reviewTarget.userId, true)}>
                {tc('approve')}
              </button>
              <button type="button" className="logout-btn" onClick={() => review(reviewTarget.userId, false)}>
                {tc('reject')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!orgTarget}
        title={orgTarget ? `组织详情：${orgTarget.nameZh}` : '组织详情'}
        onClose={() => setOrgTarget(null)}
        width={860}
      >
        {orgTarget ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="topbar-muted">
              简介：{orgTarget.descriptionZh || '—'} · 成员数：{orgTarget._count?.members ?? orgTarget.members.length}
            </div>
            <div className="topbar-muted">
              负责人：{orgTarget.leader?.name || orgTarget.leader?.email || '未设置'}
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>成员列表</h4>
              <ul className="list-clean">
                {orgTarget.members.map((m) => (
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
            </div>
            <div className="card-soft" style={{ display: 'grid', gap: 10 }}>
              <h4 style={{ marginBottom: 0 }}>添加成员</h4>
              <select value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)}>
                <option value="">选择用户</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email || u.id} · {u.studentId ?? '—'}
                  </option>
                ))}
              </select>
              <input
                value={addMemberRoleZh}
                onChange={(e) => setAddMemberRoleZh(e.target.value)}
                placeholder="组织内角色（如 成员/负责人）"
              />
              <button type="button" onClick={addMember}>
                添加到组织
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!deleteConfirmOrg}
        title="删除组织确认"
        onClose={() => setDeleteConfirmOrg(null)}
        width={620}
      >
        {deleteConfirmOrg ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              将删除组织：<strong>{deleteConfirmOrg.nameZh}</strong>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>请输入操作者名称确认</span>
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
