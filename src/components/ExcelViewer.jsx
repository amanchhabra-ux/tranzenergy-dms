import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Save } from 'lucide-react';

export function ExcelViewer({ crsData, onSave }) {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!crsData) {
      setData([]);
      return;
    }

    try {
      // Decode base64
      let b64 = crsData;
      if (crsData.includes('base64,')) {
        b64 = crsData.split('base64,')[1];
      }
      
      const raw = atob(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }

      const workbook = XLSX.read(bytes, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to array of arrays
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      setData(jsonData);
    } catch (err) {
      console.error('Error parsing Excel data:', err);
      setError('Failed to parse Excel file.');
    }
  }, [crsData]);

  const handleCellChange = (rowIndex, colIndex, value) => {
    const newData = [...data];
    if (!newData[rowIndex]) newData[rowIndex] = [];
    newData[rowIndex][colIndex] = value;
    setData(newData);
  };

  const handleSave = () => {
    try {
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'CRS');
      
      const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Data}`;
      
      if (onSave) onSave(dataUri);
    } catch (err) {
      console.error('Error saving Excel data:', err);
      alert('Failed to save Excel file.');
    }
  };

  if (error) {
    return (
      <div style={{ padding: '24px', color: 'var(--error)', textAlign: 'center' }}>
        ⚠️ {error}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div style={{ fontSize: '48px' }}>📊</div>
        <div className="empty-state-title">No CRS attached</div>
        <div className="empty-state-desc">Upload an Excel file to view and edit the Comment Resolution Sheet here.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-card)' }}>
      <div className="pdf-toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, paddingLeft: '12px' }}>Comment Resolution Sheet</span>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>
          <Save size={14} /> Save Changes
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} style={{ border: '1px solid var(--border)', padding: 0 }}>
                    <input
                      type="text"
                      value={cell === undefined || cell === null ? '' : cell}
                      onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        padding: '6px 8px',
                        outline: 'none',
                        color: 'var(--text-main)',
                        minWidth: '80px'
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
