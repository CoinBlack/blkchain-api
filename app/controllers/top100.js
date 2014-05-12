'use strict';

/**
 * Module dependencies.
 */

var Top100 = require('../models/Top100'),
    common      = require('./common');

exports.show = function(req, res) {
  var top100 = new Top100();
  top100.list(function(err, top100addresses) {
    if (err) {
      return common.handleErrors(err, res);
    }
    else  {
      return res.jsonp(top100addresses);
    }
  });
};

