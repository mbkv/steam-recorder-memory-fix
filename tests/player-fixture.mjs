const DEFAULT_MANIFEST =
  'https://steamloopback.host/gamerecordings/clips/test/session.mpd';

function createVideo() {
  return {
    src: null,
    srcObject: null,
    loads: 0,
    getAttribute() {
      return this.src;
    },
    pause() {},
    removeAttribute() {
      this.src = null;
    },
    load() {
      this.loads++;
    },
  };
}

export function createPlayerFixture(manifest = DEFAULT_MANIFEST) {
  const urls = new Set();
  const revoked = [];
  const errors = [];
  const events = [];
  let sequence = 0;

  class Player {
    constructor() {
      this.m_elVideo = createVideo();
    }

    InitVideoControl(result) {
      this.m_strMPD = manifest;
      this.m_mediaSource = {};
      this.m_elVideo.src = `blob:test-${++sequence}`;
      urls.add(this.m_elVideo.src);
      return result;
    }

    Close(result) {
      events.push('original close');
      this.m_mediaSource = null;
      this.m_strMPD = '';
      this.onClose?.();

      if (result instanceof Error) throw result;
      return result;
    }

    PlayMPD() {}
  }

  const options = {
    revokeURL(url) {
      events.push('revoke');
      urls.delete(url);
      revoked.push(url);
    },
    onError(message) {
      errors.push(message);
    },
  };

  return { Player, urls, revoked, errors, events, options };
}
