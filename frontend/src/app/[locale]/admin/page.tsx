'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { Modal } from '@/components/Modal';
import { useAuthGuard } from '@/lib/use-auth-guard';

type Me = { role: string };
type PendingProfile = {
  userId: string;
  user: { id: string; name: string; email: string; studentId?: string | null };
  reviewStatus: string;
};
type TaskRequest = {
  id: string;
  titleZh?: string;
  titleEn?: string;
  titleRu?: string;
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  primaryOrg?: { nameZh?: string; nameEn?: string; nameRu?: string } | null;
  creator?: { name?: string; email?: string } | null;
};
type MetaOptions = {
  grades: Array<{ id: string; name: string }>;
  majors: Array<{ id: string; name: string }>;
};

export default function AdminPage() {
  const tc = useTranslations('common');
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([]);
  const [meta, setMeta] = useState<MetaOptions>({ grades: [], majors: [] });
  const [newGrade, setNewGrade] = useState('');
  const [newMajor, setNewMajor] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});
  const [taskRejectReason, setTaskRejectReason] = useState<Record<string, string>>({});
  const [reviewTarget, setReviewTarget] = useState<PendingProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);
      if (m.role !== 'LEAGUE_ADMIN') {
        setPending([]);
        setTaskRequests([]);
        return;
      }
      const [pendingList, requests, options] = await Promise.all([
        apiFetch<PendingProfile[]>('/profile/admin/pending', { token }),
        apiFetch<TaskRequest[]>('/tasks/admin/requests', { token }),
        apiFetch<MetaOptions>('/profile/admin/options', { token }),
      ]);
      setPending(Array.isArray(pendingList) ? pendingList : []);
      setTaskRequests(Array.isArray(requests) ? requests : []);
      setMeta({
        grades: Array.isArray(options?.grades) ? options.grades : [],
        majors: Array.isArray(options?.majors) ? options.majors : [],
      });
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

  async function reviewTaskRequest(taskId: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? '确认通过该活动申请吗？' : '确认驳回该活动申请吗？')) return;
    try {
      await apiFetch(`/tasks/admin/requests/${taskId}/review`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          approve,
          reason: approve ? undefined : taskRejectReason[taskId] || undefined,
        }),
      });
      setTaskRejectReason((s) => ({ ...s, [taskId]: '' }));
      await load();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function addGrade() {
    if (!token || !newGrade.trim()) return;
    if (!confirmAction('确认新增该年级吗？')) return;
    try {
      await apiFetch('/profile/admin/options/grades', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: newGrade.trim() }),
      });
      setNewGrade('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function addMajor() {
    if (!token || !newMajor.trim()) return;
    if (!confirmAction('确认新增该专业吗？')) return;
    try {
      await apiFetch('/profile/admin/options/majors', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: newMajor.trim() }),
      });
      setNewMajor('');
      await load();
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
              集中处理档案审核与活动申请审批。
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
          <h3 style={{ marginBottom: 12 }}>社团活动申请审核（{taskRequests.length}）</h3>
          <ul className="list-clean">
            {taskRequests.map((task) => (
              <li key={task.id} className="list-item">
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{task.titleZh || task.titleEn || task.titleRu || '—'}</strong>
                    <span className="badge badge-yellow">待审核</span>
                  </div>
                  <div className="topbar-muted">
                    申请组织：{task.primaryOrg?.nameZh || task.primaryOrg?.nameEn || task.primaryOrg?.nameRu || '—'} ·
                    申请人：{task.creator?.name || task.creator?.email || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      placeholder="驳回原因（可选）"
                      value={taskRejectReason[task.id] ?? ''}
                      onChange={(e) =>
                        setTaskRejectReason((s) => ({ ...s, [task.id]: e.target.value }))
                      }
                      style={{ flex: 1, minWidth: 240 }}
                    />
                    <button type="button" onClick={() => reviewTaskRequest(task.id, true)}>
                      通过
                    </button>
                    <button
                      type="button"
                      className="logout-btn"
                      onClick={() => reviewTaskRequest(task.id, false)}
                    >
                      驳回
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>年级与专业管理</h3>
          <div className="grid-two">
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>年级</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newGrade} onChange={(e) => setNewGrade(e.target.value)} placeholder="新增年级（如 2025）" />
                <button type="button" onClick={addGrade}>添加年级</button>
              </div>
              <div className="topbar-muted">{meta.grades.map((g) => g.name).join('、') || '暂无'}</div>
            </div>
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>专业</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newMajor} onChange={(e) => setNewMajor(e.target.value)} placeholder="新增专业（如 计算机科学）" />
                <button type="button" onClick={addMajor}>添加专业</button>
              </div>
              <div className="topbar-muted">{meta.majors.map((m) => m.name).join('、') || '暂无'}</div>
            </div>
          </div>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>团委任务模块</h3>
          <p className="topbar-muted" style={{ margin: 0 }}>
            进入任务中心，查看全局任务看板与审批流程。
          </p>
          <Link
            href="/tasks"
            style={{
              display: 'inline-block',
              width: 'fit-content',
              padding: '10px 14px',
              borderRadius: 10,
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            进入任务中心
          </Link>
        </section>
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
    </div>
  );
}
