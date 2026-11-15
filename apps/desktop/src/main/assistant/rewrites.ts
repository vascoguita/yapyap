import type { ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, defused, INSTRUCTIONS, nowLine, type Prompt } from './prompts.ts';

/** The ways the message box's rewrite button offers, Polish first (#609). */
export const POLISH_STYLES = ['polish', 'shorten', 'elaborate', 'soften', 'formalize'] as const;

/** How the user wants their draft rewritten. */
export type PolishStyle = (typeof POLISH_STYLES)[number];

/** Whether `value` is one of the rewrite button's ways. */
export const isPolishStyle = (value: string): value is PolishStyle =>
  (POLISH_STYLES as readonly string[]).includes(value);

/** Each way as the instructions name it, where it is described (#629). */
const WAYS: Readonly<Record<PolishStyle, string>> = {
  polish: 'Polish',
  shorten: 'Shorten',
  elaborate: 'Elaborate',
  soften: 'Soften',
  formalize: 'Formalize',
};

/** What the model is asked to do with the draft, which it reads in the light of the chat. */
export function rewriteTask(style: PolishStyle, draft: string, now: Date): string {
  return [
    nowLine(now),
    `Rewrite my draft below the ${WAYS[style]} way, as "Rewriting the draft" describes it.`,
    'It is the next message I will send in this chat, so it must fit what was said.',
    '<draft>',
    defused(draft),
    '</draft>',
    'Answer with the rewritten message only.',
  ].join('\n');
}

/** Everything a request to rewrite `draft` in `chat` sends. */
export function rewritePrompt(
  style: PolishStyle,
  draft: string,
  chat: ReadChat,
  now: Date,
): Prompt {
  return {
    instructions: INSTRUCTIONS,
    context: chatContext(chat),
    task: rewriteTask(style, draft, now),
  };
}

/** A model's text without the quotes or draft tags it may put around it, as around a rewritten draft. */
export function cleanRewrite(answer: string): string {
  return unwrapped(answer.trim())
    .replaceAll(/^["“”']|["“”']$/g, '')
    .trim();
}

const OPEN = '<draft>';
const CLOSE = '</draft>';

/** The text without the draft tags a model may echo around it. */
function unwrapped(text: string): string {
  const opened = text.toLowerCase().startsWith(OPEN) ? text.slice(OPEN.length) : text;
  const inner = opened.trimEnd();
  return (inner.toLowerCase().endsWith(CLOSE) ? inner.slice(0, -CLOSE.length) : inner).trim();
}
