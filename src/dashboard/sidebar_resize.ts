// dashboard/sidebar_resize.ts
// Reusable sidebar resize via mousedown/mousemove + localStorage persistence.
// Modeled after wire_rail_resize / wire_network_resize in dashboard.ts.

export interface SidebarResizeOpts {
    handle: HTMLElement;
    storage_key: string;
    css_var: string;
    default_px: number;
    min_px: number;
    max_px: number;
    direction?: 'left';
}

export function wire_sidebar_resize(opts: SidebarResizeOpts): void {
    const { handle, storage_key, css_var, default_px, min_px, max_px, direction } = opts;
    const root = document.documentElement;

    // Restore saved width
    const saved = localStorage.getItem(storage_key);
    const initial = saved ? clamp(Number(saved), min_px, max_px) : default_px;
    root.style.setProperty(css_var, `${initial}px`);

    let dragging = false;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        dragging = true;
        handle.classList.add('active');
        document.body.style.userSelect = 'none';

        const start_x = e.clientX;
        const start_w = initial;

        const on_move = (ev: MouseEvent) => {
            if (!dragging) return;
            const delta = ev.clientX - start_x;
            const w = direction === 'left'
                ? clamp(start_w - delta, min_px, max_px)
                : clamp(start_w + delta, min_px, max_px);
            root.style.setProperty(css_var, `${w}px`);
        };

        const on_up = () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('active');
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', on_move);
            window.removeEventListener('mouseup', on_up);
            // Persist
            const current = parseFloat(root.style.getPropertyValue(css_var)) || default_px;
            localStorage.setItem(storage_key, String(Math.round(current)));
        };

        window.addEventListener('mousemove', on_move);
        window.addEventListener('mouseup', on_up);
    });

    // Double-click to reset
    handle.addEventListener('dblclick', () => {
        root.style.setProperty(css_var, `${default_px}px`);
        localStorage.setItem(storage_key, String(default_px));
    });
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}
