import React, { useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Move, MessageSquare } from 'lucide-react';

export const DrawingCanvas = ({
  svgType,
  pins = [],
  activePinId = null,
  onCanvasClick,
  onPinClick,
  isMarkupMode = false,
  activeSelectedVersion = ''
}) => {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset zoom and pan when drawing changes
  useEffect(() => {
    resetZoom();
  }, [svgType]);

  const handleMouseDown = (e) => {
    // If markup mode is active, clicking will place a pin, not pan
    if (isMarkupMode) return;
    
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || isMarkupMode) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCanvasClick = (e) => {
    if (!isMarkupMode || !onCanvasClick) return;

    const rect = e.currentTarget.getBoundingClientRect();
    // Calculate coordinates as percentages of drawing size (1000 x 700 viewBox)
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    const pctX = (clientX / rect.width) * 100;
    const pctY = (clientY / rect.height) * 100;

    onCanvasClick(pctX, pctY);
  };

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Render vector graphics representing actual professional blue sheet drawings
  const renderSVGContent = () => {
    switch (svgType) {
      case 'electrical_sld_v1':
        return (
          <g>
            {/* Grid Pattern */}
            <rect width="1000" height="700" fill="#030813" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">TRANZENERGY DRAWING CONTROL | SLD INDUSTRIAL FEEDER</text>
            <text x="50" y="75" fill="#64748b" fontSize="12" fontFamily="monospace">DWG CODE: E-SLD-MAIN-001 | REV: V1.0 (OLD VERSION)</text>
            
            {/* High Voltage Bus Bar 1 */}
            <line x1="100" y1="180" x2="900" y2="180" stroke="#3b82f6" strokeWidth="6" />
            <text x="110" y="165" fill="#3b82f6" fontSize="12" fontWeight="bold">HV BUS A (11KV FEEDER LOOP)</text>

            {/* Incomer Feeder 1 */}
            <line x1="250" y1="180" x2="250" y2="280" stroke="#3b82f6" strokeWidth="3" />
            <rect x="230" y="210" width="40" height="40" fill="#1e293b" stroke="#00e5ff" strokeWidth="2" />
            <text x="280" y="235" fill="#f8fafc" fontSize="11" fontFamily="monospace">INCOMER VCB-01 (800A)</text>
            {/* Closed switch indicator */}
            <line x1="250" y1="215" x2="250" y2="245" stroke="#ef4444" strokeWidth="4" />

            {/* Incomer Feeder 2 */}
            <line x1="750" y1="180" x2="750" y2="280" stroke="#3b82f6" strokeWidth="3" />
            <rect x="730" y="210" width="40" height="40" fill="#1e293b" stroke="#00e5ff" strokeWidth="2" />
            <text x="610" y="235" fill="#f8fafc" fontSize="11" fontFamily="monospace">INCOMER VCB-02 (800A)</text>
            {/* Open switch indicator */}
            <line x1="740" y1="220" x2="760" y2="240" stroke="#10b981" strokeWidth="4" />

            {/* Tie Breaker (Open) */}
            <line x1="250" y1="350" x2="750" y2="350" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
            <rect x="470" y="330" width="60" height="40" fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
            <text x="478" y="320" fill="#f59e0b" fontSize="10" fontFamily="monospace">BUS COUPLER (OPEN)</text>
            <line x1="485" y1="340" x2="515" y2="360" stroke="#10b981" strokeWidth="4" />

            {/* Transformer feeders */}
            <line x1="250" y1="280" x2="250" y2="400" stroke="#3b82f6" strokeWidth="3" />
            {/* Transformer coils */}
            <circle cx="250" cy="420" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <circle cx="250" cy="450" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <text x="290" y="440" fill="#e2e8f0" fontSize="12">TX-01 (11KV / 415V, 2MVA)</text>

            <line x1="750" y1="280" x2="750" y2="400" stroke="#3b82f6" strokeWidth="3" />
            <circle cx="750" cy="420" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <circle cx="750" cy="450" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <text x="600" y="440" fill="#e2e8f0" fontSize="12">TX-02 (11KV / 415V, 2MVA)</text>

            {/* Secondary Low Voltage Bus */}
            <line x1="100" y1="520" x2="900" y2="520" stroke="#10b981" strokeWidth="5" />
            <text x="110" y="550" fill="#10b981" fontSize="12" fontWeight="bold">LV BUS B (415V MAIN DISTRIBUTION PANEL)</text>

            {/* Grounding System */}
            <line x1="500" y1="520" x2="500" y2="580" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="3,3" />
            <line x1="480" y1="580" x2="520" y2="580" stroke="#cbd5e1" strokeWidth="3" />
            <line x1="487" y1="588" x2="513" y2="588" stroke="#cbd5e1" strokeWidth="3" />
            <line x1="494" y1="596" x2="506" y2="596" stroke="#cbd5e1" strokeWidth="3" />
            <text x="525" y="590" fill="#64748b" fontSize="10" fontFamily="monospace">SOLID GROUNDING</text>
            
            {/* Engineering Legend block */}
            <rect x="700" y="580" width="280" height="100" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <line x1="700" y1="610" x2="980" y2="610" stroke="#1e293b" strokeWidth="1" />
            <text x="710" y="600" fill="#64748b" fontSize="10" fontFamily="monospace">APPROVED BY: ALICE S.</text>
            <text x="710" y="630" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy Engineering Ltd</text>
            <text x="710" y="650" fill="#f8fafc" fontSize="10" fontFamily="monospace">CLIENT REVIEW SUBMISSION</text>
            <text x="710" y="670" fill="#64748b" fontSize="9" fontFamily="monospace">DRAWN BY: BOB J. | DATE: 2026-06-12</text>
          </g>
        );

      case 'electrical_sld_v2':
        return (
          <g>
            {/* Grid Pattern */}
            <rect width="1000" height="700" fill="#030813" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">TRANZENERGY DRAWING CONTROL | SLD INDUSTRIAL FEEDER</text>
            <text x="50" y="75" fill="#10b981" fontSize="12" fontFamily="monospace">DWG CODE: E-SLD-MAIN-001 | REV: V2.0 (CURRENT ACTIVE)</text>
            
            {/* High Voltage Bus Bar 1 */}
            <line x1="100" y1="180" x2="900" y2="180" stroke="#3b82f6" strokeWidth="6" />
            <text x="110" y="165" fill="#3b82f6" fontSize="12" fontWeight="bold">HV BUS A (11KV FEEDER LOOP)</text>

            {/* Incomer Feeder 1 - UPGRADED TO 1200A */}
            <line x1="250" y1="180" x2="250" y2="280" stroke="#3b82f6" strokeWidth="3" />
            <rect x="230" y="210" width="40" height="40" fill="#1e293b" stroke="#10b981" strokeWidth="2" />
            {/* Glowing upgrade notice */}
            <text x="280" y="235" fill="#10b981" fontSize="12" fontWeight="bold" fontFamily="monospace">INCOMER VCB-01 (1200A) [REVISED]</text>
            {/* Closed switch indicator */}
            <line x1="250" y1="215" x2="250" y2="245" stroke="#ef4444" strokeWidth="4" />

            {/* Incomer Feeder 2 - UPGRADED TO 1200A */}
            <line x1="750" y1="180" x2="750" y2="280" stroke="#3b82f6" strokeWidth="3" />
            <rect x="730" y="210" width="40" height="40" fill="#1e293b" stroke="#10b981" strokeWidth="2" />
            <text x="580" y="235" fill="#10b981" fontSize="12" fontWeight="bold" fontFamily="monospace">INCOMER VCB-02 (1200A) [REVISED]</text>
            {/* Open switch indicator */}
            <line x1="740" y1="220" x2="760" y2="240" stroke="#10b981" strokeWidth="4" />

            {/* Tie Breaker (Open) */}
            <line x1="250" y1="350" x2="750" y2="350" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
            <rect x="470" y="330" width="60" height="40" fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
            <text x="478" y="320" fill="#f59e0b" fontSize="10" fontFamily="monospace">BUS COUPLER (OPEN)</text>
            <line x1="485" y1="340" x2="515" y2="360" stroke="#10b981" strokeWidth="4" />

            {/* Transformer feeders */}
            <line x1="250" y1="280" x2="250" y2="400" stroke="#3b82f6" strokeWidth="3" />
            {/* Transformer coils */}
            <circle cx="250" cy="420" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <circle cx="250" cy="450" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <text x="290" y="440" fill="#e2e8f0" fontSize="12">TX-01 (11KV / 415V, 2MVA)</text>

            <line x1="750" y1="280" x2="750" y2="400" stroke="#3b82f6" strokeWidth="3" />
            <circle cx="750" cy="420" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <circle cx="750" cy="450" r="25" fill="none" stroke="#00e5ff" strokeWidth="3" />
            <text x="600" y="440" fill="#e2e8f0" fontSize="12">TX-02 (11KV / 415V, 2MVA)</text>

            {/* Secondary Low Voltage Bus */}
            <line x1="100" y1="520" x2="900" y2="520" stroke="#10b981" strokeWidth="5" />
            <text x="110" y="550" fill="#10b981" fontSize="12" fontWeight="bold">LV BUS B (415V MAIN DISTRIBUTION PANEL)</text>

            {/* Grounding System */}
            <line x1="500" y1="520" x2="500" y2="580" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="3,3" />
            <line x1="480" y1="580" x2="520" y2="580" stroke="#cbd5e1" strokeWidth="3" />
            <line x1="487" y1="588" x2="513" y2="588" stroke="#cbd5e1" strokeWidth="3" />
            <line x1="494" y1="596" x2="506" y2="596" stroke="#cbd5e1" strokeWidth="3" />
            <text x="525" y="590" fill="#64748b" fontSize="10" fontFamily="monospace">SOLID GROUNDING</text>
            
            {/* Version 2 Legend block */}
            <rect x="700" y="580" width="280" height="100" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <line x1="700" y1="610" x2="980" y2="610" stroke="#1e293b" strokeWidth="1" />
            <text x="710" y="600" fill="#10b981" fontSize="10" fontFamily="monospace">APPROVED BY: ALICE S. [APPROVED]</text>
            <text x="710" y="630" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy Engineering Ltd</text>
            <text x="710" y="650" fill="#3b82f6" fontSize="10" fontFamily="monospace">FOR DESIGN RELEASE CONSTRUCT</text>
            <text x="710" y="670" fill="#64748b" fontSize="9" fontFamily="monospace">DRAWN BY: BOB J. | DATE: 2026-07-08</text>
          </g>
        );

      case 'electrical_schematic_v1':
        return (
          <g>
            <rect width="1000" height="700" fill="#040916" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">PANEL WIRING SCHEMATIC | AUXILIARY SWITCHGEAR</text>
            <text x="50" y="75" fill="#64748b" fontSize="12" fontFamily="monospace">DWG CODE: E-SCH-CTRL-002 | REV: V1.0</text>

            {/* Wiring rails */}
            <line x1="80" y1="120" x2="920" y2="120" stroke="#ef4444" strokeWidth="3" />
            <text x="90" y="110" fill="#ef4444" fontSize="11" fontFamily="monospace">DC SOURCE POSITIVE RAIL (+110V DC)</text>
            
            <line x1="80" y1="580" x2="920" y2="580" stroke="#3b82f6" strokeWidth="3" />
            <text x="90" y="600" fill="#3b82f6" fontSize="11" fontFamily="monospace">DC SOURCE NEGATIVE RAIL (0V DC)</text>

            {/* Circuit Branch 1: Indication Lights */}
            <line x1="200" y1="120" x2="200" y2="580" stroke="#cbd5e1" strokeWidth="2" />
            {/* Fuse */}
            <rect x="190" y="150" width="20" height="30" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="220" y="170" fill="#cbd5e1" fontSize="10" fontFamily="monospace">F1 (2A)</text>
            {/* Selector switch */}
            <line x1="200" y1="230" x2="225" y2="255" stroke="#cbd5e1" strokeWidth="3" />
            <circle cx="200" cy="230" r="3" fill="#cbd5e1" />
            <circle cx="200" cy="260" r="3" fill="#cbd5e1" />
            <text x="225" y="245" fill="#cbd5e1" fontSize="10" fontFamily="monospace">SS1 (ON/OFF)</text>
            {/* Pilot Red Lamp */}
            <circle cx="200" cy="380" r="20" fill="#0f172a" stroke="#ef4444" strokeWidth="3" />
            <line x1="186" y1="366" x2="214" y2="394" stroke="#ef4444" strokeWidth="2" />
            <line x1="186" y1="394" x2="214" y2="366" stroke="#ef4444" strokeWidth="2" />
            <text x="230" y="385" fill="#ef4444" fontSize="11" fontWeight="bold">TRIP RED LAMP</text>

            {/* Circuit Branch 2: Relay Circuit */}
            <line x1="500" y1="120" x2="500" y2="580" stroke="#cbd5e1" strokeWidth="2" />
            {/* Fuse */}
            <rect x="490" y="150" width="20" height="30" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="520" y="170" fill="#cbd5e1" fontSize="10" fontFamily="monospace">F2 (6A)</text>
            {/* Relay contact NO */}
            <line x1="500" y1="230" x2="500" y2="245" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="500" y1="265" x2="500" y2="280" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="490" y1="245" x2="510" y2="245" stroke="#00e5ff" strokeWidth="3" />
            <line x1="490" y1="265" x2="510" y2="265" stroke="#00e5ff" strokeWidth="3" />
            <text x="525" y="260" fill="#00e5ff" fontSize="10" fontFamily="monospace">52a (CB AUX CONTACT)</text>
            {/* Relay Coil */}
            <rect x="480" y="360" width="40" height="50" fill="#0f172a" stroke="#cbd5e1" strokeWidth="3" />
            <line x1="480" y1="360" x2="520" y2="410" stroke="#cbd5e1" strokeWidth="2" />
            <text x="535" y="390" fill="#cbd5e1" fontSize="11" fontWeight="bold">86 (LOCKOUT COIL)</text>

            {/* Circuit Branch 3: Alarm Bell */}
            <line x1="800" y1="120" x2="800" y2="580" stroke="#cbd5e1" strokeWidth="2" />
            {/* Relay Contact NC */}
            <line x1="800" y1="230" x2="800" y2="280" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="790" y1="245" x2="810" y2="245" stroke="#cbd5e1" strokeWidth="3" />
            <line x1="790" y1="265" x2="810" y2="265" stroke="#cbd5e1" strokeWidth="3" />
            <line x1="785" y1="268" x2="815" y2="242" stroke="#cbd5e1" strokeWidth="2" />
            <text x="825" y="260" fill="#cbd5e1" fontSize="10" fontFamily="monospace">86-1 (LOCKOUT CONTACT NC)</text>
            {/* Alarm buzzer */}
            <polygon points="800,360 770,390 830,390" fill="#0f172a" stroke="#f59e0b" strokeWidth="3" />
            <line x1="800" y1="390" x2="800" y2="410" stroke="#cbd5e1" strokeWidth="2" />
            <text x="840" y="385" fill="#f59e0b" fontSize="11" fontWeight="bold">ALARM HORN</text>

            {/* Block Legend */}
            <rect x="700" y="605" width="280" height="80" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="710" y="625" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy Engineering Ltd</text>
            <text x="710" y="645" fill="#cbd5e1" fontSize="10" fontFamily="monospace">DC SHUNT TRIP TERMINALS SCHEMATIC</text>
            <text x="710" y="665" fill="#64748b" fontSize="9" fontFamily="monospace">DRAWN BY: BOB J. | REV DATE: 2026-07-02</text>
          </g>
        );

      case 'civil_layout_v1':
        return (
          <g>
            <rect width="1000" height="700" fill="#02090b" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">INDUSTRIAL SITE MASTER PLAN LAYOUT</text>
            <text x="50" y="75" fill="#64748b" fontSize="12" fontFamily="monospace">DWG CODE: C-LAY-SITE-101 | REV: V1.0 (OLD VERSION)</text>

            {/* Boundary Limit */}
            <rect x="100" y="120" width="800" height="460" fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray="8,4" />
            <text x="110" y="140" fill="#ef4444" fontSize="11" fontWeight="bold">BATTERY LIMIT / PLOT BOUNDARY</text>

            {/* Main Warehouse structure */}
            <rect x="150" y="180" width="450" height="280" fill="#0c1d24" stroke="#00e5ff" strokeWidth="3" />
            <text x="170" y="210" fill="#00e5ff" fontSize="14" fontWeight="bold">MAIN PROCESS WAREHOUSE UNIT A</text>

            {/* Utility setback space */}
            <rect x="630" y="180" width="220" height="150" fill="none" stroke="#cbd5e1" strokeWidth="2" />
            <text x="640" y="210" fill="#cbd5e1" fontSize="12">TRANSFORMER BAY BLOCK B</text>

            {/* Access Roadway - RADIUS WARNING ISSUE */}
            <path d="M 100,530 L 700,530 C 730,530 750,510 750,480 L 750,330" fill="none" stroke="#f59e0b" strokeWidth="30" strokeLinecap="round" opacity="0.4" />
            <path d="M 100,530 L 700,530 C 730,530 750,510 750,480 L 750,330" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" strokeLinecap="round" />
            <text x="120" y="535" fill="#f8fafc" fontSize="10" fontWeight="bold">SITE INCOMING ACCESS ROAD (4.0m WIDE)</text>
            <text x="680" y="560" fill="#f59e0b" fontSize="10" fontFamily="monospace">WARNING: 2.5m Setback radius check needed</text>

            {/* Layout coordinates anchor indicators */}
            <circle cx="100" cy="120" r="6" fill="#ef4444" />
            <text x="115" y="125" fill="#cbd5e1" fontSize="10">N 1205.42 E 4850.11</text>
            
            <circle cx="900" cy="580" r="6" fill="#ef4444" />
            <text x="770" y="595" fill="#cbd5e1" fontSize="10">N 1665.42 E 5650.11</text>

            {/* Block Legend */}
            <rect x="680" y="600" width="300" height="90" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="690" y="620" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy Civil Engineering</text>
            <text x="690" y="640" fill="#f8fafc" fontSize="10" fontFamily="monospace">GENERAL SITE ROADWAYS LAYOUT</text>
            <text x="690" y="660" fill="#64748b" fontSize="9" fontFamily="monospace">APPROVED BY: ALICE S. | DRAWN BY: CHARLIE C.</text>
          </g>
        );

      case 'civil_layout_v2':
        return (
          <g>
            <rect width="1000" height="700" fill="#02090b" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">INDUSTRIAL SITE MASTER PLAN LAYOUT</text>
            <text x="50" y="75" fill="#10b981" fontSize="12" fontFamily="monospace">DWG CODE: C-LAY-SITE-101 | REV: V1.1 (CURRENT ACTIVE)</text>

            {/* Boundary Limit */}
            <rect x="100" y="120" width="800" height="460" fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray="8,4" />
            <text x="110" y="140" fill="#ef4444" fontSize="11" fontWeight="bold">BATTERY LIMIT / PLOT BOUNDARY</text>

            {/* Main Warehouse structure */}
            <rect x="150" y="180" width="450" height="280" fill="#0c1d24" stroke="#00e5ff" strokeWidth="3" />
            <text x="170" y="210" fill="#00e5ff" fontSize="14" fontWeight="bold">MAIN PROCESS WAREHOUSE UNIT A</text>

            {/* Utility setback space */}
            <rect x="630" y="180" width="220" height="150" fill="none" stroke="#cbd5e1" strokeWidth="2" />
            <text x="640" y="210" fill="#cbd5e1" fontSize="12">TRANSFORMER BAY BLOCK B</text>

            {/* Access Roadway - REVISED WITH RADIUS CLEARANCE */}
            <path d="M 100,530 L 640,530 C 685,530 710,505 710,460 L 710,330" fill="none" stroke="#10b981" strokeWidth="32" strokeLinecap="round" opacity="0.4" />
            <path d="M 100,530 L 640,530 C 685,530 710,505 710,460 L 710,330" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" strokeLinecap="round" />
            <text x="120" y="535" fill="#f8fafc" fontSize="10" fontWeight="bold">SITE INCOMING ACCESS ROAD (4.5m WIDE) [REVISED]</text>
            {/* Green confirmation node */}
            <text x="660" y="560" fill="#10b981" fontSize="11" fontWeight="bold" fontFamily="monospace">CLEARED: 4.5m Setback curve radius resolved</text>

            {/* Layout coordinates anchor indicators */}
            <circle cx="100" cy="120" r="6" fill="#ef4444" />
            <text x="115" y="125" fill="#cbd5e1" fontSize="10">N 1205.42 E 4850.11</text>
            
            <circle cx="900" cy="580" r="6" fill="#ef4444" />
            <text x="770" y="595" fill="#cbd5e1" fontSize="10">N 1665.42 E 5650.11</text>

            {/* Block Legend */}
            <rect x="680" y="600" width="300" height="90" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="690" y="620" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy Civil Engineering</text>
            <text x="690" y="640" fill="#10b981" fontSize="10" fontFamily="monospace">REVISED MASTER SETBACK ROADWAYS PLAN</text>
            <text x="690" y="660" fill="#64748b" fontSize="9" fontFamily="monospace">APPROVED BY: ALICE S. | DRAWN BY: CHARLIE C. | 2026-07-05</text>
          </g>
        );

      case 'civil_foundation_v1':
        return (
          <g>
            <rect width="1000" height="700" fill="#090e0c" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">RCC FOUNDATION STRUCTURAL STEEL REBAR DETAILS</text>
            <text x="50" y="75" fill="#64748b" fontSize="12" fontFamily="monospace">DWG CODE: C-FND-FND-202 | REV: V1.0</text>

            {/* Main structural cross section rectangle */}
            <rect x="150" y="150" width="700" height="360" fill="#141f1a" stroke="#00e5ff" strokeWidth="4" />
            <text x="170" y="180" fill="#00e5ff" fontSize="13" fontWeight="bold">PAD FOOTING - SECTIONAL ELEVATION VIEW</text>

            {/* Rebar grid horizontal */}
            <line x1="180" y1="460" x2="820" y2="460" stroke="#ef4444" strokeWidth="4" />
            <line x1="180" y1="440" x2="820" y2="440" stroke="#cbd5e1" strokeWidth="1" />
            <line x1="180" y1="420" x2="820" y2="420" stroke="#cbd5e1" strokeWidth="1" />
            <line x1="180" y1="400" x2="820" y2="400" stroke="#cbd5e1" strokeWidth="1" />
            
            {/* Rebar dots vertical */}
            <circle cx="200" cy="460" r="5" fill="#ef4444" />
            <circle cx="250" cy="460" r="5" fill="#ef4444" />
            <circle cx="300" cy="460" r="5" fill="#ef4444" />
            <circle cx="350" cy="460" r="5" fill="#ef4444" />
            <circle cx="400" cy="460" r="5" fill="#ef4444" />
            <circle cx="450" cy="460" r="5" fill="#ef4444" />
            <circle cx="500" cy="460" r="5" fill="#ef4444" />
            <circle cx="550" cy="460" r="5" fill="#ef4444" />
            <circle cx="600" cy="460" r="5" fill="#ef4444" />
            <circle cx="650" cy="460" r="5" fill="#ef4444" />
            <circle cx="700" cy="460" r="5" fill="#ef4444" />
            <circle cx="750" cy="460" r="5" fill="#ef4444" />
            <circle cx="800" cy="460" r="5" fill="#ef4444" />

            <text x="210" y="490" fill="#ef4444" fontSize="11" fontFamily="monospace">BOTTOM REBAR MESH: T16 @ 150mm C/C SPACING</text>

            {/* Anchor bolts */}
            <line x1="380" y1="100" x2="380" y2="280" stroke="#cbd5e1" strokeWidth="6" />
            <line x1="380" y1="280" x2="410" y2="300" stroke="#cbd5e1" strokeWidth="6" />
            <line x1="620" y1="100" x2="620" y2="280" stroke="#cbd5e1" strokeWidth="6" />
            <line x1="620" y1="280" x2="650" y2="300" stroke="#cbd5e1" strokeWidth="6" />
            <text x="420" y="115" fill="#cbd5e1" fontSize="11">HD HOLDING ANCHOR BOLTS (M36, GRADE 8.8)</text>

            {/* Ground Level line */}
            <line x1="80" y1="220" x2="150" y2="220" stroke="#10b981" strokeWidth="2" />
            <line x1="850" y1="220" x2="920" y2="220" stroke="#10b981" strokeWidth="2" />
            <text x="90" y="210" fill="#10b981" fontSize="10" fontWeight="bold">FINISHED GROUND LEVEL (FGL)</text>

            {/* Legend block */}
            <rect x="680" y="605" width="300" height="80" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="690" y="625" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy Civil Designs</text>
            <text x="690" y="645" fill="#cbd5e1" fontSize="10" fontFamily="monospace">TRANSFORMER TYPICAL FOUNDATION DETAIL</text>
            <text x="690" y="665" fill="#64748b" fontSize="9" fontFamily="monospace">CONCRETE SPEC: GRADE M30 (1:1.5:3 MIX)</text>
          </g>
        );

      case 'scada_v1':
        return (
          <g>
            <rect width="1000" height="700" fill="#040713" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">SCADA TELEMETRY NETWORK TOPOLOGY</text>
            <text x="50" y="75" fill="#64748b" fontSize="12" fontFamily="monospace">DWG CODE: S-TOP-SYS-001 | REV: V1.0 (OLD VERSION)</text>

            {/* Control room server */}
            <rect x="420" y="150" width="160" height="80" fill="#0f172a" stroke="#3b82f6" strokeWidth="3" />
            <text x="440" y="195" fill="#3b82f6" fontSize="12" fontWeight="bold">CENTRAL SCADA HMI</text>
            <text x="440" y="215" fill="#cbd5e1" fontSize="10" fontFamily="monospace">IP: 192.168.10.10</text>

            {/* Central Network Switch */}
            <rect x="440" y="290" width="120" height="50" fill="#0f172a" stroke="#00e5ff" strokeWidth="2" />
            <text x="450" y="320" fill="#00e5ff" fontSize="11" fontFamily="monospace">ETHERNET SWITCH 01</text>

            {/* Connections to field RTUs */}
            <line x1="500" y1="230" x2="500" y2="290" stroke="#00e5ff" strokeWidth="3" />

            <line x1="440" y1="315" x2="200" y2="450" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="500" y1="340" x2="500" y2="450" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="560" y1="315" x2="800" y2="450" stroke="#cbd5e1" strokeWidth="2" />

            {/* RTU Cabinets */}
            <rect x="120" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="135" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 01</text>
            <text x="135" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Substation Yard</text>

            <rect x="420" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="435" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 02</text>
            <text x="435" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Pump House</text>

            <rect x="720" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="735" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 03</text>
            <text x="735" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Main Warehouse</text>

            {/* Legend block */}
            <rect x="700" y="605" width="280" height="80" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="710" y="625" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy SCADA & Control</text>
            <text x="710" y="645" fill="#cbd5e1" fontSize="10" fontFamily="monospace">ETHERNET MODBUS NETWORK TOPOLOGY</text>
            <text x="710" y="665" fill="#64748b" fontSize="9" fontFamily="monospace">DRAWN BY: ALICE S. | COORD DATE: 2026-06-10</text>
          </g>
        );

      case 'scada_v2':
        return (
          <g>
            <rect width="1000" height="700" fill="#040713" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">SCADA TELEMETRY NETWORK TOPOLOGY</text>
            <text x="50" y="75" fill="#64748b" fontSize="12" fontFamily="monospace">DWG CODE: S-TOP-SYS-001 | REV: V1.1 (OLD VERSION)</text>

            {/* Control room server */}
            <rect x="420" y="150" width="160" height="80" fill="#0f172a" stroke="#3b82f6" strokeWidth="3" />
            <text x="440" y="195" fill="#3b82f6" fontSize="12" fontWeight="bold">CENTRAL SCADA HMI</text>
            <text x="440" y="215" fill="#cbd5e1" fontSize="10" fontFamily="monospace">IP: 192.168.10.10</text>

            {/* Central Network Switch - REDUNDANT INTEGRATED SWITCHES */}
            <rect x="360" y="290" width="130" height="50" fill="#0f172a" stroke="#00e5ff" strokeWidth="2" />
            <text x="370" y="320" fill="#00e5ff" fontSize="11" fontFamily="monospace">SWITCH A (PRIMARY)</text>

            <rect x="510" y="290" width="130" height="50" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
            <text x="520" y="320" fill="#10b981" fontSize="11" fontFamily="monospace">SWITCH B (BACKUP)</text>

            {/* Primary / Backup Links */}
            <line x1="450" y1="230" x2="430" y2="290" stroke="#00e5ff" strokeWidth="2" />
            <line x1="550" y1="230" x2="570" y2="290" stroke="#10b981" strokeWidth="2" />

            {/* Network loop redundancy paths */}
            <line x1="360" y1="315" x2="200" y2="450" stroke="#00e5ff" strokeWidth="2" />
            <line x1="640" y1="315" x2="800" y2="450" stroke="#10b981" strokeWidth="2" />
            
            <line x1="430" y1="340" x2="430" y2="450" stroke="#00e5ff" strokeWidth="2" />
            <line x1="570" y1="340" x2="570" y2="450" stroke="#10b981" strokeWidth="2" />

            {/* RTU Cabinets */}
            <rect x="120" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="135" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 01</text>
            <text x="135" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Substation Yard</text>

            <rect x="420" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="435" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 02</text>
            <text x="435" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Pump House</text>

            <rect x="720" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="735" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 03</text>
            <text x="735" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Main Warehouse</text>

            {/* Legend block */}
            <rect x="700" y="605" width="280" height="80" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="710" y="625" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy SCADA & Control</text>
            <text x="710" y="645" fill="#10b981" fontSize="10" fontFamily="monospace">REDUNDANT FIBRE NETWORK TOPOLOGY</text>
            <text x="710" y="665" fill="#64748b" fontSize="9" fontFamily="monospace">DRAWN BY: ALICE S. | REVISED: 2026-06-30</text>
          </g>
        );

      case 'scada_v3':
        return (
          <g>
            <rect width="1000" height="700" fill="#040713" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#00e5ff" fontSize="18" fontWeight="800" fontFamily="monospace">SCADA TELEMETRY NETWORK TOPOLOGY</text>
            <text x="50" y="75" fill="#10b981" fontSize="12" fontFamily="monospace">DWG CODE: S-TOP-SYS-001 | REV: V1.2 (CURRENT ACTIVE)</text>

            {/* Cellular LTE Gateway block - NEW IN V1.2 */}
            <rect x="180" y="150" width="160" height="85" fill="#0a1b24" stroke="#00ffff" strokeWidth="2" />
            <line x1="260" y1="150" x2="260" y2="100" stroke="#00ffff" strokeWidth="3" />
            <line x1="250" y1="100" x2="270" y2="100" stroke="#00ffff" strokeWidth="3" />
            <line x1="240" y1="90" x2="280" y2="90" stroke="#00ffff" strokeWidth="2" />
            <text x="195" y="185" fill="#00ffff" fontSize="11" fontWeight="bold">CELLULAR LTE GATEWAY</text>
            <text x="195" y="205" fill="#cbd5e1" fontSize="9" fontFamily="monospace">FAILOVER: IP 10.155.4.12</text>
            <path d="M 260,235 L 420,315" stroke="#00ffff" strokeWidth="2" strokeDasharray="3,3" />

            {/* Control room server */}
            <rect x="420" y="150" width="160" height="80" fill="#0f172a" stroke="#3b82f6" strokeWidth="3" />
            <text x="440" y="195" fill="#3b82f6" fontSize="12" fontWeight="bold">CENTRAL SCADA HMI</text>
            <text x="440" y="215" fill="#cbd5e1" fontSize="10" fontFamily="monospace">IP: 192.168.10.10</text>

            {/* Central Network Switch - REDUNDANT INTEGRATED SWITCHES */}
            <rect x="360" y="290" width="130" height="50" fill="#0f172a" stroke="#00e5ff" strokeWidth="2" />
            <text x="370" y="320" fill="#00e5ff" fontSize="11" fontFamily="monospace">SWITCH A (PRIMARY)</text>

            <rect x="510" y="290" width="130" height="50" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
            <text x="520" y="320" fill="#10b981" fontSize="11" fontFamily="monospace">SWITCH B (BACKUP)</text>

            {/* Primary / Backup Links */}
            <line x1="450" y1="230" x2="430" y2="290" stroke="#00e5ff" strokeWidth="2" />
            <line x1="550" y1="230" x2="570" y2="290" stroke="#10b981" strokeWidth="2" />

            {/* Network loop redundancy paths */}
            <line x1="360" y1="315" x2="200" y2="450" stroke="#00e5ff" strokeWidth="2" />
            <line x1="640" y1="315" x2="800" y2="450" stroke="#10b981" strokeWidth="2" />
            
            <line x1="430" y1="340" x2="430" y2="450" stroke="#00e5ff" strokeWidth="2" />
            <line x1="570" y1="340" x2="570" y2="450" stroke="#10b981" strokeWidth="2" />

            {/* RTU Cabinets */}
            <rect x="120" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="135" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 01</text>
            <text x="135" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Substation Yard</text>

            <rect x="420" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="435" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 02</text>
            <text x="435" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Pump House</text>

            <rect x="720" y="450" width="160" height="90" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <text x="735" y="490" fill="#f8fafc" fontSize="11" fontWeight="bold">FIELD PLC CABINET - 03</text>
            <text x="735" y="510" fill="#64748b" fontSize="10" fontFamily="monospace">Location: Main Warehouse</text>

            {/* Legend block */}
            <rect x="700" y="605" width="280" height="80" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="710" y="625" fill="#00e5ff" fontSize="11" fontFamily="monospace">Tranzenergy SCADA & Control</text>
            <text x="710" y="645" fill="#10b981" fontSize="10" fontFamily="monospace">REDUNDANT FIBRE & LTE GATEWAY SYSTEM</text>
            <text x="710" y="665" fill="#64748b" fontSize="9" fontFamily="monospace">DRAWN BY: ALICE S. | REVISED: 2026-07-09</text>
          </g>
        );

      case 'firefighting_v1':
        return (
          <g>
            <rect width="1000" height="700" fill="#0b0404" stroke="#1e293b" strokeWidth="2" />
            <text x="50" y="50" fill="#ef4444" fontSize="18" fontWeight="800" fontFamily="monospace">FIRE PROTECTION WATER PIPING NETWORKS PLAN</text>
            <text x="50" y="75" fill="#64748b" fontSize="12" fontFamily="monospace">DWG CODE: F-LAY-HYD-501 | REV: V1.0</text>

            {/* Main supply loop ring */}
            <rect x="150" y="150" width="700" height="400" fill="none" stroke="#ef4444" strokeWidth="4" />
            <text x="170" y="140" fill="#ef4444" fontSize="11" fontWeight="bold">6-INCH MAIN WET HYDRANT LOOP</text>

            {/* Distribution pump station */}
            <rect x="420" y="470" width="160" height="78" fill="#1a0d0d" stroke="#ef4444" strokeWidth="2" />
            <text x="435" y="505" fill="#ef4444" fontSize="11" fontWeight="bold">FIRE WATER PUMP STATION</text>
            <text x="435" y="525" fill="#cbd5e1" fontSize="9" fontFamily="monospace">CAP: 2500 GPM @ 10 BAR</text>

            {/* Sprinkler pipes horizontal */}
            <line x1="200" y1="230" x2="800" y2="230" stroke="#ef4444" strokeWidth="2" />
            <line x1="200" y1="310" x2="800" y2="310" stroke="#ef4444" strokeWidth="2" />
            <line x1="200" y1="390" x2="800" y2="390" stroke="#ef4444" strokeWidth="2" />

            {/* Sprinkler head nodes and sprinkler ranges */}
            {/* Row 1 */}
            <circle cx="250" cy="230" r="40" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
            <circle cx="250" cy="230" r="4" fill="#f59e0b" />
            
            <circle cx="450" cy="230" r="40" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
            <circle cx="450" cy="230" r="4" fill="#f59e0b" />
            
            <circle cx="650" cy="230" r="40" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
            <circle cx="650" cy="230" r="4" fill="#f59e0b" />
            
            {/* Row 2 */}
            <circle cx="350" cy="310" r="40" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
            <circle cx="350" cy="310" r="4" fill="#f59e0b" />
            
            <circle cx="550" cy="310" r="40" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
            <circle cx="550" cy="310" r="4" fill="#f59e0b" />
            
            <circle cx="750" cy="310" r="40" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
            <circle cx="750" cy="310" r="4" fill="#f59e0b" />

            <text x="210" y="215" fill="#f59e0b" fontSize="9" fontFamily="monospace">TYPICAL PENDENT SPRINKLER COVERAGE (R=3.0m)</text>

            {/* Gate Valves */}
            <polygon points="150,250 140,270 160,270" fill="#ef4444" />
            <polygon points="150,290 140,270 160,270" fill="#ef4444" />
            <text x="80" y="275" fill="#cbd5e1" fontSize="9" fontFamily="monospace">GV-01 (N.O.)</text>

            <polygon points="850,250 840,270 860,270" fill="#ef4444" />
            <polygon points="850,290 840,270 860,270" fill="#ef4444" />
            <text x="870" y="275" fill="#cbd5e1" fontSize="9" fontFamily="monospace">GV-02 (N.O.)</text>

            {/* Legend block */}
            <rect x="700" y="605" width="280" height="80" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            <text x="710" y="625" fill="#ef4444" fontSize="11" fontFamily="monospace">Tranzenergy Fire Safety Dept</text>
            <text x="710" y="645" fill="#cbd5e1" fontSize="10" fontFamily="monospace">AUTOMATIC SPRINKLER GRID LAYOUT</text>
            <text x="710" y="665" fill="#64748b" fontSize="9" fontFamily="monospace">APPROVED DESIGN TO NFPA 13 STANDARDS</text>
          </g>
        );

      default:
        return (
          <g>
            <rect width="1000" height="700" fill="#02050c" stroke="#1e293b" strokeWidth="2" />
            <line x1="0" y1="0" x2="1000" y2="700" stroke="rgba(59, 130, 246, 0.15)" strokeWidth="1" />
            <line x1="1000" y1="0" x2="0" y2="700" stroke="rgba(59, 130, 246, 0.15)" strokeWidth="1" />
            <text x="500" y="330" textAnchor="middle" fill="#00e5ff" fontSize="24" fontWeight="bold">ENGINEERING SHEET PREVIEW</text>
            <text x="500" y="370" textAnchor="middle" fill="#64748b" fontSize="14">No custom layout map available for this file node.</text>
            <rect x="400" y="400" width="200" height="60" fill="none" stroke="#3b82f6" strokeWidth="2" />
            <text x="500" y="435" textAnchor="middle" fill="#3b82f6" fontSize="13" fontWeight="bold">CODE: {svgType || 'GENERIC'}</text>
          </g>
        );
    }
  };

  return (
    <div className="workspace-canvas-container" ref={containerRef}>
      {/* Blueprint header toolbar */}
      <div className="canvas-toolbar">
        <div className="canvas-info">
          <Move size={16} className="text-muted" />
          <span className="canvas-title">Interactive CAD Blueprint Viewer</span>
          {activeSelectedVersion && (
            <span className="badge badge-blue">Inspecting revision: {activeSelectedVersion}</span>
          )}
        </div>
        
        <div className="canvas-tools-group">
          <button 
            className="canvas-tool-btn" 
            onClick={zoomOut}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          
          <span className="zoom-level-indicator">
            {Math.round(zoom * 100)}%
          </span>
          
          <button 
            className="canvas-tool-btn" 
            onClick={zoomIn}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          
          <button 
            className="canvas-tool-btn" 
            onClick={resetZoom}
            title="Reset Zoom"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Markup Mode indicator banner */}
      {isMarkupMode && (
        <div className="markup-banner">
          <MessageSquare size={16} />
          <span>Markup Mode Active. Click anywhere on the drawing layout to place a comment pin.</span>
        </div>
      )}

      {/* The actual Zoom/Pan Viewport */}
      <div 
        className={`canvas-viewport ${isDragging ? 'grabbing' : ''} ${isMarkupMode ? 'markup-mode' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div 
          className="canvas-svg-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: '1000px',
            height: '700px',
            position: 'relative'
          }}
          onClick={handleCanvasClick}
        >
          {/* Main Drawing SVG */}
          <svg viewBox="0 0 1000 700" width="100%" height="100%" style={{ pointerEvents: 'none', display: 'block' }}>
            {renderSVGContent()}
          </svg>

          {/* Coordinate Overlay Pins */}
          {pins.map(pin => {
            if (pin.resolved) return null; // Hide resolved pins on the sheet
            
            const isActive = pin.id === activePinId;
            return (
              <div
                key={pin.id}
                className={`markup-pin ${isActive ? 'active' : ''}`}
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y}%`
                }}
                onClick={(e) => {
                  e.stopPropagation(); // Avoid triggering canvas click handler
                  if (onPinClick) onPinClick(pin.id);
                }}
                title={`Pin #${pin.label}: Click to view comments`}
              >
                {pin.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
