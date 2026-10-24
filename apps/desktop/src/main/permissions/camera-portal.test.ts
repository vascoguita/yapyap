import { describe, expect, it, vi } from 'vitest';
import { useCameraPortal } from './camera-portal.ts';

const commandLine = (features = '') => ({
  getSwitchValue: vi.fn((name: string) => (name === 'enable-features' ? features : '')),
  appendSwitch: vi.fn(),
});

describe('useCameraPortal', () => {
  it('reaches the camera through the portal inside Flatpak', () => {
    const switches = commandLine();
    useCameraPortal(switches, { FLATPAK_ID: 'org.guita.YapYap' });
    expect(switches.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      'enable-features',
      'WebRtcPipeWireCamera',
    );
  });

  it('keeps the features named on the command line', () => {
    const switches = commandLine('Vulkan,UseOzonePlatform');
    useCameraPortal(switches, { FLATPAK_ID: 'org.guita.YapYap' });
    expect(switches.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      'enable-features',
      'Vulkan,UseOzonePlatform,WebRtcPipeWireCamera',
    );
  });

  it('leaves the camera alone outside Flatpak', () => {
    const switches = commandLine();
    useCameraPortal(switches, {});
    useCameraPortal(switches, { FLATPAK_ID: '' });
    expect(switches.appendSwitch).not.toHaveBeenCalled();
  });
});
