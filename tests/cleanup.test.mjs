import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installRecordingCleanup } from '../frontend/cleanup.js';
import { createPlayerFixture } from './player-fixture.mjs';

function setup(context, manifest) {
  const fixture = createPlayerFixture(manifest);
  context.after(installRecordingCleanup(fixture.Player, fixture.options));
  return { ...fixture, player: new fixture.Player() };
}

test('repeated clip switches release URLs and reset closed videos', (context) => {
  const { player, urls, errors, events } = setup(context);

  for (let i = 0; i < 40; i++) {
    assert.equal(player.InitVideoControl(123), 123);
    assert.equal(urls.size, 1);
    assert.equal(player.Close(456), 456);
    assert.equal(urls.size, 0);
    assert.equal(player.m_elVideo.src, null);
    assert.equal(player.m_elVideo.loads, i + 1);
  }

  assert.equal(errors.length, 0);
  assert.deepEqual(events.slice(0, 2), ['original close', 'revoke']);
});

test('source replacement revokes the old URL without resetting the new clip', (context) => {
  const { player, revoked, urls } = setup(context);
  player.InitVideoControl();
  player.InitVideoControl();

  assert.deepEqual(revoked, ['blob:test-1']);
  assert.equal(urls.size, 1);
  assert.equal(player.m_elVideo.src, 'blob:test-2');
  assert.equal(player.m_elVideo.loads, 0);

  player.Close();
  assert.equal(urls.size, 0);
});

test('players already open at installation are cleaned up on close', (context) => {
  const { Player, options, urls } = createPlayerFixture();
  const player = new Player();
  player.InitVideoControl();

  context.after(installRecordingCleanup(Player, options));
  player.Close();

  assert.equal(urls.size, 0);
  assert.equal(player.m_elVideo.loads, 1);
});

test('a source assigned by Steam during close is preserved', (context) => {
  const { player, revoked } = setup(context);
  player.InitVideoControl();
  player.onClose = () => {
    player.m_elVideo.src = 'blob:next-clip';
  };
  player.Close();

  assert.deepEqual(revoked, ['blob:test-1']);
  assert.equal(player.m_elVideo.src, 'blob:next-clip');
  assert.equal(player.m_elVideo.loads, 0);
});

test('repeated close calls do not repeatedly reset a disposed video', (context) => {
  const { player, revoked } = setup(context);
  player.InitVideoControl();
  player.Close();
  player.Close();

  assert.equal(revoked.length, 1);
  assert.equal(player.m_elVideo.loads, 1);
});

test('unrelated Steam videos and remote manifests are left alone', (context) => {
  const manifests = [
    'https://steamloopback.host/broadcast/session.mpd',
    'https://example.com/gamerecordings/session.mpd',
  ];

  for (const manifest of manifests) {
    const { player, urls } = setup(context, manifest);
    player.InitVideoControl();
    player.Close();

    assert.equal(urls.size, 1);
    assert.equal(player.m_elVideo.loads, 0);
  }
});

test('relative local recording manifests are supported', (context) => {
  const { player, urls } = setup(
    context,
    '/gamerecordings/clips/test/session.mpd',
  );
  player.InitVideoControl();
  player.Close();

  assert.equal(urls.size, 0);
});

test('cleanup runs even when Steam close throws and preserves that exception', (context) => {
  const { player, urls } = setup(context);
  const error = new Error('Steam close failure');
  player.InitVideoControl();

  assert.throws(
    () => player.Close(error),
    (caught) => caught === error,
  );
  assert.equal(urls.size, 0);
  assert.equal(player.m_elVideo.loads, 1);
});

test('cleanup and logging failures cannot replace the original result or exception', (context) => {
  const { Player } = createPlayerFixture();
  const warnings = [];
  const uninstall = installRecordingCleanup(Player, {
    revokeURL() {
      throw new Error('URL error');
    },
    onError(message) {
      warnings.push(message);
      throw new Error('logger error');
    },
  });
  context.after(uninstall);

  const player = new Player();
  player.InitVideoControl();
  assert.equal(player.Close('original result'), 'original result');
  assert.equal(player.m_elVideo.loads, 1);
  assert.equal(typeof warnings[0], 'string');

  player.InitVideoControl();
  player.m_elVideo.pause = () => {
    throw new Error('video error');
  };
  const original = new Error('original exception');
  assert.throws(
    () => player.Close(original),
    (error) => error === original,
  );
});

test('capture errors do not stop Steam closing its player', (context) => {
  const { player, errors } = setup(context);
  player.InitVideoControl();
  player.m_elVideo.getAttribute = () => {
    throw new Error('attribute error');
  };

  assert.equal(player.Close(456), 456);
  assert.equal(errors.length, 1);
});

test('unload restores descriptors and makes retained wrappers inert', (context) => {
  const { Player, options, urls } = createPlayerFixture();
  const originalInit = Object.getOwnPropertyDescriptor(
    Player.prototype,
    'InitVideoControl',
  );
  const originalClose = Object.getOwnPropertyDescriptor(
    Player.prototype,
    'Close',
  );
  const uninstall = installRecordingCleanup(Player, options);
  context.after(uninstall);

  const player = new Player();
  player.InitVideoControl();
  const retainedClose = player.Close;
  uninstall();
  uninstall();
  retainedClose.call(player);

  assert.equal(urls.size, 1);
  assert.equal(player.m_elVideo.loads, 0);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(Player.prototype, 'InitVideoControl'),
    originalInit,
  );
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(Player.prototype, 'Close'),
    originalClose,
  );
});

test('plugin reload replaces previous hooks rather than stacking them', (context) => {
  const { Player, options, revoked } = createPlayerFixture();
  const first = installRecordingCleanup(Player, options);
  const second = installRecordingCleanup(Player, options);
  context.after(second);

  first(); // A late unload of the old instance must not disable the new one.
  const player = new Player();
  player.InitVideoControl();
  player.Close();

  assert.equal(revoked.length, 1);
  assert.equal(player.m_elVideo.loads, 1);
});

test('partial installation failure restores methods already changed', () => {
  const { Player, options } = createPlayerFixture();
  const original = Player.prototype.InitVideoControl;
  Object.defineProperty(Player.prototype, 'Close', {
    writable: false,
    configurable: false,
  });

  assert.throws(() => installRecordingCleanup(Player, options), TypeError);
  assert.equal(Player.prototype.InitVideoControl, original);
});

test('missing or changed player methods are rejected', () => {
  assert.throws(() => installRecordingCleanup(undefined), /not found/);
  assert.throws(
    () => installRecordingCleanup(class {}),
    /methods have changed/,
  );
});
