// tests/streaming_capture.test.ts
// SSE / streaming HTTP body capture tests.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

(globalThis as any).chrome = {
    ...(globalThis as any).chrome || {},
    dbg: mock_chrome_debugger,
    debugger: mock_chrome_debugger,
    webRequest: {
        onBeforeRequest: { addListener: vi.fn(), removeListener: vi.fn() },
        onBeforeSendHeaders: { addListener: vi.fn(), removeListener: vi.fn() },
        onHeadersReceived: { addListener: vi.fn(), removeListener: vi.fn() },
        onCompleted: { addListener: vi.fn(), removeListener: vi.fn() },
        onErrorOccurred: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
        local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
        },
    },
    runtime: {
        getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
    },
    tabs: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onCreated: { addListener: vi.fn() },
    },
};

import {
    is_streaming_response,
} from '../../src/extension/background/network_capture';

describe('is_streaming_response', () => {
    it('detects text/event-stream mime', () => {
        expect(is_streaming_response({ 'content-type': 'text/event-stream' })).toBe(true);
    });

    it('detects text/event-stream with charset', () => {
        expect(is_streaming_response({ 'content-type': 'text/event-stream; charset=utf-8' })).toBe(true);
    });

    it('does not flag chunked transfer without content-length (transport encoding, not streaming)', () => {
        expect(is_streaming_response({
            'transfer-encoding': 'chunked',
        })).toBe(false);
    });

    it('does not flag chunked + text/css as streaming (real HTTP/1.1)', () => {
        expect(is_streaming_response({
            'transfer-encoding': 'chunked',
            'content-type': 'text/css',
        })).toBe(false);
    });

    it('does not flag chunked + application/json as streaming', () => {
        expect(is_streaming_response({
            'transfer-encoding': 'chunked',
            'content-type': 'application/json',
        })).toBe(false);
    });

    it('does not flag chunked with content-length as streaming', () => {
        expect(is_streaming_response({
            'transfer-encoding': 'chunked',
            'content-length': '1234',
        })).toBe(false);
    });

    it('does not flag application/stream+json (not text/event-stream)', () => {
        expect(is_streaming_response({ 'content-type': 'application/stream+json' })).toBe(false);
    });

    it('does not flag regular JSON as streaming', () => {
        expect(is_streaming_response({ 'content-type': 'application/json' })).toBe(false);
    });

    it('does not flag regular HTML as streaming', () => {
        expect(is_streaming_response({ 'content-type': 'text/html' })).toBe(false);
    });

    it('does not flag application/octet-stream', () => {
        expect(is_streaming_response({ 'content-type': 'application/octet-stream' })).toBe(false);
    });

    it('handles missing headers', () => {
        expect(is_streaming_response({})).toBe(false);
    });

    it('handles Content-Type with capital letters', () => {
        expect(is_streaming_response({ 'Content-Type': 'Text/Event-Stream' })).toBe(true);
    });
});
