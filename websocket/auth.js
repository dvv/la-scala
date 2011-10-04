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

  var manager = this;
  this.on('open', function(conn) {
  // 'auth' handler
    conn.on('auth', function(secret, aid) {
      manager.debug('AUTH', secret);
  
      // compose fake HTTP request with passed secret as Cookie:
      var req = { headers: { cookie: secret } };
      // pass this request to vanilla HTTP session handler
      sessionHandler(req, {}, function() {
        // use req.context
        var context = req.context || {};
        conn.context = context;
        // return serialized context
        conn.ack(aid, null, conn.serializeWithFunctions(context));
      });

    });
  });
  // notify
  this.log('WebSocket authentication plugin enabled');

  return this;

};
