#!/usr/bin/env node
'use strict';

/**
 * HTTP middleware
 */

var Stack = require('la-scala');

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
  Stack.use('session').session({
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

// TODO: how to reuse in WebSocket authentication?

function authenticate(session, credentials, cb) {
  // N.B. this is simple "toggle" logic.
  // in real world you should check credentials passed in `credentials`
  // to decide whether to let user in.
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

function Worker(port, host) {
  // HTTP server
  if (!host) host = '127.0.0.1';
  this.http = Stack.listen(stack(), {}, port, host);
  // WebSocket server
  //this.ws = ...;
  // notify
  console.log('Listening to http://' + host + ':' + port + '. Use Ctrl+C to stop.');
}

// spawn workers
var s1 = new Worker(65401);
var s2 = new Worker(65402);
var s3 = new Worker(65403);
var s4 = new Worker(65404);

// REPL for introspection
var repl = require('repl').start('node> ').context;
process.stdin.on('close', process.exit);
repl.s1 = s1;
