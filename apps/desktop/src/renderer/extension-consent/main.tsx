import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { ExtensionConsent } from './ExtensionConsent.tsx';

mount(ExtensionConsent, { title: en.windows.extensionConsent, escape: closeOnEscape });
