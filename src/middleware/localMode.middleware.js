/**
 * Local Mode Middleware (ADR-019)
 *
 * In local mode (LOCAL_MODE=true) the app runs for one person on their own
 * machine: every session carries the built-in local user, so the usual
 * auth guards pass without a login. Installed right after the session
 * middleware, on Express and on the Socket.IO engine alike, so page
 * requests and socket handshakes see the same user.
 */

const { LOCAL_MODE, LOCAL_USER } = require('../config/constants');

function localModeUser(req, res, next) {
  if (LOCAL_MODE && req.session && !req.session.user) {
    req.session.user = { ...LOCAL_USER };
  }
  next();
}

module.exports = { localModeUser };
