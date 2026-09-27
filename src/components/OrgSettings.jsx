import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { Building2, Upload, Trash2, Check } from 'lucide-react';
import { DEFAULT_ORG, LOGO_MAX_BYTES } from '../utils/org';

const FIELDS = [
  { key: 'name', label: 'Organisation name', hint: 'Shown on the sign-in page, the menu, the browser tab and emails.' },
  { key: 'shortName', label: 'Short name', hint: 'Phone header and file names (e.g. the backup file).' },
  { key: 'emailFromName', label: 'Email sender name', hint: 'Display name on notification emails. Empty: the NOTIFY_FROM name, else the organisation name.' },
  { key: 'appUrl', label: 'App link in emails', hint: 'e.g. https://dms.company.com. APP_URL in Vercel takes precedence.' },
];
const COLORS = [
  { key: 'primaryColor', label: 'Primary colour', hint: 'Buttons, active menu items, highlights.' },
  { key: 'accentColor', label: 'Accent colour', hint: 'Drawing numbers and secondary highlights.' },
];

/** Admin → Organisation: the company's name, logo and colours (state.org). */
export function OrgSettings() {
  const { orgSettings, updateOrg } = useContext(AppContext);
  const [form, setForm] = useState(() => ({ ...Object.fromEntries(Object.keys(DEFAULT_ORG).map(k => [k, ''])), ...orgSettings }));
  const [msg, setMsg] = useState('');
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setMsg(''); };

  // The logo is kept inside the workspace as a small data URL, so the sign-in page
  // can show it before anyone is signed in (stored files need a signed-in user).
  const onLogo = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp|gif)$/.test(file.type)) { setMsg('⚠️ Use a PNG, JPG, SVG, WebP or GIF image.'); return; }
    if (file.size > LOGO_MAX_BYTES) { setMsg(`⚠️ The logo is ${Math.round(file.size / 1024)} KB; the limit is ${LOGO_MAX_BYTES / 1024} KB.`); return; }
    const reader = new FileReader();
    reader.onload = (e) => set('logoUrl', e.target.result);
    reader.readAsDataURL(file);
  };

  const save = () => {
    const bad = COLORS.find(c => form[c.key] && !/^#[0-9a-f]{6}$/i.test(form[c.key]));
    if (bad) { setMsg(`⚠️ ${bad.label} must look like #3b5b7e, or be empty.`); return; }
    updateOrg(Object.fromEntries(Object.keys(DEFAULT_ORG).map(k => [k, String(form[k] || '').trim()])));
    setMsg('✓ Saved. Everyone sees the new settings within a few seconds.');
  };

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Building2 size={18} style={{ color: 'var(--primary-light)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Organisation</h3>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 160, height: 72, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', overflow: 'hidden' }}>
              {form.logoUrl
                ? <img src={form.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No logo: the name is shown</span>}
            </div>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={13} /> {form.logoUrl ? 'Replace' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" style={{ display: 'none' }} onChange={e => { onLogo(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {form.logoUrl && <button className="btn btn-ghost btn-sm" onClick={() => set('logoUrl', '')}><Trash2 size={13} /> Remove</button>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Up to {LOGO_MAX_BYTES / 1024} KB. Also used as the browser tab icon.</div>
        </div>

        {FIELDS.map(f => (
          <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{f.label}</label>
            <input className="form-input" value={form[f.key] || ''} placeholder={DEFAULT_ORG[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{f.hint}</div>
          </div>
        ))}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Address</label>
          <textarea className="form-input" rows={2} value={form.address || ''} onChange={e => set('address', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {COLORS.map(c => (
            <div key={c.key} className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{c.label}</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(form[c.key] || '') ? form[c.key] : '#3b5b7e'} onChange={e => set(c.key, e.target.value)}
                  style={{ width: 36, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'none' }} />
                <input className="form-input" value={form[c.key] || ''} placeholder="default" onChange={e => set(c.key, e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{c.hint} Empty: neutral default.</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={save}><Check size={13} /> Save organisation settings</button>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('⚠️') ? 'var(--error)' : 'var(--success)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}
