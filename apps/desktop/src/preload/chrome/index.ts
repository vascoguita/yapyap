import { contextBridge, ipcRenderer } from 'electron';
import {
  ASSISTANT_BAR_STATE_EVENT,
  EXTENSIONS_CHANGED_EVENT,
  RECORD_PROMPT_STATE_EVENT,
  RECORDER_COMMAND_EVENT,
  SIDEBAR_STATE_EVENT,
  type AssistantBarState,
  type RecordPromptState,
  type RecorderCommand,
  type SidebarState,
} from '../../shared/chrome-api.ts';
import { createChromeBridge } from './bridge.ts';

contextBridge.exposeInMainWorld(
  'yapyap',
  createChromeBridge(
    (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    // The page gets the state alone, never the IPC event.
    (listener) => {
      ipcRenderer.on(SIDEBAR_STATE_EVENT, (_event, state: SidebarState) => {
        listener(state);
      });
    },
    (listener) => {
      ipcRenderer.on(EXTENSIONS_CHANGED_EVENT, () => {
        listener();
      });
    },
    (listener) => {
      ipcRenderer.on(ASSISTANT_BAR_STATE_EVENT, (_event, state: AssistantBarState) => {
        listener(state);
      });
    },
    (listener) => {
      ipcRenderer.on(RECORD_PROMPT_STATE_EVENT, (_event, state: RecordPromptState) => {
        listener(state);
      });
    },
    (listener) => {
      ipcRenderer.on(RECORDER_COMMAND_EVENT, (_event, command: RecorderCommand) => {
        listener(command);
      });
    },
  ),
);
