// Gold line ornaments from the design handoff. Placement rules: field-row arcs only in the splash
// footer, step headers and language-screen corner; knot-and-petal ring only after mutual acceptance.

export function SplashArcs() {
  return (
    <svg viewBox="0 0 390 250" preserveAspectRatio="none" fill="none" stroke="#C99A42" strokeWidth="1" opacity="0.32" aria-hidden="true">
      <circle cx="300" cy="40" r="22" />
      {[[58, 34], [74, 46], [94, 60], [120, 78], [152, 100], [192, 128], [242, 162]].map(([y, c]) => (
        <path key={y} d={`M0 ${y} Q195 ${c} 390 ${y}`} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

export function HeaderArcs() {
  return (
    <svg className="arcs" width="220" height="120" viewBox="0 0 220 120" fill="none" stroke="#C99A42" strokeWidth="1" opacity="0.4" aria-hidden="true">
      <path d="M0 120 Q110 60 220 70" /><path d="M30 120 Q120 74 220 88" /><path d="M70 120 Q140 90 220 104" /><path d="M110 120 Q160 106 220 116" />
    </svg>
  );
}

export function CornerArcs() {
  return (
    <svg className="corner-arcs" width="150" height="150" viewBox="0 0 150 150" fill="none" stroke="#C99A42" strokeWidth="1" opacity="0.5" aria-hidden="true">
      <path d="M150 20 Q90 30 70 0" /><path d="M150 44 Q76 52 50 0" /><path d="M150 70 Q62 74 30 0" /><path d="M118 96c10-4 18-12 20-24c-12 2-20 10-20 24z" />
    </svg>
  );
}

/** Dashed bond — the bond is not yet mutual (M15). */
export function PendingBond() {
  return (
    <svg width="120" height="28" viewBox="0 0 120 28" fill="none" stroke="#C99A42" strokeWidth="1.2" aria-hidden="true">
      <path d="M0 14h46" /><path d="M74 14h46" /><path d="M60 4c4 4 4 10 0 14c-4-4-4-10 0-14z" /><circle cx="60" cy="14" r="12" strokeDasharray="2 3" />
    </svg>
  );
}

/** Knot-and-petal ring — shown only after both candidates accept (M17). */
export function KnotRing() {
  return (
    <svg width="132" height="64" viewBox="0 0 132 64" fill="none" stroke="#C99A42" strokeWidth="1.3" aria-hidden="true">
      <circle cx="50" cy="34" r="22" /><circle cx="82" cy="34" r="22" /><path d="M66 2c5 5 5 12 0 17c-5-5-5-12 0-17z" />
      <path d="M6 34h22" /><path d="M104 34h22" /><circle cx="4" cy="34" r="2" fill="#C99A42" /><circle cx="128" cy="34" r="2" fill="#C99A42" />
    </svg>
  );
}

/** Small leaf arch beside the meeting title (M19). */
export function LeafArch() {
  return (
    <svg style={{ position: 'absolute', right: 0, top: -6 }} width="72" height="56" viewBox="0 0 72 56" fill="none" stroke="#C99A42" strokeWidth="1" opacity="0.7" aria-hidden="true">
      <path d="M4 56V30a32 26 0 0 1 64 0v26" /><path d="M36 4c4 3 4 8 0 11c-4-3-4-8 0-11z" />
    </svg>
  );
}
