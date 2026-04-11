'use client';

import { FormEvent, useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth-storage';
import { Modal } from '@/components/Modal';

type LoginResponse = {
  accessToken: string;
};

type RegisterResponse = {
  ok: boolean;
};

export default function LoginPage() {
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerErr, setRegisterErr] = useState('');
  const [registerMsg, setRegisterMsg] = useState('');

  function normalizeTail(value: string) {
    return value.trimEnd();
  }

  function parseApiErrorMessage(error: unknown, fallback: string) {
    if (!(error instanceof Error)) return fallback;
    let message = error.message || fallback;
    try {
      const parsed = JSON.parse(message) as { message?: string | string[] };
      if (Array.isArray(parsed?.message)) {
        message = parsed.message.join('；');
      } else if (typeof parsed?.message === 'string') {
        message = parsed.message;
      }
    } catch {
      // keep original plain text
    }

    if (message.includes('Invalid credentials')) return '账号或密码错误，请检查后重试。';
    if (message.includes('Account already exists')) return '该账号已注册，请直接登录。';
    if (message.includes('Password must be at least 6')) return '密码至少 6 位。';
    if (message.includes('email must be an email')) return '请输入有效邮箱地址。';
    return message || fallback;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginErr('');
    setRegisterErr('');
    setRegisterMsg('');
    setLoading(true);

    try {
      const normalizedEmail = normalizeTail(email);
      const normalizedPassword = normalizeTail(password);
      const data = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPassword,
        }),
      });

      setToken(data.accessToken);
      router.replace('/dashboard', { locale });
    } catch (error) {
      setLoginErr(parseApiErrorMessage(error, '登录失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setLoginErr('');
    setRegisterErr('');
    setRegisterMsg('');
    setRegisterLoading(true);
    try {
      const normalizedEmail = normalizeTail(registerEmail);
      const normalizedPassword = normalizeTail(registerPassword);
      await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPassword,
        }),
      });
      setEmail(normalizedEmail);
      setPassword(normalizedPassword);
      setRegisterMsg('注册成功，请使用该账号登录（默认学生端权限）');
      setRegisterOpen(false);
      setRegisterEmail('');
      setRegisterPassword('');
    } catch (error) {
      setRegisterErr(parseApiErrorMessage(error, '注册失败，请稍后重试。'));
    } finally {
      setRegisterLoading(false);
    }
  }

  function switchLocale(next: 'zh' | 'en' | 'ru') {
    router.replace('/', { locale: next });
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1.1fr 0.9fr',
        background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #e0f2fe 100%)',
      }}
    >
      {/* 左侧介绍区 */}
      <div
        style={{
          padding: '56px 48px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            width: 'fit-content',
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(37, 99, 235, 0.08)',
            color: '#1d4ed8',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Campus Smart Management
        </div>

        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 42,
              lineHeight: 1.15,
              color: '#0f172a',
              fontWeight: 800,
            }}
          >
            校园综合智慧管理系统
          </h1>

          <p
            style={{
              marginTop: 18,
              marginBottom: 0,
              fontSize: 17,
              lineHeight: 1.8,
              color: '#475569',
              maxWidth: 620,
            }}
          >
            面向学生、社团与团委的统一管理平台，整合任务协同、组织管理、日程安排、
            档案审核与成员信息管理，提升校园事务处理效率。
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
            maxWidth: 720,
          }}
        >
          {[
            ['学生端', '个人计划、组织任务、个人档案、通知提醒'],
            ['社团端', '成员信息、组织任务、活动安排、组织协同'],
            ['团委端', '学生档案审核、全局任务管理、日程统筹'],
            ['多语言', '支持中文、英文、俄文三语切换展示'],
          ].map(([title, text]) => (
            <div
              key={title}
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.9)',
                borderRadius: 20,
                padding: 18,
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#0f172a',
                  marginBottom: 8,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: '#475569',
                }}
              >
                {text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧登录区 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.95)',
            borderRadius: 28,
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.14)',
            padding: 30,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 22,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 28,
                  color: '#0f172a',
                  fontWeight: 800,
                }}
              >
                登录系统
              </h2>
              <p
                style={{
                  margin: '8px 0 0',
                  color: '#64748b',
                  fontSize: 14,
                }}
              >
                请选择账户身份进入对应端口
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {(['zh', 'en', 'ru'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLocale(l)}
                  style={{
                    border: '1px solid #dbeafe',
                    background: locale === l ? '#2563eb' : '#ffffff',
                    color: locale === l ? '#ffffff' : '#1e293b',
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {loginErr ? (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                borderRadius: 12,
                fontSize: 14,
              }}
            >
              {loginErr}
            </div>
          ) : null}

          <form
            onSubmit={onSubmit}
            style={{
              display: 'grid',
              gap: 14,
            }}
          >
            <label style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  邮箱账号
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRegisterErr('');
                    setRegisterMsg('');
                    setRegisterOpen(true);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#2563eb',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  注册账号
                </button>
              </div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(normalizeTail(e.target.value))}
                placeholder="请输入邮箱"
                style={{
                  border: '1px solid #dbe2f0',
                  borderRadius: 14,
                  padding: '14px 16px',
                  fontSize: 15,
                  outline: 'none',
                  background: '#fff',
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#334155',
                }}
              >
                登录密码
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(e) => setPassword(normalizeTail(e.target.value))}
                placeholder="请输入密码"
                style={{
                  border: '1px solid #dbe2f0',
                  borderRadius: 14,
                  padding: '14px 16px',
                  fontSize: 15,
                  outline: 'none',
                  background: '#fff',
                }}
              />
            </label>

            {registerMsg ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: '#166534',
                  fontSize: 13,
                }}
              >
                {registerMsg}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 6,
                border: 'none',
                borderRadius: 14,
                padding: '14px 16px',
                fontSize: 16,
                fontWeight: 800,
                color: '#fff',
                background: loading ? '#93c5fd' : '#2563eb',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 10px 24px rgba(37, 99, 235, 0.25)',
              }}
            >
              {loading ? '登录中...' : '进入系统'}
            </button>
          </form>

          <div
            style={{
              marginTop: 22,
              padding: 16,
              borderRadius: 16,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: 10,
              }}
            >
              演示账号
            </div>

            <div style={{ display: 'grid', gap: 8, fontSize: 14, color: '#475569' }}>
              <div>
                学生端：<strong>student@campus.demo</strong> / demo123456
              </div>
              <div>
                社团端：<strong>org@campus.demo</strong> / demo123456
              </div>
              <div>
                团委端：<strong>league@campus.demo</strong> / demo123456
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal open={registerOpen} title="学生注册" onClose={() => setRegisterOpen(false)} width={420}>
        <form onSubmit={onRegister} style={{ display: 'grid', gap: 12 }}>
          {registerErr ? (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: 13,
              }}
            >
              {registerErr}
            </div>
          ) : null}
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#475569' }}>账号（邮箱）</span>
            <input
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              onBlur={(e) => setRegisterEmail(normalizeTail(e.target.value))}
              placeholder="请输入注册邮箱"
              required
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#475569' }}>密码</span>
            <input
              type="password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              onBlur={(e) => setRegisterPassword(normalizeTail(e.target.value))}
              placeholder="至少 6 位"
              minLength={6}
              required
            />
          </label>
          <div className="topbar-muted" style={{ fontSize: 12 }}>
            注册用户默认归属学生组，仅具有学生端权限。
          </div>
          <button type="submit" disabled={registerLoading}>
            {registerLoading ? '注册中...' : '确认注册'}
          </button>
        </form>
      </Modal>
    </div>
  );
}