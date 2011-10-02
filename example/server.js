#!/usr/bin/env node
'use strict';

/**
 *
 * HTTP middleware
 *
 */

var Stack = require('la-scala');

var sessionHandler;

function stack() {
return [
  // N.B. static content should be served by special static servers
  // take a look at dvv/farm
  /***
  // serve static content
  Stack.use('static')(__dirname + '/public', 'index.html', {
    // don't force caching at client side
    maxAge: 0,
    // cache in server memory the whole files below this limit
    cacheThreshold: 16384
  }),
  ***/
  // handle session
  sessionHandler = Stack.use('session').session({
    session_key: 'sid',
    secret: 'N.B. change-me-in-production-env',
    path: '/',
    timeout: 86400000
  }),
  // handle authorization
  Stack.use('session').context({
    // called to get current user capabilities
    authorize: authorize
  }),
  // body parser
  Stack.use('body')(),
  // RESTful-ish RPC
  Stack.use('rest')('/rpc/'),
  // handle authentication
  Stack.use('session').auth('/rpc/auth', {
    // called when /rpc/auth is accessed
    authenticate: authenticate
  }),
  // report health status to load balancer
  Stack.use('health')()
];
}

/**
 *
 * Application
 *
 */

// TODO: how to reuse in WebSocket authentication?

function authenticate(session, credentials, cb) {
  // N.B. this is simple "toggle" logic.
  // in real world you should check credentials passed in `credentials`
  // to decide whether to let user in.
  // just assign `null` to session in case of error.
  // session already set? drop session
  if (session) {
    session = null;
  // no session so far? get new session
  } else {
    session = {
      uid: Math.random().toString().substring(2)
    };
  }
  // set the session
  cb(session);
}

// TODO: how to reuse in WebSocket authorization?

function authorize(session, cb) {
  // N.B. this is a simple wrapper for static context
  // in real world you should vary capabilities depending on the
  // current user defined in `session`
  cb({
    guest: {
      // GET /foo?bar=baz ==> this.foo.query('bar=baz')
      foo: {
        query: function(query, cb) {
          // TODO: my Connection uses .ack(ackId, ...) instead of callbacks
          // TODO: how to convert?!
          cb(null, {'you are': 'a guest!'});
        }
      },
    },
    user: {
      // GET /foo?bar=baz ==> this.foo.query('bar=baz')
      foo: {
        query: function(query, cb) {
          cb(null, {'you are': 'an authorized user!'});
        }
      },
    }
  });
}

/**
 *
 * Workers
 *
 */

var Manager = require('sockjs').Server;
// connection plugin
require('connection/sockjs');
// broadcast plugin
require('connection/plugins/broadcast');
// tags plugin
require('connection/plugins/tags');

function Worker(port, host) {
  // HTTP server
  if (!host) host = '127.0.0.1';
  this.http = Stack.listen(stack(), {}, port, host);
  // WebSocket server
  this.ws = new Manager({
    sockjs_url: 'sockjs.js',
    jsessionid: false,
    // test
    //disabled_transports: ['websocket']
  });
  this.ws.id = port;
  // WebSocket connection handler
  this.ws.installHandlers(this.http, {
    prefix: '[/]ws'
  });
  // upgrade server to manager
  this.ws.handleConnections(sessionHandler);
  // handle broadcasting
  this.ws.handleBroadcast();
  // listening to catchall event and pass them to context handlers
  this.ws.on('event', function(conn, event /*, args... */) {
    console.error('EVENT', Array.prototype.slice.call(arguments, 1));
    if (event === 'you typed') {
      //conn.ack(arguments[3], arguments[2]);
      this.forall(conn.id).send('was typed', arguments[2]);
    } else if (event === 'dostress') {
      repl.stress(+arguments[2]);
    } else {
      conn.send.apply(conn, Array.prototype.slice.call(arguments, 1));
    }
  });
  // notify
  console.log('Listening to http://' + host + ':' + port + '. Use Ctrl+C to stop.');
}

// spawn workers
var s1 = new Worker(65401);
/*var s2 = new Worker(65402);
var s3 = new Worker(65403);
var s4 = new Worker(65404);*/

// REPL for introspection
var repl = require('repl').start('node> ').context;
process.stdin.on('close', process.exit);
repl.s1 = s1;
