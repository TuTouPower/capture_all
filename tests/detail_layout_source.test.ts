import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dashboard_ts = readFileSync('src/dashboard/dashboard.ts', 'utf8');
const dashboard_css = readFileSync('src/dashboard/dashboard-pages.css', 'utf8');

describe('detail layout source', () => {
    it('renders the timeline rail resize handle inside the rail', () => {
        expect(dashboard_ts).toContain('<div class="dt-rail-handle"></div>');
        expect(dashboard_ts).not.toContain('</aside><div class="dt-rail-handle"></div>');
    });

    it('uses a network-specific body layout instead of the timeline rail grid', () => {
        expect(dashboard_ts).toContain('dt-network-body');
        expect(dashboard_css).toContain('.dt-network-body');
    });

    it('uses the resolved network selection for both row highlight and inspector', () => {
        expect(dashboard_ts).toContain('render_net_table(selected_net_idx)');
        expect(dashboard_ts).toContain('data-sel="${selected_net_idx === idx ? 1 : 0}"');
    });

    it('allows closing the default network inspector', () => {
        expect(dashboard_ts).toContain('!dt_net_insp_closed && detail_network.length > 0');
        expect(dashboard_ts).toContain('dt_net_insp_closed = true');
    });
});
