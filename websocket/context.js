/*!
 *
 * Connection shared context plugin
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
 */

(function(Connection, undefined) {
'use strict';

//
// well-known useful functions
//
var slice = Array.prototype.slice;
var push = Array.prototype.push;
var isArray = Array.isArray || function(obj) {
  return toString.call(obj) === '[object Array]';
};
var hasOwn = Object.prototype.hasOwnProperty;

//
// safely determine whether `prop` is an own property of `obj`
//
function has(obj, prop) {
  return hasOwn.call(obj, prop);
}

//
// get the list of object own properties
//
var ownProps = Object.keys || function(obj) {
  var r = [];
  if (obj === Object(obj)) {
    for (var key in obj) if (has(obj, key)) {
      r.push(key);
    }
  }
  return r;
};

//
// curry function
//
var nativeBind = Function.prototype.bind;
function bind(func, obj) {
  if (func.bind === nativeBind && nativeBind) {
    return nativeBind.apply(func, slice.call(arguments, 1));
  }
  var args = slice.call(arguments, 2);
  return function() {
    return func.apply(obj, args.concat(slice.call(arguments)));
  };
}

//
// copy own properties of `additional` to `target`
//
function extend(target, additional) {
  for (var key in additional) {
    if (has(additional, key)) {
      target[key] = additional[key];
    }
  }
  return target;
}

//
// determine loosely if `obj` is callable
//
function isCallable(obj) {
  // N.B. RegExp in V8 is also of type 'function'!
  //return !!(typeof obj === 'function' && obj.call);
  return typeof obj === 'function';
}

//
// determine loosely if `obj` looks like a hash
//
function isHash(obj) {
  return Object(obj) === obj && !isArray(obj) && !isCallable(obj);
}

//
// safely get a deep property of `obj` descending using elements
// in `path`
//
function get(obj, path) {
  var part;
  if (isArray(path)) {
    for (var i = 0, l = path.length; i < l; i++) {
      part = path[i];
      obj = obj && has(obj, part) && obj[part] || null;
    }
    return obj;
  } else if (path == null) {
    return obj;
  } else {
    return obj && has(obj, path) && obj[path] || null;
  }
}

//
// invoke deep method of `this` identified by `path` with
// optional parameters
//
function invoke(path /*, args... */) {
//console.log('INVOKE:'+path.join('.'));
  // find handler
  var context, fn = get(context = this.context, path);
  var args = slice.call(arguments, 1);
  if (isCallable(fn)) {
    // bind callback
    this.ack2cb(args);
    // do call handler
    fn.apply(context, args);
  }
}

//
// perform a deep comparison to check if two objects are equal
//
// thanks documentcloud/underscore
//
function deepEqual(a, b) {
  // check object identity
  if (a === b) return true;
  // different types?
  var atype = typeof a
  var btype = typeof b;
  if (atype !== btype) return false;
  // basic equality test (watch out for coercions)
  if (a == b) return true;
  // one is falsy and the other truthy
  if ((!a && b) || (a && !b)) return false;
  // check dates' integer values
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  // both are NaN?
  if (a !== a && b !== b) return false;
  // compare regular expressions
  if (a.source && b.source && a.test && b.test && a.exec && b.exec)
    return a.source === b.source &&
      a.global === b.global &&
      a.ignoreCase === b.ignoreCase &&
      a.multiline === b.multiline;
  // if a is not an object by this point, we can't handle it
  if (atype !== 'object') return false;
  // check for different array lengths before comparing contents
  if (a.length && (a.length !== b.length)) return false;
  // nothing else worked, deep compare the contents
  var aKeys = ownProps(a);
  var bKeys = ownProps(b);
  // different object sizes?
  if (aKeys.length != bKeys.length) return false;
  // recursive comparison of contents
  for (var key in a) {
    if (!(key in b) || !deepEqual(a[key], b[key])) return false;
  }
  // they are equal
  return true;
}

//
// update `this.context` with `changes`.
// if `options.reset` is truthy, remove all properties first.
// if `options.silent` is truthy, inhibit firing 'change' event
//
function update(changes, options, callback) {
  if (!options) options = {};
  var self = this;
  var context = this.context;
  var achanges = [];
  var ochanges = {};
  // a constant to denote in JSON that this key is really a callable
  var THIS_IS_FUNC = '~-=(){}=-~';

  //
  // deeply extend the `dst` with properties of `src`.
  // if a property of `src` is set to null then remove
  // corresponding property from `dst`.
  // N.B. arrays are cloned
  //
  function deepExtend(dst, src) {
    function _ext(dst, src, root, ochanges) {
      if (!isHash(src)) return dst;
      for (var prop in src) if (has(src, prop)) {
        // compose the path to this property
        var path = root.concat([prop]);
        // skip immutable properties
        // N.B. could use ES5 read-only sugar,
        // but this code must also work in ES3 browsers
        if (prop.charAt(0) === '_') continue;
        // cache new value
        var v = src[prop];
        var isValueArray = isArray(v);
        var isValueCallable = isCallable(v);
        // value is not ordinal?
        if (Object(v) === v) {
          // value is array?
          if (isValueArray) {
            // ...put its copy, not reference
            // TODO: should think how to just push/pop
            v = v.slice();
          // value is object?
          } else {
            // destination has no such property?
            if (!has(dst, prop)) {
              // ...create one
              dst[prop] = {};
            }
          }
        }
        var d = dst[prop];
        // value and destination are null/undefined? just skip
        if (v == null && d == null) continue;
        // destination looks like a hash? recursion needed!
        if (isHash(d) && isHash(v)) {
          // make room for real changes
          if (!has(ochanges, prop)) {
            var newly = true;
            ochanges[prop] = {};
          }
//console.error('RECURSE', d, v, path);
          _ext(d, v, path, ochanges[prop]);
          // if no real changes occured, drop corresponding key
          if (newly && !ownProps(ochanges[prop]).length) {
            delete ochanges[prop];
          }
          /*var chg = {};
          _ext(d, v, path, chg);
          if (ownProps(chg).length) ochanges[prop] = chg;*/
          continue;
        }
        // test if property is really to be changed
        if (deepEqual(v, d)) continue;
        // we are here iff property needs to be changed
        achanges.push([path, v]);
        // new value is undefined or null?
        if (v == null) {
          // ...remove the property
          delete dst[prop];
          // register change
          // N.B. `undefined` is pruned from JSON, so let it be `null`
          ochanges[prop] = null;
        } else {
          // update the property.
          // honor remote functions denoted as THIS_IS_FUNC signatures
//console.log('UPD:' + prop + ':'+v);
          dst[prop] = v === THIS_IS_FUNC ?
            bind(self.send, self, 'invoke', path) :
            v;
          // callables go to remote side as THIS_IS_FUNC signatures
          // which we make live functions there (see above).
          // N.B. recovered functions don't go in changes
          if (v !== THIS_IS_FUNC) {
            ochanges[prop] = isValueCallable ? THIS_IS_FUNC : v;
          }
        }
      }
    }
    _ext(dst, src, [], ochanges);
  }

  // purge old properties
  if (options.reset) {
    for (var i in context) delete context[i];
  }

  // apply changes
  if (isArray(changes)) {
    for (var j = 0; j < changes.length; ++j) {
      // N.B. c === null purges the current context
      if (changes[j] === null) {
        for (var i in context) delete context[i];
      }
      // N.B. false positives may occur in ochanges, since deepEqual()
      // tests the value of previous assignment step:
      // update([{a:1},{a:2},{a:1}]) will always report change to "a"
      deepExtend(context, changes[j]);
    }
  } else {
    deepExtend(context, changes);
  }

  // emit "change" event
  if (!options.silent && achanges.length) {
    this.emit('change', ochanges, achanges);
    // notify remote end of actual changes
    if (ownProps(ochanges).length) {
      return this.send('update', ochanges, options, callback);
    }
  }

  // allow continuation
  if (isCallable(callback)) {
    callback.call(this, null, ochanges);
  }

  // allow chaining
  return this;
};

/**
 * Convert last element of passed arguments array to safe-ack callback
 *
 * @api public
 */

Connection.prototype.ack2cb = function(args) {
  // check if `aid` looks like an id for ack function,
  // and send ack event if it does
  var aid = args[args.length-1];
  if (aid &&
      String(aid).substring(0, Connection.SERVICE_CHANNEL.length)
      === Connection.SERVICE_CHANNEL) {
    args[args.length-1] = bind(this.send, this, aid);
  }
  return args;
};

//
// create shared context
//

function createContext(proto, options) {
  this.context = proto || {};
  // attach event handlers.
  // N.B. we can prevent context from automaticlly applying
  // changes coming from remote side
  if (!options.protect) this.on('update', update);
  this.on('invoke', bind(invoke, this));
  // provide shortcut functions
  this.update = update;
  this.invoke = bind(this.send, this, 'invoke');
}

//
// browser
//
if (typeof window !== 'undefined') {

  var _Connection = Connection;
  window.Connection = function(url, options) {

    // set default options
    options = extend({
    }, options || {});

    // create connection
    var conn = new _Connection(url);

    // create shared context
    createContext.call(conn, options.context, options);
    return conn;

  };

//
// server
//
} else {

  module.exports = function(options) {

    // set default options
    options = extend({
      protect: true
    }, options || {});

    // upgrade connecting clients to have context
    var manager = this;
    manager.on('open', function(conn) {
      // create shared context
      createContext.call(conn, options.context, options);
    });

    // N.B. the rest of logic is left to user code.
    // just add another event listeners!
    // E.G. we could fetch the state:
    //redis.get(conn.id, function(err, result) {
    //  conn.update(result);
    //});

    // notify
    this.log('WebSocket context plugin enabled');

    // return manager
    return manager;
  };

}

})(typeof window !== 'undefined' ? Connection : require('./').Connection);
