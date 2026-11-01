import { dialog, type BrowserWindow } from 'electron';
import { PRODUCT_NAME } from '../identity/product.ts';

/** A question with two answers, asked in a native message box. */
export interface Question {
  readonly type: 'info' | 'question' | 'warning' | 'error';
  readonly message: string;
  readonly detail: string;
  readonly yes: string;
  readonly no: string;
  /**
   * Whether Enter answers yes. Off unless set, so a stray Enter never
   * allows, deletes or restarts anything; Escape always answers no.
   */
  readonly enterMeansYes?: boolean;
  /** The window the box belongs to, when one asked. */
  readonly parent?: BrowserWindow;
}

/** True only when the user picks the yes button. */
export async function confirm(question: Question): Promise<boolean> {
  const options = {
    type: question.type,
    title: PRODUCT_NAME,
    message: question.message,
    detail: question.detail,
    buttons: [question.yes, question.no],
    defaultId: question.enterMeansYes === true ? 0 : 1,
    cancelId: 1,
  };
  const { response } = await (question.parent === undefined
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(question.parent, options));
  return response === 0;
}
