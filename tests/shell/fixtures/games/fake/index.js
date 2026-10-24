// Fixture game folder for build tests, laid out like src/games/<id>/index.js.
const game = {
  id: 'fake',
  name: 'Fake',
  controls: { keyboard: 'SPACE TO WIN', touch: 'TAP TO WIN' },
  bestKey: 'best',
  create(host) {
    let score = 0;
    return {
      start() {
        score = 0;
      },
      update() {
        score += 1;
        host.setScore(score);
      },
      render() {
        host.ctx.fillStyle = host.theme.palette.accent;
        host.ctx.fillRect(0, 0, 8, 8);
      },
      pause() {},
      resume() {},
      destroy() {},
    };
  },
};

export default game;
