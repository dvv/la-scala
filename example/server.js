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
  // handle session and context
  sessionHandler = Stack.use('session').session({
    session_key: 'sid',
    secret: 'N.B. change-me-in-production-env',
    path: '/',
    timeout: 86400000,
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
  function(req, res, next) {
    if (req.url === '/ws/sockjs.js') {
      res.writeHead(200);
      res.end('Caught you!');
    } else {
      next();
    }
  },
  // report health status to load balancer
  Stack.use('health')()
];
}

/**
 *
 * Application
 *
 */

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

function authorize(session, cb) {
  // N.B. this is a simple wrapper for static context
  // in real world you should vary capabilities depending on the
  // current user defined in `session`
  if (session && session.uid) {
    cb({
      uid: session.uid,
      // GET /foo?bar=baz ==> this.foo.query('bar=baz')
      foo: {
        query: function(query, aid) {
          this.ack(aid, null, {'you are': 'an authorized user!'});
        }
      },
      bar: {
        baz: {
          add: function(data, aid) {
            this.ack(aid, {'nope': 'nomatter you are an authorized user ;)'});
          }
        }
      },
    });
  } else {
    cb({
      // GET /foo?bar=baz ==> this.foo.query('bar=baz')
      foo: {
        query: function(query, aid) {
          this.ack(aid, null, {'you are': 'a guest!'});
        }
      },
    })
  }
}

/**
 *
 * Workers
 *
 */

var Manager = require('la-scala/websocket');

function Worker(port, host) {
  // HTTP server
  if (!host) host = '127.0.0.1';
  this.http = Stack.listen(stack(), {}, port, host);
  // WebSocket server
  this.ws = new Manager(this.http, {
    prefix: '[/]ws',
    // FIXME: should equal to such used in index.html
    // TODO: serve bundled version: sockjs.js + connection.js?
    sockjs_url: 'sockjs.js',
    jsessionid: false,
    // test
    //disabled_transports: ['websocket']
  });
  this.ws.id = port;
  // handle authentication
  this.ws.use('auth', sessionHandler);
  // handle broadcasting
  this.ws.use('broadcast');
  // handle tagging
  this.ws.use('tags');
  // custom handlers
  this.ws.on('open', function(conn) {
    conn.on('change', function() {
      console.log('CHANGE', arguments);
    });
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
repl.s = function() {
  return s1.ws.conns[Object.keys(s1.ws.conns)[0]];
};
repl.foo = function() {
  return s1.ws.send('foo', 1, 2, 3);
};
repl.inv = function() {
  s1.ws.send('invoke1', ['bar','baz'],1,2,3,4);
};
