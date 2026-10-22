import { applyDesign, describeState } from '../ai/apply';
import type { AiSession } from '../ai/client';
import { AI_MODELS, AiError, DEFAULT_AI_MODEL, YEN_PER_USD } from '../ai/models';
import type { AiModel } from '../ai/models';
import { h } from './dom';
import { getLanguage, t } from './i18n';
import type { MessageKey, StorageLike } from './i18n';
import type { AppState } from './state';

/**
 * AI assistant panel: the user describes what they want in words, Claude changes the settings
 * through `applyDesign`, and every AI change can be undone. Without an API key the panel only
 * shows the key form, so the rest of the app behaves exactly as before.
 */

export const AI_KEY_STORAGE_KEY = 'mojimotion.ai.key';
export const AI_MODEL_STORAGE_KEY = 'mojimotion.ai.model';
const UNDO_LIMIT = 20;

export interface AiHost {
  readonly state: () => AppState;
  readonly apply: (state: AppState) => void;
  readonly knownFont: (family: string) => boolean;
  readonly busy: () => boolean;
}

type Storage = StorageLike & { removeItem?: (key: string) => void };

const ERROR_KEY: Readonly<Record<AiError['kind'], MessageKey>> = {
  auth: 'ai.error.auth',
  rate: 'ai.error.rate',
  network: 'ai.error.network',
  refusal: 'ai.error.refusal',
  other: 'ai.error.other',
};

const MODEL_KEY: Readonly<Record<AiModel, MessageKey>> = {
  'claude-sonnet-5-5': 'ai.model.sonnet',
  'claude-haiku-5-5': 'ai.model.haiku',
};

function readStorage(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | null, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem?.(key);
    else storage?.setItem(key, value);
  } catch {
    // Private mode etc.: the key simply lives for this page only.
  }
}

export class AiPanel {
  readonly el: HTMLElement;
  private apiKey: string | null;
  private model: AiModel;
  private session: AiSession | null = null;
  private undoStack: AppState[] = [];
  private spentUsd = 0;
  private request: AbortController | null = null;

  private readonly setupBox: HTMLElement;
  private readonly chatBox: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly costLine: HTMLElement;
  private readonly keyInput: HTMLInputElement;
  private readonly rememberInput: HTMLInputElement;
  private readonly modelSelect: HTMLSelectElement;

