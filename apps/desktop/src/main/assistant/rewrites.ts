import type { ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, defused, INSTRUCTIONS, nowLine, type Prompt } from './prompts.ts';

/** The ways the message box's rewrite button offers, Polish first (#609). */
export const POLISH_STYLES = ['polish', 'shorten', 'elaborate', 'soften', 'formalize'] as const;

/** How the user wants their draft rewritten. */
export type PolishStyle = (typeof POLISH_STYLES)[number];

/** Whether `value` is one of the rewrite button's ways. */
export const isPolishStyle = (value: string): value is PolishStyle =>
  (POLISH_STYLES as readonly string[]).includes(value);

const ASKS: Readonly<Record<PolishStyle, string>> = {
  // Polish mends the draft and leaves the rest alone: it is still the user's message.
  polish:
    'so it reads naturally: fix its spelling, grammar and punctuation, and smooth out fragments, run-ons and voice-typing slips, changing no more than it needs and keeping my tone, my emoji and how casual it is',
  shorten: 'so it says the same in fewer words',
  elaborate:
    'so it is fuller and clearer, spelling out its points and what the chat leaves unsaid, adding no facts that neither it nor the chat gives',
  // The maintainer's brief: gentler, about as long, and no emoji the draft does not have.
  soften:
    'so it sounds gentler and friendlier, about as long as it is, with no emoji it does not already have',
  formalize:
    'so its tone is more polite and professional, still as a chat message rather than an email',
};

/** What the model is asked to do with the draft, which it reads in the light of the chat. */
export function rewriteTask(style: PolishStyle, draft: string, now: Date): string {
  return [
    nowLine(now),
    `Rewrite my draft below ${ASKS[style]}.`,
    'It is the next message I will send in this chat, so it must fit what was said. Keep every fact, question, time, place, name and promise in it, and add none.',
    'Write it in the language the draft is in.',
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

/** A model's text without the quotes it may put around it, as around a rewritten draft. */
export function cleanRewrite(answer: string): string {
  return answer
    .trim()
    .replaceAll(/^["“”']|["“”']$/g, '')
    .trim();
}
