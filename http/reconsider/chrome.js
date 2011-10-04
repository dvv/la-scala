'use strict';

/*!
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
 */

/**
 *
 * Serve templated output, data from req.context.
 *
 */

module.exports = function setup(options) {

  var Fs = require('fs');
  var ENOENT = require('constants').ENOENT;
  var DoT = require('dot');
  DoT.templateSettings.varname = 'ctx';
  var renderer = DoT.template;

  if (!options) options = {};
  if (!options.map) options.map = {};

  return function handler(req, res, next) {
console.log('CHROME', req.uri, options.map[req.uri.pathname]);
    var file;
    if (req.method === 'GET' && (file = options.map[req.uri.pathname])) {
      Fs.readFile(file, function(err, data) {
        if (err) {
          if (err.errno === ENOENT) {
            next();
          } else {
            next(err);
          }
        } else {
          var html = renderer(data.toString('utf8'))(req.context);
          res.writeHead(200);
          res.end(html);
        }
      });
    } else {
      next();
    }
  };

};
