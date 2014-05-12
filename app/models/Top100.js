'use strict';

var imports            = require('soop').imports();
// var async              = require('async');
var BitcoreUtil        = require('bitcore/util/util');
var TransactionDb      = imports.TransactionDb || require('../../lib/TransactionDb').default();
// var CONCURRENCY        = 5;

function Top100() {
  this.balanceSat        = 0;

  Object.defineProperty(this, 'balance', {
    get: function() {
      return parseFloat(this.balanceSat) / parseFloat(BitcoreUtil.COIN);
    },
    set:  function(i) {
      this.balance =   i * BitcoreUtil.COIN;
    },
    enumerable: 1,
  });

}

Top100.prototype.list = function(next) {
  TransactionDb.top100(function (err, top100addresses, info) {
    return next(err, top100addresses, info);
  });
  // return next(err);
};

module.exports = require('soop')(Top100);

