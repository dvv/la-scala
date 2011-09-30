#!/usr/bin/env node
'use strict';

/**
 * HTTP middleware
 */

var Stack = require('../').Stack;
function stack() {
return [
  // report health status to load balancer
  Stack.haproxy(),
  // serve static content
  Stack.static(__dirname + '/public', 'index.html', {
    maxAge: 0,
  }),
];
}

function Node(port) {
  // web server
  this.http = Stack.listen(stack(), {}, port);
  // notify
  console.log('Listening to http://*:' + port + '. Use Ctrl+C to stop.');
}

// spawn workers
var s1 = new Node(3001);
var s2 = new Node(3002);
var s3 = new Node(3003);
var s4 = new Node(3004);

// REPL for introspection
var repl = require('repl').start('node> ').context;
process.stdin.on('close', process.exit);
repl.s1 = s1;
