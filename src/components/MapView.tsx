import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MapData } from '../lib/types';

export type ItemState = 'idle' | 'target' | 'found' | 'partial' | 'missed' | 'wrong' | 'hint';

interface Props {
  map: MapData;
  states: Record<string, ItemState>;
  /** Show items that have no state (as plain land / plain rivers). */
  showIdle?: boolean;
  labels?: Record<string, boolean>;
  onTap?: (id: string) => void;
  /** Ids that react to taps; defaults to all drawn items. */
  tappable?: (id: string) => boolean;
}

const FILL: Record<ItemState, string> = {
  idle: 'var(--map-land)',
  target: 'var(--red)',
  found: 'var(--teal)',
  partial: 'var(--yellow)',
  missed: 'var(--red)',
  wrong: 'var(--orange)',
  hint: 'var(--red)',
};
const ORDER: ItemState[] = ['idle', 'found', 'partial', 'missed', 'target', 'wrong', 'hint'];

interface View {
  k: number;
  x: number;
  y: number;
}

export default function MapView({ map, states, showIdle = true, labels, onTap, tappable }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [pxPerUnit, setPxPerUnit] = useState(1);
  const { w, h } = map;

  useLayoutEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPxPerUnit(Math.min(r.width / w, r.height / h) || 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  const clamp = useCallback(
    (v: View): View => {
      const k = Math.min(16, Math.max(1, v.k));
      return { k, x: Math.min(0, Math.max(w - w * k, v.x)), y: Math.min(0, Math.max(h - h * k, v.y)) };
    },
    [w, h],
  );

  /** Screen point → viewBox coordinates. */
  const toLocal = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const s = Math.min(r.width / w, r.height / h);
    return { x: (cx - r.left - (r.width - w * s) / 2) / s, y: (cy - r.top - (r.height - h * s) / 2) / s };
  };

  const zoomAt = (factor: number, px: number, py: number) => {
    const v = viewRef.current;
    const k = Math.min(16, Math.max(1, v.k * factor));
    const mx = (px - v.x) / v.k,
      my = (py - v.y) / v.k;
    setView(clamp({ k, x: px - mx * k, y: py - my * k }));
  };

  // ---- pointer gestures ----
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ start: View; a: { x: number; y: number }; dist?: number; moved: number }>();

  const startGesture = () => {
    const pts = [...ptrs.current.values()];
    const a =
      pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : { x: pts[0].x, y: pts[0].y };
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined;
    g.current = { start: viewRef.current, a, dist, moved: g.current?.moved ?? 0 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, toLocal(e.clientX, e.clientY));
    if (ptrs.current.size === 1) g.current = undefined;
    startGesture();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId) || !g.current) return;
    ptrs.current.set(e.pointerId, toLocal(e.clientX, e.clientY));
    const pts = [...ptrs.current.values()];
    const { start, a, dist } = g.current;
    if (pts.length >= 2 && dist) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const k = Math.min(16, Math.max(1, (start.k * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / dist));
      const mx = (a.x - start.x) / start.k,
        my = (a.y - start.y) / start.k;
      g.current.moved = 99;
      setView(clamp({ k, x: mid.x - mx * k, y: mid.y - my * k }));
    } else {
      const dx = pts[0].x - a.x,
        dy = pts[0].y - a.y;
      g.current.moved = Math.max(g.current.moved, Math.hypot(dx, dy) * pxPerUnit);
      if (g.current.moved > 6) setView(clamp({ ...start, x: start.x + dx, y: start.y + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasTap = ptrs.current.size === 1 && (g.current?.moved ?? 0) <= 6;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size > 0) startGesture();
    if (wasTap && onTap) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]');
      const id = el?.getAttribute('data-id');
      if (id && (!tappable || tappable(id))) onTap(id);
    }
  };

  useEffect(() => {
    const el = svgRef.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toLocal(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const drawn = useMemo(() => {
    const list = map.items.filter((it) => showIdle || states[it.id]);
    return list.sort((a, b) => ORDER.indexOf(states[a.id] ?? 'idle') - ORDER.indexOf(states[b.id] ?? 'idle'));
  }, [map, states, showIdle]);

  const unit = 1 / (pxPerUnit * view.k); // one screen pixel in map units
  const line = map.kind === 'line';

  return (
    <div className="mapwrap">
      <svg
        ref={svgRef}
        className="map"
        viewBox={`0 0 ${w} ${h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect width={w} height={h} fill="var(--map-sea)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <path d={map.base} className="map-base" />
          {map.baseLines && <path d={map.baseLines} className="map-baselines" />}
          {drawn.map((it) => {
            const st = states[it.id] ?? 'idle';
            const color = FILL[st];
            const cls = `map-item st-${st}${onTap ? ' tappable' : ''}`;
            if (line) {
              return (
                <g key={it.id} data-id={it.id} className={cls}>
                  <path d={it.d} className="hit" />
                  <path
                    d={it.d}
                    fill="none"
                    stroke={st === 'idle' ? 'var(--map-river)' : color}
                    strokeWidth={st === 'idle' ? 1.6 : 3.5}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            }
            return (
              <g key={it.id} data-id={it.id} className={cls}>
                <path d={it.d} fill={color} />
                {it.dot && (st !== 'idle' || onTap) && (
                  <circle cx={it.dot[0]} cy={it.dot[1]} r={Math.max(5 * unit, 1.2)} fill={color} className="dot" />
                )}
              </g>
            );
          })}
          {labels &&
            map.items
              .filter((it) => labels[it.id])
              .map((it) => (
                <text
                  key={`l-${it.id}`}
                  x={it.c[0]}
                  y={it.c[1]}
                  className={`map-label st-${states[it.id] ?? 'idle'}`}
                  fontSize={12 * unit}
                  strokeWidth={3 * unit}
                >
                  {it.name}
                </text>
              ))}
        </g>
      </svg>
      <div className="zoom-buttons">
        <button aria-label="Zoom in" onClick={() => zoomAt(1.6, w / 2, h / 2)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => zoomAt(1 / 1.6, w / 2, h / 2)}>
          −
        </button>
        {view.k > 1 && (
          <button aria-label="Reset zoom" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
            ⤢
          </button>
        )}
      </div>
    </div>
  );
}
