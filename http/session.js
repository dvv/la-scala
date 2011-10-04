'use strict';

/*!
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
 */

/**
 *
 * Provide session and user capabilities (context) in request object
 *
 */

module.exports.session = function(options) {

  // defaults
  if (!options) options = {};
  var context = options.context || {};

  // we keep session in signed crypted cookies
  var sessionHandler = require('cookie-sessions')(options);

  return function handler(req, res, next) {

    sessionHandler(req, res, function() {

      // always create a session?
      if (options.defaultSession && !req.session) {
        req.session = options.defaultSession;
      }
  
      // if dynamic context getter specified, use it
      if (options.authorize) {
        // given current session, return context
        options.authorize(req.session, function(context) {
          req.context = context || {};
          next();
        });
      // use static context
      } else {
        // default is guest context
        req.context = context.guest || {};
        // user authenticated?
        if (req.session && req.session.uid) {
          // provide user context
          req.context = context.user || req.context;
        }
        // FIXME: admin context somehow?
        next();
      }

    });

  };

};

/**
 *
 * Handle signin/signout
 *
 */

module.exports.auth = function(url, options) {

  // defaults
  if (!url) url = '/rpc/auth';
  if (!options) options = {};

  return function handler(req, res, next) {

    if (req.url === url) {
      // given current session and request body, request new session
      options.authenticate(req.session, req.body, function(session) {
        // falsy session means to remove current session
        if (!session) {
          delete req.session;
        } else {
          req.session = session;
        }
        // go back
        res.writeHead(302, {
          location: req.headers.referer || req.headers.referrer
        });
        res.end();
      });
    } else {
      next();
    }

  };

};
