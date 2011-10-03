'use strict';

/*!
 *
 * Connection authentication plugin
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
 */

module.exports = function(sessionHandler) {

  // 'auth' handler

  this.on('event', function(conn, event, secret, aid) {

    if (event !== 'auth') return;
    this.debug('AUTH', secret);

    // compose fake HTTP request with passed secret as Cookie:
    var req = { headers: { cookie: secret } };
    // pass this request to vanilla HTTP session handler
    sessionHandler(req, {}, function() {
      // use req.session and req.context
      conn.session = req.session || {};
      // if 'context' plugin applied...
      if (conn.update) {
        // update the context
        conn.update(req.context || {});
      } else {
        conn.context = req.context || {};
      }
      // ack auth
      conn.ack(aid, null, conn.session);
    });

  });

};
