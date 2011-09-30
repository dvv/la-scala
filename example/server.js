#!/usr/bin/env node
'use strict';

/**
 * HTTP middleware
 */

var Stack = require('la-scala').Stack;
function stack() {
return [
  // report health status to load balancer
  Stack.plugin('health')(),
  // body parser
  Stack.plugin('body')(),
  // RESTful-ish RPC
  Stack.plugin('rest')('/rpc', {
    context: {
      // GET /foo?bar=baz ==> this.foo.query('bar=baz')
      foo: {
        query: function(query, cb) {
          cb(null, {foo: 'bar'});
        }
      }
    }
  }),
  /*function(req, res, next) {
    if (req.url === '/rpc/foo') {
      res.writeHead(200)
      res.end('');
    } else {
      next();
    }
  },*/
];
}

function Node(port) {
  // web server
  this.http = Stack.listen(stack(), {}, port);
  // notify
  console.log('Listening to http://*:' + port + '. Use Ctrl+C to stop.');
}

// spawn workers
var s1 = new Node(65401);
var s2 = new Node(65402);
var s3 = new Node(65403);
var s4 = new Node(65404);

// REPL for introspection
var repl = require('repl').start('node> ').context;
process.stdin.on('close', process.exit);
repl.s1 = s1;
