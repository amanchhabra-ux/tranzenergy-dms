import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Printer, FileText } from 'lucide-react';

export const PdfDocumentPreview = ({ activeDrawing, activeVersion }) => {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const totalPages = activeDrawing.code === '4610-171-001-PVC-C-002' ? 4 : 2;

  const handleNextPage = () => setPage(prev => Math.min(prev + 1, totalPages));
  const handlePrevPage = () => setPage(prev => Math.max(prev - 1, 1));
  
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 10, 150));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 10, 75));

  // Render NTPC Fencing Drawing Details Page-by-Page
  const renderNtpcPages = () => {
    switch (page) {
      case 1:
        return (
          <div style={{ padding: '40px', background: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif', width: '100%', minHeight: '850px', border: '1px solid #ddd', fontSize: '13px', display: 'flex', flexDirection: 'column' }}>
            {/* Outline box */}
            <div style={{ border: '2px solid #000000', padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
              
              {/* Project Header block */}
              <div style={{ border: '2px solid #000000', padding: '12px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px', marginBottom: '16px' }}>
                BONGAIGAON THERMAL POWER STATION (BGTPS) LOT-2<br />
                75MW / 150 MWh BATTERY ENERGY STORAGE SYSTEM (BESS) PROJECT
              </div>

              {/* Owner Block */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', border: '1px solid #000', borderBottom: 'none' }}>
                <div style={{ borderRight: '1px solid #000', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: '#0a66c2', color: '#fff', padding: '4px 10px', fontWeight: 'bold', fontSize: '16px', borderRadius: '4px' }}>एनटीपीसी NTPC</div>
                </div>
                <div style={{ padding: '10px' }}>
                  <strong>Owner : NTPC Limited</strong><br />
                  (A GOVERNMENT OF INDIA ENTERPRISE)<br />
                  Engineering Division
                </div>
              </div>

              {/* EPC Block */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', border: '1px solid #000', borderBottom: 'none' }}>
                <div style={{ borderRight: '1px solid #000', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#10b981' }}>EiE</span>
                  <span style={{ fontSize: '7px', color: '#64748b' }}>Enviro Green</span>
                </div>
                <div style={{ padding: '10px' }}>
                  <strong>EPC : Enviro Infra Engineers Limited</strong><br />
                  Unit No. 201, Second Floor, R.G. Metro Arcade<br />
                  Sector -11, Rohini, Delhi -110085
                </div>
              </div>

              {/* Consultant Block */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', border: '1px solid #000' }}>
                <div style={{ borderRight: '1px solid #000', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 'bold' }}>Tranz Energy</span>
                </div>
                <div style={{ padding: '10px' }}>
                  <strong>Consultant : TRANZ ENERGY GLOBAL LLP</strong><br />
                  Director Office No 203, 6 Community Center,<br />
                  Naraina, Delhi - 110018
                </div>
              </div>

              {/* Title Section */}
              <div style={{ border: '2px solid #000', padding: '16px', margin: '20px 0', background: '#f8fafc' }}>
                <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569' }}>TITLE :</strong>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '6px', lineHeight: '1.4' }}>
                  BESS Area: Overall Area Layout and Structural Details of Chain Link Fencing/ Precast Boundary and Gates for BESS
                </div>
              </div>

              {/* Drawing ref details */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', border: '1px solid #000', marginBottom: '20px' }}>
                <div style={{ padding: '10px', borderRight: '1px solid #000' }}>
                  <strong>NTPC Doc. / Dwg. No.-</strong><br />
                  <span style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold' }}>4610-171-001-PVC-C-002</span>
                </div>
                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <strong>Rev No.:</strong> {activeVersion.version}<br />
                  <strong>Pages:</strong> 4
                </div>
              </div>

              {/* Revision status matrix */}
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontWeight: 'bold', textAnchor: 'middle', textTransform: 'uppercase', textAlign: 'center', border: '1px solid #000', borderBottom: 'none', padding: '6px', background: '#f1f5f9' }}>
                  Revision Status History
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ border: '1px solid #000', padding: '6px' }}>Rev.</th>
                      <th style={{ border: '1px solid #000', padding: '6px' }}>Prepared By</th>
                      <th style={{ border: '1px solid #000', padding: '6px' }}>Date</th>
                      <th style={{ border: '1px solid #000', padding: '6px' }}>Discipline Check</th>
                      <th style={{ border: '1px solid #000', padding: '6px' }}>Approved By</th>
                      <th style={{ border: '1px solid #000', padding: '6px' }}>App. Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>R0</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>P.R.</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>23-05-2026</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>Civil (Checked)</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>A.P.</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>23-05-2026</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>R1</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>P.R.</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>28-05-2026</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>Civil (Checked)</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>A.P.</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>28-05-2026</td>
                    </tr>
                    <tr style={{ background: '#f0fdf4', fontWeight: 'bold' }}>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>R2</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>P.R.</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>02-07-2026</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>Civil (Approved)</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>A.P.</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>02-07-2026</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        );

      case 2: // BESS overall site layout
        return (
          <div style={{ background: '#030816', width: '100%', minHeight: '850px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <span style={{ color: '#00e5ff', fontSize: '12px', fontFamily: 'monospace', alignSelf: 'flex-end', marginBottom: '12px' }}>
              4610-171-001-PVC-C-002 | Page 2 of 4 (Layout Sheet)
            </span>
            <svg viewBox="0 0 800 600" width="100%" height="520px" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
              {/* Site boundary */}
              <rect x="50" y="50" width="700" height="420" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4" />
              
              {/* Building Blocks */}
              <rect x="100" y="80" width="220" height="150" fill="#0b172a" stroke="#00e5ff" strokeWidth="2" />
              <text x="120" y="110" fill="#00e5ff" fontSize="11" fontWeight="bold">SCADA ROOM & TELEMETRY</text>
              <rect x="110" y="130" width="90" height="40" fill="none" stroke="#3b82f6" />
              <text x="120" y="155" fill="#f8fafc" fontSize="9">RTU / server racks</text>

              <rect x="360" y="80" width="340" height="150" fill="#0b172a" stroke="#00e5ff" strokeWidth="2" />
              <text x="380" y="110" fill="#00e5ff" fontSize="11" fontWeight="bold">BATTERY ROOMS (BESS-01 & BESS-02)</text>
              <line x1="530" y1="80" x2="530" y2="230" stroke="#00e5ff" strokeWidth="1" strokeDasharray="3,3" />

              {/* Racks representation */}
              <rect x="380" y="130" width="130" height="80" fill="none" stroke="#64748b" strokeWidth="1" />
              <line x1="380" y1="150" x2="510" y2="150" stroke="#64748b" />
              <line x1="380" y1="170" x2="510" y2="170" stroke="#64748b" />
              <line x1="380" y1="190" x2="510" y2="190" stroke="#64748b" />
              <text x="390" y="145" fill="#cbd5e1" fontSize="8">BESS-1 LI-ION RACKS</text>

              <rect x="550" y="130" width="130" height="80" fill="none" stroke="#64748b" strokeWidth="1" />
              <line x1="550" y1="150" x2="680" y2="150" stroke="#64748b" />
              <line x1="550" y1="170" x2="680" y2="170" stroke="#64748b" />
              <line x1="550" y1="190" x2="680" y2="190" stroke="#64748b" />
              <text x="560" y="145" fill="#cbd5e1" fontSize="8">BESS-2 LI-ION RACKS</text>

              {/* Access road */}
              <path d="M 50,420 L 750,420" fill="none" stroke="#64748b" strokeWidth="30" opacity="0.3" />
              <path d="M 50,420 L 750,420" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="5,5" />
              <text x="80" y="425" fill="#f8fafc" fontSize="10">BESS VEHICLE APPROACH ROAD (6.0m WIDE)</text>

              {/* Legends */}
              <rect x="50" y="490" width="700" height="80" fill="#090d16" stroke="#1e293b" />
              <text x="70" y="515" fill="#64748b" fontSize="10" fontFamily="monospace">REFERENCE: 4610-171-001-PVE-F-003 GLP LAYOUT</text>
              <text x="70" y="535" fill="#f8fafc" fontSize="10">BGTPS Battery Storage Facility boundary plans</text>
              <text x="70" y="555" fill="#64748b" fontSize="9">NTPC engineering release | Civil details</text>
            </svg>
          </div>
        );

      case 3: // Gate elevations detail
        return (
          <div style={{ background: '#030816', width: '100%', minHeight: '850px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <span style={{ color: '#00e5ff', fontSize: '12px', fontFamily: 'monospace', alignSelf: 'flex-end', marginBottom: '12px' }}>
              4610-171-001-PVC-C-002 | Page 3 of 4 (Gate Elevation details)
            </span>
            <svg viewBox="0 0 800 600" width="100%" height="520px" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
              {/* Gate structural layout */}
              <text x="300" y="50" fill="#00e5ff" fontSize="14" fontWeight="bold">TYPICAL BESS ENTRY GATE ELEVATION</text>
              
              {/* Columns */}
              <rect x="150" y="150" width="40" height="300" fill="#1e293b" stroke="#cbd5e1" strokeWidth="2" />
              <line x1="150" y1="150" x2="190" y2="450" stroke="#64748b" strokeWidth="1" />
              <line x1="190" y1="150" x2="150" y2="450" stroke="#64748b" strokeWidth="1" />
              <text x="120" y="300" fill="#cbd5e1" fontSize="10" transform="rotate(-90 120 300)">RC COLUMN (500x500)</text>

              <rect x="580" y="150" width="40" height="300" fill="#1e293b" stroke="#cbd5e1" strokeWidth="2" />
              <line x1="580" y1="150" x2="620" y2="450" stroke="#64748b" strokeWidth="1" />
              <line x1="620" y1="150" x2="580" y2="450" stroke="#64748b" strokeWidth="1" />

              {/* Gate frame */}
              <rect x="190" y="180" width="190" height="250" fill="none" stroke="#f59e0b" strokeWidth="3" />
              <line x1="190" y1="180" x2="380" y2="430" stroke="#f59e0b" strokeWidth="1" />
              <line x1="190" y1="430" x2="380" y2="180" stroke="#f59e0b" strokeWidth="1" />
              <rect x="380" y="180" width="200" height="250" fill="none" stroke="#f59e0b" strokeWidth="3" />
              <line x1="380" y1="180" x2="580" y2="430" stroke="#f59e0b" strokeWidth="1" />
              <line x1="380" y1="430" x2="580" y2="180" stroke="#f59e0b" strokeWidth="1" />
              <text x="320" y="170" fill="#f59e0b" fontSize="10">6.0m CLEAR WIDTH M.S. SLIDING GATE</text>

              {/* Foundation concrete details */}
              <rect x="110" y="450" width="120" height="80" fill="none" stroke="#3b82f6" strokeWidth="2" />
              <line x1="110" y1="490" x2="230" y2="490" stroke="#3b82f6" strokeDasharray="3,3" />
              <text x="120" y="480" fill="#f8fafc" fontSize="8">FGL (FINISH ROAD LEVEL)</text>
              <text x="120" y="520" fill="#64748b" fontSize="8">PCC 1:4:8 BEDDING</text>

              <rect x="540" y="450" width="120" height="80" fill="none" stroke="#3b82f6" strokeWidth="2" />
              <line x1="540" y1="490" x2="660" y2="490" stroke="#3b82f6" strokeDasharray="3,3" />

              {/* Legends */}
              <text x="150" y="570" fill="#64748b" fontSize="9" fontFamily="monospace">Dimensions in mm. Grade of Concrete M25 for columns, M30 for precast panels.</text>
            </svg>
          </div>
        );

      case 4: // Fence details rebar elevation
        return (
          <div style={{ background: '#030816', width: '100%', minHeight: '850px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <span style={{ color: '#00e5ff', fontSize: '12px', fontFamily: 'monospace', alignSelf: 'flex-end', marginBottom: '12px' }}>
              4610-171-001-PVC-C-002 | Page 4 of 4 (Fencing structural details)
            </span>
            <svg viewBox="0 0 800 600" width="100%" height="520px" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
              {/* Fencing details elevation */}
              <text x="250" y="50" fill="#00e5ff" fontSize="14" fontWeight="bold">TYPICAL PRECAST WALL & CHAIN LINK ELEVATION</text>
              
              {/* Barb wire lines */}
              <line x1="100" y1="120" x2="700" y2="120" stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" />
              <line x1="100" y1="135" x2="700" y2="135" stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" />
              <line x1="100" y1="150" x2="700" y2="150" stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" />
              <text x="120" y="110" fill="#ef4444" fontSize="8">3-ROWS HIGH TENSILE BARBED WIRE</text>

              {/* Concertina coils */}
              <circle cx="200" cy="180" r="30" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.6" />
              <circle cx="300" cy="180" r="30" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.6" />
              <circle cx="400" cy="180" r="30" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.6" />
              <circle cx="500" cy="180" r="30" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.6" />
              <circle cx="600" cy="180" r="30" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.6" />
              <text x="220" y="175" fill="#f8fafc" fontSize="9">600 DIA SERRATED GALVANISED CONCERTINA COIL</text>

              {/* Straining post and panels */}
              <rect x="150" y="210" width="30" height="240" fill="#1e293b" stroke="#cbd5e1" />
              <rect x="480" y="210" width="30" height="240" fill="#1e293b" stroke="#cbd5e1" />
              
              {/* Chain link grid representation */}
              <rect x="180" y="210" width="300" height="150" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="5,2" />
              <line x1="180" y1="210" x2="480" y2="360" stroke="#f59e0b" opacity="0.3" />
              <line x1="180" y1="360" x2="480" y2="210" stroke="#f59e0b" opacity="0.3" />
              <text x="210" y="250" fill="#f59e0b" fontSize="10">4mm DIA PVC COATED G.I. CHAIN LINK (75x75 MESH)</text>

              {/* Precast block footing */}
              <rect x="180" y="360" width="300" height="90" fill="#15201b" stroke="#10b981" strokeWidth="2" />
              <text x="210" y="410" fill="#10b981" fontSize="10">250 THK BRICK WALL IN CEMENT MORTAR</text>

              {/* Ground line */}
              <line x1="50" y1="450" x2="750" y2="450" stroke="#10b981" strokeWidth="2" />
              <text x="70" y="475" fill="#10b981" fontSize="9">FINISHED GROUND LEVEL (FGL)</text>
            </svg>
          </div>
        );

      default:
        return null;
    }
  };

  // Default PDF Preview (Transmittal package cover representation for other drawings)
  const renderGenericPages = () => {
    if (page === 1) {
      return (
        <div style={{ padding: '50px', background: '#ffffff', color: '#000000', fontFamily: 'Courier New, monospace', width: '100%', minHeight: '850px', border: '1px solid #ddd', fontSize: '14px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ border: '2px solid #000', padding: '30px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', borderBottom: '2px solid #000', paddingBottom: '10px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
              TRANZENERGY OFFICIAL TRANSMITTAL REVIEW SHEET
            </h2>
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <div><strong>DOCUMENT REFERENCE:</strong> {activeDrawing.code}</div>
              <div><strong>TITLE:</strong> {activeDrawing.title}</div>
              <div><strong>PROJECT NAME:</strong> {activeDrawing.projectName}</div>
              <div><strong>CLIENT:</strong> {activeDrawing.clientName}</div>
              <div><strong>ACTIVE REVISION:</strong> {activeVersion.version}</div>
              <div><strong>DATE DIGITIZED:</strong> {activeVersion.date}</div>
              <div><strong>RELEASE TYPE:</strong> Engineering Layout Sheet (PDF Format)</div>
              
              <div style={{ border: '1px dashed #000', padding: '16px', margin: '20px 0', background: '#f8fafc' }}>
                <strong>Revision Summary:</strong><br />
                {activeVersion.changeSummary}
              </div>

              <div style={{ marginTop: 'auto', borderTop: '1px solid #000', paddingTop: '10px' }}>
                <div><strong>REVISION LOG TIMELINE:</strong></div>
                <div style={{ fontSize: '12px', marginTop: '6px' }}>
                  {activeDrawing.versions.map(v => (
                    <div key={v.version}>
                      • [{v.version}] ({v.date.substring(0, 10)}) by {v.author}: {v.changeSummary}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ borderTop: '2px solid #000', paddingTop: '10px', fontSize: '10px', textAlign: 'center', color: '#666' }}>
              TRANZENERGY DIGITAL TRANSMITTAL SYSTEM DOCUMENT CODE: {activeDrawing.id.toUpperCase()}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div style={{ background: '#090d16', width: '100%', minHeight: '850px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <FileText size={64} style={{ color: 'var(--primary)', marginBottom: '16px' }} />
          <h3 style={{ color: '#fff', fontSize: '18px' }}>Sheet Page 2 Blueprint Preview</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>
            Interactive blueprint vectors for this sheet are available on the "Interactive Pinboard" canvas tab.
          </p>
        </div>
      );
    }
  };

  return (
    <div 
      style={{ 
        flex: 1, 
        background: '#1e293b', 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        borderRight: '1px solid var(--border-color)' 
      }}
    >
      {/* Reader Controls Toolbar */}
      <div 
        style={{ 
          height: '48px', 
          background: '#0f172a', 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '0 16px',
          zIndex: 2
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} className="text-primary" />
          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Tranzenergy PDF Reader Engine</span>
        </div>

        {/* Page selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', opacity: page === 1 ? 0.3 : 1 }}
            disabled={page === 1}
            onClick={handlePrevPage}
          >
            <ChevronLeft size={16} />
          </button>
          
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Page {page} of {totalPages}
          </span>

          <button 
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', opacity: page === totalPages ? 0.3 : 1 }}
            disabled={page === totalPages}
            onClick={handleNextPage}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }} 
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{zoom}%</span>
          
          <button 
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }} 
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* PDF Document Render Area */}
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '24px', 
          display: 'flex', 
          justifyContent: 'center',
          background: '#0f172a'
        }}
      >
        <div 
          style={{ 
            width: '100%', 
            maxWidth: '850px', 
            transform: `scale(${zoom / 100})`, 
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            marginBottom: '40px'
          }}
        >
          {activeDrawing.code === '4610-171-001-PVC-C-002' ? renderNtpcPages() : renderGenericPages()}
        </div>
      </div>
    </div>
  );
};