  constructor(private readonly host: AiHost, private readonly storage: Storage | null) {
    this.apiKey = readStorage(storage, AI_KEY_STORAGE_KEY);
    const savedModel = readStorage(storage, AI_MODEL_STORAGE_KEY);
    this.model = AI_MODELS.includes(savedModel as AiModel) ? (savedModel as AiModel) : DEFAULT_AI_MODEL;

    // ── key / model form ──
    this.keyInput = h('input', { attrs: { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-…', 'data-testid': 'ai-key', 'aria-label': t('ai.key.label') } });
    this.rememberInput = h('input', { attrs: { type: 'checkbox', 'data-testid': 'ai-remember' } });
    this.rememberInput.checked = true;
    this.modelSelect = h('select', { attrs: { 'data-testid': 'ai-model', 'aria-label': t('ai.model.label') } });
    for (const model of AI_MODELS) this.modelSelect.append(h('option', { attrs: { value: model }, text: t(MODEL_KEY[model]) }));
    this.modelSelect.value = this.model;
    const saveKey = h('button', { class: 'btn primary', attrs: { type: 'button', 'data-testid': 'ai-save-key' }, text: t('ai.key.save') });
    saveKey.addEventListener('click', () => this.saveSettings());
    const forget = h('button', { class: 'btn', attrs: { type: 'button', 'data-testid': 'ai-forget-key' }, text: t('ai.key.forget') });
    forget.addEventListener('click', () => this.forgetKey());
    const closeSetup = h('button', { class: 'btn', attrs: { type: 'button' }, text: t('common.close') });
    closeSetup.addEventListener('click', () => this.showSetup(false));
    this.setupBox = h('div', { class: 'ai-setup', attrs: { 'data-testid': 'ai-setup' } }, [
      h('p', { class: 'ai-intro', text: t('ai.intro') }),
      h('label', { class: 'field' }, [h('span', { class: 'field-label', text: t('ai.key.label') }), this.keyInput]),
      h('label', { class: 'field-toggle field' }, [this.rememberInput, h('span', { text: t('ai.key.remember') })]),
      h('label', { class: 'field' }, [h('span', { class: 'field-label', text: t('ai.model.label') }), this.modelSelect]),
      h('p', { class: 'ai-note muted', text: t('ai.key.note') }),
      h('div', { class: 'ai-actions' }, [saveKey, forget, closeSetup]),
    ]);

    // ── chat ──
    this.log = h('div', { class: 'ai-log', attrs: { role: 'log', 'aria-live': 'polite', 'data-testid': 'ai-log' } });
    this.input = h('textarea', { attrs: { rows: 2, 'data-testid': 'ai-input', 'aria-label': t('ai.input.label'), placeholder: t('ai.input.placeholder') } });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void this.send();
      }
    });
    this.sendButton = h('button', { class: 'btn primary', attrs: { type: 'button', 'data-testid': 'ai-send' }, text: t('ai.send') });
    this.sendButton.addEventListener('click', () => void this.send());
    this.cancelButton = h('button', { class: 'btn', attrs: { type: 'button', 'data-testid': 'ai-cancel', hidden: true }, text: t('common.cancel') });
    this.cancelButton.addEventListener('click', () => this.request?.abort());
    this.undoButton = h('button', { class: 'btn', attrs: { type: 'button', 'data-testid': 'ai-undo' }, text: t('ai.undo') });
    this.undoButton.addEventListener('click', () => this.undo());
    const newChat = h('button', { class: 'link-btn', attrs: { type: 'button', 'data-testid': 'ai-new-chat' }, text: t('ai.newChat') });
    newChat.addEventListener('click', () => this.resetChat());
    const settings = h('button', { class: 'link-btn', attrs: { type: 'button', 'data-testid': 'ai-open-settings' }, text: t('ai.settings') });
    settings.addEventListener('click', () => this.showSetup(true));
    this.costLine = h('span', { class: 'ai-cost muted', attrs: { 'data-testid': 'ai-cost' } });
    this.chatBox = h('div', { class: 'ai-chat' }, [
      this.log,
      h('div', { class: 'ai-compose' }, [this.input, h('div', { class: 'ai-actions' }, [this.sendButton, this.cancelButton, this.undoButton])]),
      h('div', { class: 'ai-meta' }, [this.costLine, h('span', { class: 'spacer' }), newChat, settings]),
    ]);

    this.el = h('section', { class: 'ai-panel card', attrs: { 'aria-labelledby': 'ai-title', 'data-testid': 'ai-panel' } }, [
      h('h2', { class: 'ai-title', id: 'ai-title', text: t('ai.title') }),
      this.setupBox,
      this.chatBox,
    ]);
    this.showSetup(this.apiKey === null);
    this.sync();
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  private showSetup(open: boolean): void {
    this.setupBox.hidden = !open;
    this.chatBox.hidden = open || this.apiKey === null;
    if (open) this.keyInput.value = '';
  }

  private saveSettings(): void {
    const key = this.keyInput.value.trim();
    if (key) {
      this.apiKey = key;
      writeStorage(this.storage, AI_KEY_STORAGE_KEY, this.rememberInput.checked ? key : null);
    }
    this.model = this.modelSelect.value as AiModel;
    writeStorage(this.storage, AI_MODEL_STORAGE_KEY, this.model);
    this.session = null;
    if (this.apiKey === null) return;
    this.showSetup(false);
    this.input.focus();
  }

  private forgetKey(): void {
    this.apiKey = null;
    this.session = null;
    writeStorage(this.storage, AI_KEY_STORAGE_KEY, null);
    this.keyInput.value = '';
    this.addMessage('system', t('ai.key.forgotten'));
    this.showSetup(true);
  }

  private resetChat(): void {
    this.session = null;
    this.spentUsd = 0;
    this.log.replaceChildren();
    this.sync();
  }

  private addMessage(role: 'user' | 'assistant' | 'system' | 'error', text: string): void {
    this.log.append(h('p', { class: `ai-msg ai-${role}`, attrs: { 'data-role': role }, text }));
    this.log.scrollTop = this.log.scrollHeight;
  }

  private sync(): void {
    const busy = this.request !== null;
    this.sendButton.disabled = busy;
    this.sendButton.textContent = busy ? t('ai.thinking') : t('ai.send');
    this.cancelButton.hidden = !busy;
    this.undoButton.disabled = busy || this.undoStack.length === 0;
    const yen = this.spentUsd * YEN_PER_USD;
    this.costLine.textContent = t('ai.cost', { yen: yen < 1 ? yen.toFixed(2) : yen.toFixed(1) });
  }

  async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.request || this.apiKey === null) return;
    if (this.host.busy()) {
      this.addMessage('error', t('ai.error.busy'));
      return;
    }
    this.addMessage('user', text);
    this.input.value = '';
    this.request = new AbortController();
    this.sync();
    try {
      if (!this.session) {
        // The SDK is loaded only when the assistant is first used.
        const { AiSession: Session } = await import('../ai/client');
        this.session = new Session({ apiKey: this.apiKey, model: this.model, lang: getLanguage() });
      }
      const turn = await this.session.send(text, describeState(this.host.state()), this.request.signal);
      this.spentUsd += turn.costUsd;
      for (const command of turn.commands) {
        const before = this.host.state();
        const result = applyDesign(before, command.input, getLanguage(), this.host.knownFont);
        if (result.changed) {
          this.undoStack.push(before);
          if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
          this.host.apply(result.state);
        }
        this.session.setResult(command.id, result.adjusted.length > 0 ? `適用しました。調整された項目: ${result.adjusted.join(', ')}` : '適用しました');
        if (result.adjusted.length > 0) this.addMessage('system', t('ai.adjusted', { items: result.adjusted.join(', ') }));
      }
      this.addMessage('assistant', turn.reply || t(turn.commands.length > 0 ? 'ai.applied' : 'ai.empty'));
      if (turn.stopReason === 'max_tokens') this.addMessage('error', t('ai.error.long'));
    } catch (error) {
      const aborted = this.request.signal.aborted;
      if (!aborted) this.input.value = text;
      this.addMessage(aborted ? 'system' : 'error', aborted ? t('ai.cancelled') : t(ERROR_KEY[error instanceof AiError ? error.kind : 'other']));
    } finally {
      this.request = null;
      this.sync();
    }
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous || this.request) return;
    this.host.apply(previous);
    this.addMessage('system', t('ai.undone'));
    this.sync();
  }
}
