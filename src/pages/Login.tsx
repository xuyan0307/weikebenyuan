import { useState } from 'react';
import { EyeIcon, EyeOffIcon, UserIcon, LockIcon, ArrowRightIcon } from 'lucide-react';
import { useLogin } from '../api/hooks';
import { setToken } from '../api/client';
import type { UserInfo } from '../api/endpoints';

const LOGO_URL =
  'https://bosyun-pri-prod.obs.cn-east-3.myhuaweicloud.com:443/aigc_channel/a8g1m201000djc7pi19t90w4pmqtmfvm/agent_fs/inputs/ab2c4be2_c73f_46ea_b8a1_35b5e3ac?AWSAccessKeyId=BTVJCLZNPXKRECB9GLOR&Expires=1782608858&Signature=tryfL1klXuNZ%2FF75cFKPUQFWLcM%3D';

function WaterDrop({ size = 80, opacity = 0.12, className = '' }: { size?: number; opacity?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" className={className} style={{ opacity }}>
      <path d="M50 5 C50 5 10 55 10 78 C10 101 28 115 50 115 C72 115 90 101 90 78 C90 55 50 5 50 5Z" fill="url(#dropGrad)" />
      <defs>
        <linearGradient id="dropGrad" x1="30" y1="10" x2="70" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60B8F0" />
          <stop offset="100%" stopColor="#1E88E5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function RippleCircle({ size = 200, opacity = 0.06, className = '' }: { size?: number; opacity?: number; className?: string }) {
  return <div className={`rounded-full border-2 ${className}`} style={{ width: size, height: size, borderColor: '#1E88E5', opacity }} />;
}

export default function Login() {
  const loginMut = useLogin();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [accountFocus, setAccountFocus] = useState(false);
  const [pwdFocus, setPwdFocus] = useState(false);

  async function handleLogin() {
    if (!account.trim()) { setError('请输入账号'); return; }
    if (!password.trim()) { setError('请输入密码'); return; }
    setError('');
    try {
      const res = await loginMut.mutateAsync({ username: account.trim(), password });
      setToken(res.token);
      const user: UserInfo = res.user;
      void user;
      window.location.replace('/');
    } catch (e: any) {
      setError(e?.message || '登录失败，请重试');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin();
  }

  const loading = loginMut.isPending;

  return (
    <div
      data-cmp="Login"
      className="relative flex h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #EBF5FF 0%, #F0F8FF 40%, #E3F2FD 100%)' }}
    >
      <div className="absolute -top-16 -left-16"><WaterDrop size={260} opacity={0.08} /></div>
      <div className="absolute -bottom-20 -right-20" style={{ transform: 'rotate(180deg)' }}><WaterDrop size={320} opacity={0.07} /></div>
      <RippleCircle size={400} opacity={0.05} className="absolute -bottom-32 -left-32" />
      <RippleCircle size={280} opacity={0.07} className="absolute top-16 right-8" />
      <RippleCircle size={160} opacity={0.09} className="absolute top-1/3 left-16" />
      <div className="absolute top-24 right-48"><WaterDrop size={40} opacity={0.15} /></div>
      <div className="absolute bottom-32 left-1/4"><WaterDrop size={28} opacity={0.12} /></div>
      <div className="absolute top-1/2 right-1/4"><WaterDrop size={20} opacity={0.10} /></div>

      <div className="hidden lg:flex flex-col justify-center items-center flex-1 px-16 relative z-10">
        <div className="flex flex-col items-center gap-6 mb-12">
          <div
            className="rounded-3xl flex items-center justify-center shadow-custom"
            style={{ width: 180, height: 180, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)' }}
          >
            <img src={LOGO_URL} alt="微可本源" style={{ width: 150, height: 150, objectFit: 'contain' }} />
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold tracking-wide" style={{ color: '#1565C0' }}>微可本源</div>
            <div className="text-sm tracking-widest mt-1" style={{ color: '#42A5F5', letterSpacing: '0.25em' }}>WEIKE BENYUAN</div>
          </div>
        </div>
        <div className="rounded-2xl px-8 py-6 max-w-sm text-center" style={{ background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.8)' }}>
          <div className="text-xl font-bold mb-2" style={{ color: '#1565C0' }}>产康运营管理平台</div>
          <div className="text-sm leading-relaxed" style={{ color: '#5C8AB5' }}>
            专业上门产康服务管理系统<br />客户管理 · 预约排期 · 服务跟踪 · 财务结算
          </div>
          <div className="flex flex-col gap-2 mt-5">
            {['智能排期，高效派单', '全程服务追踪记录', '数据驱动运营决策'].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #42A5F5, #1E88E5)' }}>
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
                </div>
                <span className="text-sm" style={{ color: '#4A7FA5' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center w-full lg:w-auto lg:min-w-[480px] px-6 py-8 relative z-10">
        <div
          className="w-full max-w-sm rounded-3xl px-10 py-10 shadow-custom"
          style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.95)' }}
        >
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <img src={LOGO_URL} alt="微可本源" style={{ width: 72, height: 72, objectFit: 'contain' }} />
            <div className="text-2xl font-bold mt-2" style={{ color: '#1565C0' }}>微可本源</div>
            <div className="text-xs tracking-widest mt-0.5" style={{ color: '#42A5F5' }}>WEIKE BENYUAN</div>
          </div>

          <div className="mb-8">
            <div className="text-2xl font-bold" style={{ color: '#1A3A5C' }}>欢迎登录</div>
            <div className="text-sm mt-1.5" style={{ color: '#7AAFC8' }}>产康运营管理平台</div>
            <div className="flex items-center gap-1 mt-2">
              <div className="h-1 w-8 rounded-full" style={{ background: 'linear-gradient(90deg, #1E88E5, #42A5F5)' }} />
              <div className="h-1 w-3 rounded-full" style={{ background: '#90CAF9' }} />
              <div className="h-1 w-1.5 rounded-full" style={{ background: '#BBDEFB' }} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#2C5F8A' }}>账号</label>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                style={{
                  border: accountFocus ? '1.5px solid #1E88E5' : '1.5px solid #C5DCF0',
                  background: accountFocus ? 'rgba(227,242,253,0.5)' : 'rgba(240,248,255,0.7)',
                  boxShadow: accountFocus ? '0 0 0 3px rgba(30,136,229,0.10)' : 'none',
                }}
              >
                <UserIcon size={16} style={{ color: accountFocus ? '#1E88E5' : '#90C4E8', flexShrink: 0 }} />
                <input
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: '#1A3A5C' }}
                  placeholder="请输入账号"
                  value={account}
                  onChange={e => { setAccount(e.target.value); setError(''); }}
                  onFocus={() => setAccountFocus(true)}
                  onBlur={() => setAccountFocus(false)}
                  onKeyDown={handleKeyDown}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#2C5F8A' }}>密码</label>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                style={{
                  border: pwdFocus ? '1.5px solid #1E88E5' : '1.5px solid #C5DCF0',
                  background: pwdFocus ? 'rgba(227,242,253,0.5)' : 'rgba(240,248,255,0.7)',
                  boxShadow: pwdFocus ? '0 0 0 3px rgba(30,136,229,0.10)' : 'none',
                }}
              >
                <LockIcon size={16} style={{ color: pwdFocus ? '#1E88E5' : '#90C4E8', flexShrink: 0 }} />
                <input
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: '#1A3A5C' }}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="请输入密码"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  onFocus={() => setPwdFocus(true)}
                  onBlur={() => setPwdFocus(false)}
                  onKeyDown={handleKeyDown}
                  autoComplete="current-password"
                />
                <button type="button" className="flex-shrink-0 transition-colors" style={{ color: pwdFocus ? '#1E88E5' : '#90C4E8' }} onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div
              className="text-sm px-3 py-2 rounded-lg transition-all duration-200"
              style={{ background: error ? 'rgba(244,67,54,0.08)' : 'transparent', color: 'var(--danger)', minHeight: 36, opacity: error ? 1 : 0 }}
            >
              {error || ' '}
            </div>

            <button
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200"
              style={{
                background: loading ? 'linear-gradient(135deg, #90CAF9, #64B5F6)' : 'linear-gradient(135deg, #1E88E5, #1565C0)',
                color: '#fff',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(30,136,229,0.35)',
                cursor: loading ? 'not-allowed' : 'pointer',
                transform: loading ? 'scale(0.98)' : 'scale(1)',
              }}
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <path d="M12 2 A10 10 0 0 1 22 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  登录中...
                </>
              ) : (
                <>登录<ArrowRightIcon size={16} /></>
              )}
            </button>

            <div className="flex items-center justify-between mt-1">
              <span className="text-xs" style={{ color: '#9CC4E0' }}>忘记密码？请联系管理员</span>
              <span className="text-xs" style={{ color: '#9CC4E0' }}>v2.0.0</span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-xs z-10" style={{ color: '#9BBDD4' }}>
        © 2025 微可本源 · 产康运营管理平台 · 保留所有权利
      </div>
    </div>
  );
}
