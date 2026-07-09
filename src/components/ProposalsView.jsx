import React, { useContext, useState, useRef, useEffect } from 'react';
import { AppContext } from '../AppContext';
import { FileText, Plus, X, Upload, Calendar, Trash2, Download } from 'lucide-react';
import { PdfViewer } from './PdfViewer';

export function ProposalsView() {
  const { proposals, uploadProposal, updateProposalComments, deleteProposal } = useContext(AppContext);
  
  const [activeProposalId, setActiveProposalId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newProposal, setNewProposal] = useState({ title: '', submissionDate: '', followUpDate: '' });
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  
  const fileInputRef = useRef(null);

  const activeProposal = proposals.find(p => p.id === activeProposalId);

  const [localComments, setLocalComments] = useState('');
  useEffect(() => {
    if (activeProposal) {
      setLocalComments(activeProposal.followUpComments || '');
    } else {
      setLocalComments('');
    }
  }, [activeProposalId, activeProposal?.followUpComments]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileData(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProposal = () => {
    if (!newProposal.title || !fileData) return alert('Please provide a title and attach a file.');
    uploadProposal({ ...newProposal, fileData, fileName, followUpComments: '' });
    setShowUploadModal(false);
    setNewProposal({ title: '', submissionDate: '', followUpDate: '' });
    setFileData(null);
    setFileName('');
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this proposal?')) {
      deleteProposal(id);
      if (activeProposalId === id) setActiveProposalId(null);
    }
  };

  const handleDownload = () => {
    if (!activeProposal?.fileData) return;
    const a = document.createElement('a');
    a.href = activeProposal.fileData;
    a.download = activeProposal.fileName || 'Proposal.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Left List */}
      <div style={{ width: '380px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} /> Proposals
          </h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowUploadModal(true)}>
            <Plus size={14} /> New Proposal
          </button>
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {proposals.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No proposals yet</div>
              <div className="empty-state-desc">Upload a proposal to get started.</div>
            </div>
          ) : (
            proposals.map(p => (
              <div
                key={p.id}
                className={`card ${activeProposalId === p.id ? 'active' : ''}`}
                onClick={() => setActiveProposalId(p.id)}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', paddingRight: '24px' }}>{p.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={12} /> Sub: {p.submissionDate || 'N/A'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={12} /> Follow-up: {p.followUpDate || 'N/A'}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  style={{ position: 'absolute', top: '12px', right: '12px', color: 'var(--error)' }}
                  onClick={(e) => handleDelete(e, p.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Viewer & Comments */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeProposal ? (
          <>
            <div className="panel-header" style={{ borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>{activeProposal.title}</div>
              <button className="btn btn-ghost btn-sm" onClick={handleDownload}>
                <Download size={14} /> Download File
              </button>
            </div>
            
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* PDF Viewer / File Placeholder */}
              <div style={{ flex: 2, borderRight: '1px solid var(--border)', background: '#111827', position: 'relative' }}>
                {activeProposal.fileData?.startsWith('data:application/pdf') ? (
                  <PdfViewer pdfDataUrl={activeProposal.fileData} />
                ) : (
                  <div className="empty-state" style={{ height: '100%' }}>
                    <div className="empty-state-icon">📎</div>
                    <div className="empty-state-title">Attached File</div>
                    <div className="empty-state-desc">{activeProposal.fileName || 'Non-PDF file format'}</div>
                    <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={handleDownload}>
                      Download to View
                    </button>
                  </div>
                )}
              </div>
              
              {/* Follow-up Comments */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
                <div style={{ padding: '16px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                  Follow-Up Comments
                </div>
                <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <textarea
                    className="form-input"
                    style={{ flex: 1, width: '100%', resize: 'none' }}
                    placeholder="Enter follow-up comments and tracking notes here..."
                    value={localComments}
                    onChange={(e) => setLocalComments(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      className="btn btn-primary"
                      onClick={() => updateProposalComments(activeProposal.id, localComments)}
                    >
                      Save Comments
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">Select a Proposal</div>
            <div className="empty-state-desc">Choose a proposal from the list to view details and comments.</div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '400px' }}>
            <div className="modal-header">
              <h2>New Proposal</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowUploadModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Proposal Title</label>
                <input
                  className="form-input"
                  value={newProposal.title}
                  onChange={e => setNewProposal({ ...newProposal, title: e.target.value })}
                  placeholder="e.g. BESS Expansion Scope"
                />
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Submission Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newProposal.submissionDate}
                    onChange={e => setNewProposal({ ...newProposal, submissionDate: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Follow Up Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newProposal.followUpDate}
                    onChange={e => setNewProposal({ ...newProposal, followUpDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Attachment</label>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} style={{ marginRight: '8px' }} />
                  {fileName || 'Select File...'}
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveProposal}>Save Proposal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
