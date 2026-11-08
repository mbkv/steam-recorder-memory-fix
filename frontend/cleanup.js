const RECORDING_HOOK = Symbol.for('io.github.mbkv.steam-recorder-memory-fix');

function captureRecording(player) {
  if (!player.m_mediaSource) return null;

  let source;
  try {
    source = new URL(player.m_strMPD, 'https://steamloopback.host/');
  } catch {
    return null;
  }

  if (
    source.hostname !== 'steamloopback.host' ||
    !source.pathname.startsWith('/gamerecordings/')
  ) {
    return null;
  }

  const video = player.m_elVideo;
  const url = video?.getAttribute('src');
  return url?.startsWith('blob:') ? { video, url } : null;
}

/** Release recording media on close without retaining discarded players. */
export function installRecordingCleanup(
  Player,
  {
    revokeURL = (url) => URL.revokeObjectURL(url),
    onError = (message) => console.warn(message),
  } = {},
) {
  const prototype = Player?.prototype;
  if (!prototype) throw new Error('Recording player not found');

  // Remove an earlier installation before wrapping the methods again.
  prototype[RECORDING_HOOK]?.();

  const originalInit = Object.getOwnPropertyDescriptor(
    prototype,
    'InitVideoControl',
  );
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'Close');
  if (
    typeof originalInit?.value !== 'function' ||
    typeof originalClose?.value !== 'function'
  ) {
    throw new Error('Recording player methods have changed');
  }

  let active = true;
  let records = new WeakMap();

  function reportError(error) {
    try {
      onError(String(error));
    } catch {
      // Logging must not interrupt Steam's player methods.
    }
  }

  function releaseURL(record) {
    try {
      revokeURL(record.url);
    } catch (error) {
      reportError(error);
    }
  }

  function resetVideo(record) {
    try {
      const { video, url } = record;

      // A close callback may already have assigned the next clip's source.
      if (video.getAttribute('src') !== url) return;

      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    } catch (error) {
      reportError(error);
    }
  }

  function initialize(...args) {
    const result = Reflect.apply(originalInit.value, this, args);
    if (!active) return result;

    try {
      const previous = records.get(this);
      const current = captureRecording(this);

      if (previous && previous.url !== current?.url) releaseURL(previous);

      records.delete(this);
      if (current) records.set(this, current);
    } catch (error) {
      reportError(error);
    }

    return result;
  }

  function close(...args) {
    if (!active) return Reflect.apply(originalClose.value, this, args);

    let record;
    try {
      record = records.get(this) || captureRecording(this);
    } catch (error) {
      reportError(error);
    }
    records.delete(this);

    try {
      return Reflect.apply(originalClose.value, this, args);
    } finally {
      if (active && record) {
        releaseURL(record);
        resetVideo(record);
      }
    }
  }

  function uninstall() {
    if (!active) return;

    active = false;
    records = new WeakMap();

    if (prototype.InitVideoControl === initialize) {
      Object.defineProperty(prototype, 'InitVideoControl', originalInit);
    }
    if (prototype.Close === close) {
      Object.defineProperty(prototype, 'Close', originalClose);
    }
    if (prototype[RECORDING_HOOK] === uninstall) {
      delete prototype[RECORDING_HOOK];
    }
  }

  try {
    Object.defineProperty(prototype, 'InitVideoControl', {
      ...originalInit,
      value: initialize,
    });
    Object.defineProperty(prototype, 'Close', {
      ...originalClose,
      value: close,
    });
    Object.defineProperty(prototype, RECORDING_HOOK, {
      value: uninstall,
      configurable: true,
    });
  } catch (error) {
    uninstall();
    throw error;
  }

  return uninstall;
}
