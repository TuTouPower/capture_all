// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/shared/constants';
import {
    start_dom_capture,
    stop_dom_capture,
} from '../src/extension/content/dom_capture';
import type { InputEventData } from '../src/shared/types';

function capture_input_event(
    input_type: string,
    value: string,
    redact_data: boolean,
): InputEventData {
    const events: InputEventData[] = [];
    const input = document.createElement('input');
    input.type = input_type;
    input.value = value;
    document.body.append(input);

    start_dom_capture(
        { ...DEFAULT_CONFIG, redact_data },
        (type, data: InputEventData) => {
            if (type === 'input_event') events.push(data);
        },
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(events).toHaveLength(1);
    return events[0];
}

afterEach(() => {
    stop_dom_capture();
    document.body.replaceChildren();
});

describe('input value privacy', () => {
    it('does not store a plain input value when redaction is enabled', () => {
        const event = capture_input_event('text', 'private message', true);

        expect(event).toMatchObject({
            value_status: 'redacted',
            value_preview: '[REDACTED]',
            value_length: 15,
        });
    });

    it('stores a plain input value only when redaction is disabled', () => {
        const event = capture_input_event('text', 'allowed value', false);

        expect(event).toMatchObject({
            value_status: 'captured',
            value_preview: 'allowed value',
            value_length: 13,
        });
    });

    it('never stores password input values', () => {
        const event = capture_input_event('password', 'secret', false);

        expect(event).toMatchObject({
            value_status: 'not_captured',
            value_preview: null,
            value_length: null,
        });
    });
});
