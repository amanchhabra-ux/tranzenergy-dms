import React, { useRef } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';

// Small optional "attach CRS Excel" control used in the upload modals.
export function CrsPicker({ file, onChange, label = 'Attach CRS Excel (optional)' }) {
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px dashed var(--border-hover)', borderRadius: 'var(--r-md)', marginTop: '12px' }}>
      <FileSpreadsheet size={18} style={{ color: file ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600 }}>{label}</div>
        <div className="truncate" style={{ fontSize: '11px', color: file ? 'var(--success)' : 'var(--text-muted)' }}>
          {file ? file.name : 'Comment Resolution Sheet · .xlsx / .xls'}
        </div>
      </div>
      <input ref={ref} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: 'none' }}
        onChange={e => { onChange(e.target.files[0] || null); e.target.value = ''; }} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.click()}>
        {file ? 'Change' : 'Choose file'}
      </button>
      {file && (
        <button type="button" className="btn btn-ghost btn-icon" title="Remove" onClick={() => onChange(null)}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}
