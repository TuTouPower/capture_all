import { describe, it, expect } from 'vitest';
import { plan_body, ext_for_mime, is_text_body, safe_request_id } from '../src/shared/body_routing';

const INLINE = 32768;

describe('plan_body', () => {
    it('omits when status is too_large', () => {
        const p = plan_body({ encoding: 'base64', mime: 'image/png', byte_size: 999, status: 'too_large', has_body: false }, INLINE);
        expect(p.placement).toBe('omit');
    });
    it('omits when no body present', () => {
        const p = plan_body({ encoding: null, mime: null, byte_size: null, status: 'not_enabled', has_body: false }, INLINE);
        expect(p.placement).toBe('omit');
    });
    it('routes binary to file with mime ext', () => {
        const p = plan_body({ encoding: 'base64', mime: 'image/png', byte_size: 5000, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('file');
        expect(p.ext).toBe('png');
    });
    it('routes large text to file', () => {
        const p = plan_body({ encoding: 'utf8', mime: 'text/html', byte_size: 40000, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('file');
        expect(p.ext).toBe('html');
    });
    it('routes small text to inline', () => {
        const p = plan_body({ encoding: 'utf8', mime: 'application/json', byte_size: 100, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('inline');
    });
    it('treats unknown mime without base64 as text', () => {
        const p = plan_body({ encoding: null, mime: 'application/json', byte_size: 10, status: 'captured', has_body: true }, INLINE);
        expect(p.placement).toBe('inline');
    });
});

describe('ext_for_mime', () => {
    it('maps known mimes', () => {
        expect(ext_for_mime('image/png')).toBe('png');
        expect(ext_for_mime('image/jpeg')).toBe('jpg');
        expect(ext_for_mime('font/woff2')).toBe('woff2');
        expect(ext_for_mime('application/json')).toBe('json');
    });
    it('falls back to bin', () => {
        expect(ext_for_mime('application/octet-stream')).toBe('bin');
        expect(ext_for_mime(null)).toBe('bin');
    });
});

describe('is_text_body', () => {
    it('base64 encoding is binary regardless of mime', () => {
        expect(is_text_body('base64', 'text/html')).toBe(false);
    });
    it('text mimes are text', () => {
        expect(is_text_body(null, 'text/css')).toBe(true);
        expect(is_text_body(null, 'image/svg+xml')).toBe(true);
        expect(is_text_body(null, 'application/ld+json')).toBe(true);
    });
    it('binary mimes are binary', () => {
        expect(is_text_body(null, 'image/png')).toBe(false);
    });
});

describe('safe_request_id', () => {
    it('preserves alphanumeric dot dash underscore', () => {
        expect(safe_request_id('abc.123_xyz-0')).toBe('abc.123_xyz-0');
    });
    it('replaces special chars', () => {
        expect(safe_request_id('req/123:test!')).toBe('req_123_test_');
    });
    it('deduplicates conflicts', () => {
        const used = new Set<string>();
        expect(safe_request_id('a', used)).toBe('a');
        used.add('a');
        expect(safe_request_id('a', used)).toBe('a_2');
        used.add('a_2');
        expect(safe_request_id('a', used)).toBe('a_3');
    });
});
