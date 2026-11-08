import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { onTestFinished, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createPlayerFixture } from './player-fixture.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const compilerPath =
  projectRoot + 'node_modules/@steambrew/starlight/bin/starlight.js';
const pluginPath = projectRoot + 'dist/steam-recorder-memory-fix.star';
const source = execFileSync(
  process.execPath,
  [compilerPath, '-i', pluginPath, '-q', 'frontend:bundle.js'],
  { encoding: 'utf8' },
);

async function loadPlugin(fixture, available = true) {
  const logs = [];
  let props;

  class TestURL extends URL {
    static revokeObjectURL(url) {
      fixture.options.revokeURL(url);
    }
  }

  const api = {
    findModuleExport(filter) {
      assert(filter(fixture.Player));
      return available ? fixture.Player : undefined;
    },
    definePlugin: (initialize) => () => (props = initialize()),
    IconsModule: { Settings() {} },
    Field() {},
  };
  const window = {
    MILLENNIUM_API: api,
    SP_JSX_FACTORY: { jsx: (type, props) => ({ type, props }) },
    __millennium_plugin_console_binding__: (entry) =>
      logs.push(JSON.parse(entry)),
  };
  const context = createContext({
    window,
    URL: TestURL,
    MILLENNIUM_BACKEND_IPC: { postMessage() {} },
  });

  runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert(props, 'Compiled plugin initialized');
  return { props, logs };
}

test('compiled plugin applies cleanup and restores player methods on unload', async () => {
  const fixture = createPlayerFixture();
  const { Player, revoked } = fixture;
  const originalInit = Player.prototype.InitVideoControl;
  const originalClose = Player.prototype.Close;
  const { props } = await loadPlugin(fixture);
  onTestFinished(() => props.onDismount());

  const player = new Player();
  player.InitVideoControl();
  player.Close();

  assert.match(props.content.props.description, /^Active/);
  assert.deepEqual(revoked, ['blob:test-1']);
  assert.equal(player.m_elVideo.loads, 1);

  props.onDismount();
  assert.equal(Player.prototype.InitVideoControl, originalInit);
  assert.equal(Player.prototype.Close, originalClose);

  player.InitVideoControl();
  player.Close();
  assert.equal(revoked.length, 1);
});

test('compiled plugin reports an unavailable player without changing playback', async () => {
  const fixture = createPlayerFixture();
  const { props, logs } = await loadPlugin(fixture, false);
  onTestFinished(() => props.onDismount());

  const player = new fixture.Player();
  player.InitVideoControl();
  player.Close();

  assert.match(props.content.props.description, /^Unavailable/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'error');
  assert.equal(fixture.revoked.length, 0);
  assert.equal(player.m_elVideo.loads, 0);
});
