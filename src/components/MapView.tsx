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
  /** Zoom to these items when the map first shows. */
  focus?: string[];
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

export default function MapView({ map, states, showIdle = true, labels, onTap, tappable, focus }: Props) {
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

  /** Visible area in viewBox units (bigger than w×h when the map is letterboxed). */
  const visible = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width) return { vw: w, vh: h };
    const s = Math.min(r.width / w, r.height / h);
    return { vw: r.width / s, vh: r.height / s };
  };

  const clamp = useCallback(
    (v: View): View => {
      const k = Math.min(16, Math.max(1, v.k));
      const { vw, vh } = visible();
      const axis = (pos: number, size: number, vis: number) => {
        const content = size * k;
        const lo = -(vis - size) / 2; // left/top edge of visible area
        if (content <= vis) return Math.min(Math.max(pos, lo), lo + vis - content);
        return Math.min(lo, Math.max(lo + vis - content, pos));
      };
      return { k, x: axis(v.x, w, vw), y: axis(v.y, h, vh) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, h],
  );

  // Start zoomed in on the focus items (e.g. the red ones)
  const focusKey = (focus ?? []).join(',');
  useLayoutEffect(() => {
    if (!focus?.length || !svgRef.current) return;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const id of focus) {
      const el = svgRef.current.querySelector<SVGGraphicsElement>(`[data-id="${id}"]`);
      if (!el) continue;
      const b = el.getBBox();
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width);
      y1 = Math.max(y1, b.y + b.height);
    }
    if (!isFinite(x0)) return;
    const { vw, vh } = visible();
    const pad = 0.12;
    const bw = Math.max(x1 - x0, w * 0.08) * (1 + pad * 2),
      bh = Math.max(y1 - y0, h * 0.08) * (1 + pad * 2);
    const k = Math.min(8, Math.max(1, Math.min(vw / bw, vh / bh)));
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    setView(clamp({ k, x: w / 2 - cx * k, y: h / 2 - cy * k }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

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
      const id = pickAt(e.clientX, e.clientY);
      if (id) onTap(id);
    }
  };

  /** The item under a tap. Rivers have wide, overlapping tap zones, so pick the closest line. */
  const pickAt = (cx: number, cy: number): string | undefined => {
    const ids = [
      ...new Set(
        document
          .elementsFromPoint(cx, cy)
          .map((el) => el.closest('[data-id]')?.getAttribute('data-id'))
          .filter((id): id is string => !!id && (!tappable || tappable(id))),
      ),
    ];
    if (ids.length <= 1 || map.kind !== 'line') return ids[0];
    let best: string | undefined;
    let bestD = Infinity;
    for (const id of ids) {
      const p = svgRef.current?.querySelector<SVGPathElement>(`[data-id="${id}"] path:not(.hit)`);
      const m = p?.getScreenCTM();
      if (!p || !m) continue;
      const pt = new DOMPoint(cx, cy).matrixTransform(m.inverse());
      const len = p.getTotalLength();
      const step = Math.max(0.3, len / 3000);
      for (let s = 0; s <= len; s += step) {
        const q = p.getPointAtLength(s);
        const d = (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    }
    return best ?? ids[0];
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
            const cls = `map-item ${line ? 'line' : 'area'} st-${st}${onTap ? ' tappable' : ''}`;
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
          <button aria-label="Reset zoom" onClick={() => setView(clamp({ k: 1, x: 0, y: 0 }))}>
            ⤢
          </button>
        )}
      </div>
    </div>
  );
}
