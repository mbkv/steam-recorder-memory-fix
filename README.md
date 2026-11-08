# Steam Recorder Memory Fix

A [Millennium](https://steambrew.app/) plugin that releases unused playback
resources when you switch or close Steam Game Recording clips. It revokes old
MediaSource URLs and resets closed video elements. Cleanup runs automatically
while the plugin is enabled

## Install

1. Install [Millennium](https://steambrew.app/) with support for `.star` plugins.
2. Download **steam-recorder-memory-fix.star** from the
   [Releases page](https://github.com/mbkv/steam-recorder-memory-fix/releases).
   You do not need Git, Bun, or the source ZIP.
3. Close Steam and copy the file into your Millennium plugins directory.
4. Start Steam, open **Millennium > Plugins**, and enable **Steam Recorder Memory
   Fix**. Restart Steam if prompted.

On Linux the plugins directory is `~/.local/share/millennium/plugins/`.

## Build

Requires Bun and Node.js.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run release
```

## Compatibility

Tested on Linux with Millennium 3.6.3-beta.1. Other platforms have not been
verified

The plugin targets local recordings only. It uses no backend process, network
requests, memory polling, telemetry, or changes to Chromium's sandbox.

## License

[0BSD](LICENSE). Copyright 2026 [Michael Bitokhov](https://github.com/mbkv).
