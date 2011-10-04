'use strict';

/*!
 *
 * Connection
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
 */

/**
 * Well-known useful shortcuts and shims
 *
 * @api private
 */

var slice = Array.prototype.slice;
var isArray = Array.isArray;

Array.prototype.remove = function(item) {
  var index = this.indexOf(item);
  if (index >= 0) this.splice(index, 1);
};

/**
 * Connection
 *
 * @api public
 */

var Connection = require('sockjs/lib/transport').Session;
Connection.prototype.sendUTF = Connection.prototype.send;

/**
 * Prefix reserved for ack events
 *
 * @api private
 */

Connection.SERVICE_CHANNEL = '/_svc_/';

/**
 * Provide a nonce
 *
 * @api private
 */

Connection.nonce = function() {
  // FIXME: make less guessable
  return Math.random().toString().substring(2);
};

/**
 * Connection: handle incoming messages
 *
 * @api private
 */

function handleSocketMessage(message) {
  if (!message) return;
  message = message.data;
  if (!message) return;
  var args;
  // event?
  if (isArray(args = message)) {
    this.emit.apply(this, args);
  // data?
  } else {
    // emit 'data' event
    this.emit('message', args);
  }
}

/**
 * Flag to apply expiry timeout to following adjacent #send()
 *
 * @api public
 */

Connection.prototype.expire = function(msecs) {
  this._expire = msecs;
  return this;
};

/**
 * Send a message to remote side
 *
 * N.B. we rely on Transport's internal outgoing queue, if any
 *
 * @api public
 */

Connection.prototype.send = function(/* args... */) {
  var self = this;
  var args = slice.call(arguments);
  var ack = args[args.length - 1];
  // reserve an event for acknowledgement and
  // substitute ack id for ack handler, if any
  if (typeof ack === 'function') {
    var aid = Connection.SERVICE_CHANNEL + Connection.nonce();
    this.once(aid, ack);
    // we let `this.expire` control expiry on this ack.
    if (this._expire) {
      setTimeout(function() {
        self.emit(aid, new Error('expired'));
      }, this._expire);
      delete this._expire;
    }
    args[args.length - 1] = aid;
  }
  this.sendUTF(args);
  return this;
};

/**
 * Safely ack execution of event
 *
 * @api public
 */

Connection.prototype.ack = function(aid /*, args... */) {
  // check if `aid` looks like an id for ack function,
  // and send ack event if it does
  if (aid &&
      String(aid).substring(0, Connection.SERVICE_CHANNEL.length)
      === Connection.SERVICE_CHANNEL) {
    this.send.apply(this, arguments);
  }
  return this;
};

/**
 * JSON.stringify passed object converting any functions into
 * event handlers for this connection, and replacing them with
 * corresponding service event names
 *
 * @api public
 */

Connection.prototype.serializeWithFunctions = function(obj) {
  var self = this;
  function replacer(k, v) {
    if (typeof v === 'function') {
      var aid = Connection.SERVICE_CHANNEL + Connection.nonce();
      self.on(aid, v);
      v = aid;
    }
    return v;
  }
  return JSON.stringify(obj, replacer);
};

/**
 * JSON.parse passed string converting any values looking like service
 * event names to real functions which, when called, send these events
 * to the remote side
 *
 * @api public
 */

Connection.prototype.deserializeWithFunctions = function(str) {
  var self = this;
  function reviver(k, v) {
    if (v &&
        String(v).substring(0, Connection.SERVICE_CHANNEL.length)
        === Connection.SERVICE_CHANNEL) {
      v = self.send.bind(self, v);
    }
    return v;
  }
  return JSON.parse(str, reviver);
};

/**
 * WebSocket connections manager
 *
 * @api public
 */

function Manager(httpServer, options) {
  var server = new (require('sockjs').Server)(options);
  server.installHandlers(httpServer);
  // maintain connections
  var mgr = this;
  this.conns = {};
  // 'open' handler
  server.on('open', function(conn) {
    // default handlers
    conn.on('message', handleSocketMessage.bind(conn));
    conn.on('close', function() {
      // unregister connection
      mgr.debug('CLOSE', conn.id);
      delete mgr.conns[conn.id];
    });
    // register connection
    mgr.debug('OPEN', conn.id);
    mgr.conns[conn.id] = conn;
    mgr.emit('open', conn);
  });
}

// inherits from EventEmitter
Manager.prototype.__proto__ = process.EventEmitter.prototype;

// contains Connection
Manager.Connection = Connection;

/**
 * Attach named plugin to this manager.
 *
 * @api public
 */

Manager.prototype.use = function(pluginName, options) {
  if (!this.plugins) this.plugins = {};
  require(__dirname + '/' + pluginName).call(this, options);
  this.plugins[pluginName] = options || true;
  return this;
};

/**
 * Log passed arguments.
 *
 * @api public
 */

// TODO: obey SockJS intrinsic logger, when it will appear ;)
Manager.prototype.log = function() {
  console.log.apply(console, ['MGR', this.id].concat(slice.call(arguments)));
};

Manager.prototype.debug = function() {
  console.log.apply(console, ['MGR', this.id].concat(slice.call(arguments)));
};

module.exports = Manager;
