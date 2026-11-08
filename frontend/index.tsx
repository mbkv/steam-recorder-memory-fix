import { definePlugin, Field, IconsModule, findModuleExport } from 'millennium';
import { installRecordingCleanup } from './cleanup.js';

export default definePlugin(() => {
  let uninstall: (() => void) | undefined;
  let status =
    'Active. Unused recording playback resources are released automatically.';
  try {
    const Player = findModuleExport(
      (value: unknown) =>
        typeof value === 'function' &&
        typeof value.prototype?.InitVideoControl === 'function' &&
        typeof value.prototype?.Close === 'function' &&
        typeof value.prototype?.PlayMPD === 'function',
    );
    uninstall = installRecordingCleanup(Player);
  } catch (error) {
    status =
      'Unavailable on this Steam version. See Millennium logs for details.';
    console.error('Could not enable recording cleanup: ' + String(error));
  }
  return {
    title: 'Steam Recorder Memory Fix',
    icon: <IconsModule.Settings />,
    content: <Field label="Recording cleanup" description={status} />,
    onDismount() {
      uninstall?.();
    },
  };
});
