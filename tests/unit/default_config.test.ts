import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants';

describe('DEFAULT_USER_CONFIG', () => {
    it('agent_bridge_enabled defaults to true', () => {
        expect(DEFAULT_USER_CONFIG.agent_bridge_enabled).toBe(true);
    });
});
