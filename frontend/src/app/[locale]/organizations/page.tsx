'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { Modal } from '@/components/Modal';
import { triField } from '@/lib/tri';

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
  leader?: { id: string; name?: string; email?: string; studentId?: string | null } | null;
  _count?: { members: number };
};
type Me = { role: string; managedOrgIds?: string[] };
type UserOption = { id: string; name?: string; email?: string; studentId?: string | null };
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
  leader?: { id: string; name?: string; email?: string; studentId?: string | null } | null;
  members: Array<{
    userId: string;
    roleZh: string;
    user: { id: string; name: string; email: string; studentId?: string | null };
  }>;
};

export default function OrgsPage() {
  const t = useTranslations('orgs');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = getToken();
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: '',
    leaderUserId: '',
  });
  const [leaderSearchMode, setLeaderSearchMode] = useState<'name' | 'studentId' | 'idCard'>('name');
  const [leaderKeyword, setLeaderKeyword] = useState('');
  const [leaderCandidates, setLeaderCandidates] = useState<LeaderCandidate[]>([]);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    type: '',
    description: '',
    leaderUserId: '',
  });
  const [editLeaderMode, setEditLeaderMode] = useState<'name' | 'studentId' | 'idCard'>('name');
  const [editLeaderKeyword, setEditLeaderKeyword] = useState('');
  const [editLeaderCandidates, setEditLeaderCandidates] = useState<LeaderCandidate[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Org | null>(null);
  const [operatorName, setOperatorName] = useState('');
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRoleZh, setAddMemberRoleZh] = useState('成员');
  const [err, setErr] = useState<string | null>(null);

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
      if (m.role === 'LEAGUE_ADMIN') {
        const userList = await apiFetch<UserOption[]>('/users', { token });
        setUsers(Array.isArray(userList) ? userList : []);
      } else {
        setUsers([]);
        setLeaderCandidates([]);
      }
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
    try {
      await apiFetch('/organizations', {
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
          leaderUserId: form.leaderUserId || undefined,
        }),
      });
      setForm({
        name: '',
        description: '',
        type: '',
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
        leaderUserId: d.leader?.id || '',
      });
      setEditLeaderKeyword('');
      setEditLeaderCandidates([]);
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
          leaderUserId: editForm.leaderUserId || undefined,
        }),
      });
      setDetail(d);
      await load();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function addMember() {
    if (!token || !detail || !addMemberUserId) return;
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function removeMember(userId: string) {
    if (!token || !detail) return;
    try {
      const d = await apiFetch<OrgDetail>(`/organizations/${detail.id}/members/${userId}`, {
        method: 'DELETE',
        token,
      });
      setDetail(d);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function removeOrg() {
    if (!token || !deleteTarget || !operatorName.trim()) return;
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

  if (!token) {
    return (
      <p>
        <Link href="/">Login</Link>
      </p>
    );
  }

  return (
    <div className="page-container">
      <div className="page-card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>
              {t('list')}
            </h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              团委端可在此新建组织、设置负责人并维护成员。
            </p>
          </div>
          <button type="button" onClick={load}>
            {tc('refresh')}
          </button>
        </div>
        {err && <div style={{ color: 'crimson' }}>{err}</div>}

      {me?.role === 'LEAGUE_ADMIN' && (
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

          <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>负责人选择（档案式检索）</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={leaderSearchMode}
                onChange={(e) =>
                  setLeaderSearchMode(e.target.value as 'name' | 'studentId' | 'idCard')
                }
                style={{ maxWidth: 160 }}
              >
                <option value="name">姓名</option>
                <option value="studentId">学号</option>
                <option value="idCard">身份证</option>
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
                    {c.name} · {c.studentId ?? '—'} · {c.idCardMasked ?? '—'}
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

        <section className="card-soft" style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>组织列表</h3>
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
                    <strong>{triField(o as unknown as Record<string, unknown>, 'name', locale)}</strong>
                    <span className="topbar-muted">
                      {triField(o as unknown as Record<string, unknown>, 'type', locale)}
                      {typeof o._count?.members === 'number' ? ` · 成员 ${o._count.members}` : ''}
                    </span>
                  </div>
                  {me?.role === 'LEAGUE_ADMIN' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => openDetail(o.id)}>
                        详情
                      </button>
                      <button type="button" className="logout-btn" onClick={() => setDeleteTarget(o)}>
                        删除
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Modal
        open={!!detail}
        title={detail ? `组织详情：${detail.nameZh}` : '组织详情'}
        onClose={() => {
          setDetail(null);
          setEditLeaderCandidates([]);
        }}
        width={860}
      >
        {detail ? (
          <div style={{ display: 'grid', gap: 12 }}>
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
              <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>负责人选择（档案式检索）</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={editLeaderMode}
                    onChange={(e) =>
                      setEditLeaderMode(e.target.value as 'name' | 'studentId' | 'idCard')
                    }
                    style={{ maxWidth: 160 }}
                  >
                    <option value="name">姓名</option>
                    <option value="studentId">学号</option>
                    <option value="idCard">身份证</option>
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
                        {c.name} · {c.studentId ?? '—'} · {c.idCardMasked ?? '—'}
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
            <div className="topbar-muted">简介：{detail.descriptionZh || '—'}</div>
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
                placeholder="组织内身份（成员/负责人）"
              />
              <button type="button" onClick={addMember}>
                添加
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

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
