import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { FlexiSpotApp } from './app';
import type { CommandName } from '../types';

class FakeSerialClient {
    events: Record<string, ((...args: unknown[]) => void) | undefined> = {};
    sentCommands: CommandName[] = [];
    resetDiagnosticsCalls = 0;
    wakeRequests = 0;
    commandIntervalMs = 108;

    setEvents(events: Record<string, (...args: unknown[]) => void>): void {
        this.events = events;
    }

    setCommandInterval(intervalMs: number): void {
        this.commandIntervalMs = intervalMs;
    }

    async connect(): Promise<void> {
        this.events.onConnectionChange?.(true);
    }

    async disconnect(): Promise<void> {
        this.events.onConnectionChange?.(false);
    }

    async sendCommand(command: CommandName): Promise<void> {
        this.sentCommands.push(command);
        this.events.onCommand?.(command);
    }

    requestWake(): void {
        this.wakeRequests += 1;
    }

    startRepeating(command: Extract<CommandName, 'UP' | 'DOWN'>): void {
        this.sentCommands.push(command);
    }

    stopRepeating(): void {}

    resetDiagnostics(): void {
        this.resetDiagnosticsCalls += 1;
    }
}

describe('FlexiSpotApp UI', () => {
    let dom: JSDOM;
    let root: HTMLDivElement;
    let app: FlexiSpotApp;
    let fakeSerial: FakeSerialClient;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
            url: 'https://flexispot.test'
        });

        Object.defineProperty(globalThis, 'window', {
            value: dom.window,
            configurable: true
        });
        Object.defineProperty(globalThis, 'document', {
            value: dom.window.document,
            configurable: true
        });
        Object.defineProperty(globalThis, 'navigator', {
            value: dom.window.navigator,
            configurable: true
        });
        Object.defineProperty(globalThis, 'HTMLElement', {
            value: dom.window.HTMLElement,
            configurable: true
        });
        Object.defineProperty(globalThis, 'HTMLInputElement', {
            value: dom.window.HTMLInputElement,
            configurable: true
        });
        Object.defineProperty(globalThis, 'HTMLTextAreaElement', {
            value: dom.window.HTMLTextAreaElement,
            configurable: true
        });
        Object.defineProperty(globalThis, 'HTMLSelectElement', {
            value: dom.window.HTMLSelectElement,
            configurable: true
        });
        Object.defineProperty(globalThis, 'Event', {
            value: dom.window.Event,
            configurable: true
        });
        Object.defineProperty(globalThis, 'KeyboardEvent', {
            value: dom.window.KeyboardEvent,
            configurable: true
        });
        Object.defineProperty(globalThis, 'FormData', {
            value: dom.window.FormData,
            configurable: true
        });

        root = document.querySelector<HTMLDivElement>('#app') as HTMLDivElement;
        fakeSerial = new FakeSerialClient();
        app = new FlexiSpotApp(root);
        (app as unknown as { serial: FakeSerialClient }).serial = fakeSerial;

        Object.defineProperty(window, 'isSecureContext', {
            value: true,
            configurable: true
        });
        Object.defineProperty(navigator, 'serial', {
            value: {},
            configurable: true
        });

        window.localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        app.mount();
    });

    afterEach(() => {
        app?.unmount();
        dom.window.close();
        vi.restoreAllMocks();
    });

    it('opens the preset editor, traps focus, and saves label edits', async () => {
        click('[data-action="customize"]');

        const dialog = document.getElementById('preset-editor-modal');
        expect(dialog).not.toBeNull();

        const firstInput = document.querySelector<HTMLInputElement>('[data-preset-input="PRESET1"]');
        expect(document.activeElement).toBe(firstInput);

        const closeButton = document.querySelector<HTMLButtonElement>('button[data-action="close-preset-editor"]');
        const saveButton = document.querySelector<HTMLButtonElement>('[data-action="save-preset-labels"]');
        saveButton?.focus();
        dispatchTab();
        expect(document.activeElement).toBe(closeButton);

        firstInput!.value = 'Deep Work';
        firstInput!.dispatchEvent(new Event('input', { bubbles: true }));
        saveButton?.click();

        expect(document.getElementById('preset-editor-modal')).toBeNull();
        expect(root.textContent).toContain('Deep Work');
        expect(window.localStorage.getItem('flexispot-control-deck-presets-v1')).toContain('Deep Work');
    });

    it('opens the settings modal, traps focus, and persists theme changes', async () => {
        click('[data-action="open-settings"]');

        const settingsModal = document.getElementById('settings-modal');
        expect(settingsModal).not.toBeNull();

        const closeButton = document.querySelector<HTMLButtonElement>('[data-action="close-settings"]');
        expect(document.activeElement).toBe(closeButton);

        closeButton?.focus();
        dispatchTab(true);
        const submitButton = settingsModal?.querySelector<HTMLButtonElement>('button[type="submit"]');
        expect(document.activeElement).toBe(submitButton);

        const themeSelect = settingsModal?.querySelector<HTMLSelectElement>('select[name="theme"]');
        themeSelect!.value = 'dark';
        const form = settingsModal?.querySelector<HTMLFormElement>('[data-settings-form]');
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(document.getElementById('settings-modal')).toBeNull();
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(window.localStorage.getItem('flexispot-control-deck-settings-v1')).toContain('"theme":"dark"');
    });

    it('ignores shortcuts while typing in the preset editor and clears diagnostics consistently', async () => {
        click('[data-action="connect"]');
        await flush();

        click('[data-action="customize"]');
        const presetInput = document.querySelector<HTMLInputElement>('[data-preset-input="PRESET1"]');
        presetInput?.focus();
        presetInput?.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));

        expect(fakeSerial.sentCommands).toEqual([]);

        (app as unknown as { patchState: (next: Record<string, unknown>) => void }).patchState({
            receivedChunkCount: 9,
            receivedByteCount: 72,
            rawPreview: ['9b 06 02'],
            rawCapture: ['9b 06 02']
        });

        click('[data-action="clear"]');

        expect(fakeSerial.resetDiagnosticsCalls).toBe(1);
        expect(root.textContent).toContain('RX Chunks');
        expect(root.textContent).toContain('0');
        expect(document.querySelector('[role="status"]')).not.toBeNull();
        expect(document.querySelector('[role="log"]')).not.toBeNull();
    });
});

function click(selector: string): void {
    document.querySelector<HTMLElement>(selector)?.click();
}

function dispatchTab(shiftKey = false): void {
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true
    }));
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}
