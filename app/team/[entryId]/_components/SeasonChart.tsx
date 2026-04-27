// Hand-rolled SVG line chart. No client JS — renders fully on the server.

export type Series = {
  label: string;
  color: string;
  data: (number | null)[];
  dashed?: boolean;
};

type Props = {
  series: Series[];
  xLabels: string[];     // length must match series[i].data length
  yLabel?: string;
  yFormatter?: (v: number) => string;
  width?: number;
  height?: number;
};

export function SeasonChart({
  series,
  xLabels,
  yLabel,
  yFormatter = (v) => String(Math.round(v)),
  width = 800,
  height = 360,
}: Props) {
  const W = width;
  const H = height;
  const PAD = { top: 40, right: 16, bottom: 40, left: 56 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;
  const n = xLabels.length;

  const flat = series.flatMap((s) => s.data.filter((v): v is number => v != null));
  const max = flat.length ? Math.max(...flat, 0) : 10;
  const min = flat.length ? Math.min(...flat, 0) : 0;
  const span = max - min || 1;
  // Add 5% headroom so the top line isn't kissing the upper border
  const padded = span * 0.05;
  const yMax = max + padded;
  const yMin = min < 0 ? min - padded : min;
  const ySpan = yMax - yMin || 1;

  const x = (i: number) => PAD.left + (cw * i) / Math.max(n - 1, 1);
  const y = (v: number) => PAD.top + ch - (ch * (v - yMin)) / ySpan;

  // 5 horizontal grid lines
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * ySpan);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      {/* Y axis grid + labels */}
      {yTicks.map((tickVal, i) => {
        const py = y(tickVal);
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={py}
              y2={py}
              stroke="rgba(0,0,0,0.12)"
              strokeDasharray="3 4"
            />
            <text x={PAD.left - 8} y={py + 4} fontSize="11" textAnchor="end" fill="#0a0a0a">
              {yFormatter(tickVal)}
            </text>
          </g>
        );
      })}

      {/* Y axis label */}
      {yLabel && (
        <text
          x={14}
          y={PAD.top + ch / 2}
          fontSize="10"
          fill="#0a0a0a"
          textAnchor="middle"
          transform={`rotate(-90, 14, ${PAD.top + ch / 2})`}
          style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}
        >
          {yLabel}
        </text>
      )}

      {/* Zero reference line if axis straddles 0 */}
      {yMin < 0 && yMax > 0 && (
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(0)}
          y2={y(0)}
          stroke="#0a0a0a"
          strokeWidth="1.5"
        />
      )}

      {/* Axes */}
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#0a0a0a" strokeWidth="2" />
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#0a0a0a" strokeWidth="2" />

      {/* X tick labels every 5 GWs + first/last */}
      {xLabels.map((lab, i) => {
        const showLabel = i === 0 || i === n - 1 || (i + 1) % 5 === 0;
        if (!showLabel) return null;
        return (
          <text
            key={i}
            x={x(i)}
            y={H - PAD.bottom + 16}
            fontSize="10"
            textAnchor="middle"
            fill="#0a0a0a"
          >
            {lab}
          </text>
        );
      })}

      {/* Lines */}
      {series.map((s) => {
        const segments: string[] = [];
        let current: string[] = [];
        s.data.forEach((v, i) => {
          if (v == null) {
            if (current.length) segments.push(current.join(" "));
            current = [];
          } else {
            current.push(`${current.length === 0 ? "M" : "L"} ${x(i)} ${y(v)}`);
          }
        });
        if (current.length) segments.push(current.join(" "));
        return (
          <g key={s.label}>
            <path
              d={segments.join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeDasharray={s.dashed ? "6 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dots on actual data points so single-point series are visible */}
            {s.data.map((v, i) =>
              v == null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={s.color} />
              ),
            )}
          </g>
        );
      })}

      {/* Legend, top-left under header */}
      <g transform={`translate(${PAD.left}, 18)`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(${i * 180}, 0)`}>
            <line
              x1={0}
              y1={6}
              x2={20}
              y2={6}
              stroke={s.color}
              strokeWidth="3"
              strokeDasharray={s.dashed ? "4 3" : undefined}
            />
            <text x={26} y={10} fontSize="11" fontWeight="700" fill="#0a0a0a">
              {s.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
