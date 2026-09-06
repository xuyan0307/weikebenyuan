import { useEffect, useState } from 'react';
import { dispatchApi } from '../api/endpoints';

type Staff = Awaited<ReturnType<typeof dispatchApi.settings>>['therapists'][number];
export default function DispatchSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [initial, setInitial] = useState<Record<string, boolean>>({});
  const [role, setRole] = useState('全部');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    dispatchApi.settings().then(data => { if (active) { setStaff(data.therapists); setInitial(Object.fromEntries(data.therapists.map(t => [t.id, t.selected]))); } })
      .catch(e => { if (active) setError(e.message || '读取配置失败'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function save() {
    setSaving(true); setError('');
    try {
      await dispatchApi.saveSettings(staff.filter(t => t.selected !== initial[t.id]).map(t => ({ id: t.id, selected: t.selected })));
      onSaved(); onClose();
    } catch (e: any) { setError(e.message || '保存失败'); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="派单人员设置">
    <section className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-xl bg-white p-4">
      <h2 className="text-base font-bold">派单人员设置</h2>
      <p className="my-2 text-xs text-gray-500">人员来自技师档案。只有勾选并保存的人员参与推荐；休假、离职人员仍不会推荐。未勾选人员不会自动加入。</p>
      <div className="mb-3 flex gap-2">
        <select aria-label="技师类型筛选" value={role} onChange={e => setRole(e.target.value)} className="min-w-0 rounded border p-2 text-sm">{['全部', '产康师', '运动康复师', '体质调理师'].map(r => <option key={r}>{r}</option>)}</select>
        <input aria-label="技师姓名筛选" placeholder="搜索技师姓名" value={keyword} onChange={e => setKeyword(e.target.value)} className="min-w-0 flex-1 rounded border p-2 text-sm" />
      </div>
      <div className="min-h-0 overflow-y-auto">
        {loading ? <p>正在读取技师档案…</p> : staff.filter(t => (role === '全部' || t.role === role) && t.name.includes(keyword.trim())).map(t => <label key={t.id} className="flex items-center gap-3 border-b p-3 text-sm">
          <input type="checkbox" checked={t.selected} disabled={saving} onChange={e => setStaff(list => list.map(item => item.id === t.id ? { ...item, selected: e.target.checked } : item))} />
          <span>{t.name}</span><span className="text-xs text-gray-500">{t.role} · {t.status}</span>
        </label>)}
      </div>
      {error && <p role="alert" className="my-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex shrink-0 justify-end gap-2"><button disabled={saving} onClick={onClose} className="rounded border px-4 py-2">取消</button><button disabled={loading || saving || (staff.length === 0)} onClick={save} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{saving ? '保存中…' : '保存配置'}</button></div>
    </section>
  </div>;
}
