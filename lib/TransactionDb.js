'use strict';

var imports       = require('soop').imports();

// blockHash -> txid mapping 
var IN_BLK_PREFIX = 'txb-'; //txb-<txid>-<block> => 1/0 (connected or not)

// Only for orphan blocks
var FROM_BLK_PREFIX = 'tx-'; //tx-<block>-<txid> => 1 

// to show tx outs
var OUTS_PREFIX = 'txo-'; //txo-<txid>-<n> => [addr, btc_sat]
var SPENT_PREFIX = 'txs-'; //txs-<txid(out)>-<n(out)>-<txid(in)>-<n(in)> = ts

// to sum up addr balance (only outs, spents are gotten later)
var ADDR_PREFIX = 'txa-'; //txa-<addr>-<txid>-<n> => + btc_sat:ts [:<txid>-n](spent)

var ADDR_BAL_PREFIX = 'txab-'; //txab-<addr> => <btc_sat>
var BAL_ADDR_PREFIX = 'txba-'; //txab-<btc_sat>-<addr> => ts
var UPD_ADDR_PREFIX = 'txua-'; //txa-<0/1>-<addr> => ts ; 0 - need to be updated / 1 - updated

var TIMESTAMP_PREFIX  = 'tts-';     // tts-<ts> => <txid>

// TODO: use bitcore networks module
var genesisTXID = '63451e9101b1a50b3d262f23bf83c1f21d6242626e90cffbc4de25effa010000';
var CONCURRENCY = 10;

var MAX_OPEN_FILES    = 500;

var MAX_BALANCE = '000 000 000 000.00000000';
MAX_BALANCE = MAX_BALANCE.replace(/[^\d]/g,'');
// console.log('MAX_BALANCE', MAX_BALANCE);
//  var CONFIRMATION_NR_TO_NOT_CHECK = 10;  //Spend
/**
  * Module dependencies.
  */
var Rpc   = imports.rpc || require('./Rpc'),
  util    = require('bitcore/util/util'),
  // dulcimer = require('dulcimer'),
  levelup = require('levelup'),
  async   = require('async'),
  config  = require('../config/config'),
  assert  = require('assert');
var db    = imports.db || levelup(config.leveldb + '/txs',{maxOpenFiles: MAX_OPEN_FILES} );
// var dulcimerDb = levelup(config.leveldb + '/addresses', {valueEncoding: 'json', keyEncoding: 'json', maxOpenFiles: MAX_OPEN_FILES});
var Script       = require('bitcore/Script');
// This is 0.1.2 = > c++ version of base57-native
var base58       = require('base58-native').base58Check;
var encodedData  = require('soop').load('bitcore/util/EncodedData',{
  base58: base58
});
var versionedData= require('soop').load('bitcore/util/VersionedData',{
  parent: encodedData
});
var Address = require('soop').load('bitcore/Address',{
  parent: versionedData
});
var bitutil = require('bitcore/util/util');
var networks = require('bitcore/networks');

// var MINIMUM_CONFIRMATIONS = 510;


var TransactionDb = function() {
  TransactionDb.super(this, arguments);
  this.network = config.network === 'testnet' ? networks.testnet : networks.livenet;
};

TransactionDb.prototype.close = function(cb) {
  db.close(cb);
};

TransactionDb.prototype.drop = function(cb) {
  var path = config.leveldb + '/txs';
  db.close(function() {
    require('leveldown').destroy(path, function() {
      db = levelup(path, {maxOpenFiles: MAX_OPEN_FILES});
      return cb();
    });
  });
};


TransactionDb.prototype.has = function(txid, cb) {

  var k = OUTS_PREFIX + txid;
  db.get(k, function(err, val) {

    var ret;

    if (err && err.notFound) {
      err = null;
      ret = false;
    }
    if (typeof val !== undefined) {
      ret = true;
    }
    return cb(err, ret);
  });
};

TransactionDb.prototype._addSpentInfo = function(r, txid, index, ts) {
  if (r.spentTxId) {
    if (!r.multipleSpentAttempts) {
      r.multipleSpentAttempts = [{
        txid: r.spentTxId,
        index: r.index,
      }];
    }
    r.multipleSpentAttempts.push({
      txid: txid,
      index: parseInt(index),
    });
  } else {
    r.spentTxId = txid;
    r.spentIndex = parseInt(index);
    r.spentTs = parseInt(ts);
  }
};


// This is not used now
TransactionDb.prototype.fromTxId = function(txid, cb) {
  var self = this;
  var k = OUTS_PREFIX + txid;
  var ret = [];
  var idx = {};
  var i = 0;

  // outs.
  db.createReadStream({
    start: k,
    end: k + '~'
  })
    .on('data', function(data) {
      var k = data.key.split('-');
      var v = data.value.split(':');
      ret.push({
        addr: v[0],
        value_sat: parseInt(v[1]),
        index: parseInt(k[2]),
      });
      idx[parseInt(k[2])] = i++;
    })
    .on('error', function(err) {
      return cb(err);
    })
    .on('end', function() {

      var k = SPENT_PREFIX + txid + '-';
      db.createReadStream({
        start: k,
        end: k + '~'
      })
        .on('data', function(data) {
          var k = data.key.split('-');
          var j = idx[parseInt(k[2])];

          assert(typeof j !== 'undefined', 'Spent could not be stored: tx ' + txid +
            'spent in TX:' + k[1] + ',' + k[2] + ' j:' + j);

          self._addSpentInfo(ret[j], k[3], k[4], data.value);
        })
        .on('error', function(err) {
          return cb(err);
        })
        .on('end', function(err) {
          return cb(err, ret);
        });
    });
};


TransactionDb.prototype._fillSpent = function(info, cb) {
  var self = this;

  if (!info) return cb();

  var k = SPENT_PREFIX + info.txid + '-';
  db.createReadStream({
    start: k,
    end: k + '~'
  })
    .on('data', function(data) {
      var k = data.key.split('-');
      self._addSpentInfo(info.vout[k[2]], k[3], k[4], data.value);
    })
    .on('error', function(err) {
      return cb(err);
    })
    .on('end', function(err) {
      return cb(err);
    });
};


TransactionDb.prototype._fillOutpoints = function(info, cb) {
  var self = this;

  if (!info || info.isCoinBase) return cb();

  var valueIn = 0;
  var incompleteInputs = 0;

  async.eachLimit(info.vin, CONCURRENCY, function(i, c_in) {
      self.fromTxIdN(i.txid, i.vout, info.confirmations, function(err, ret) {
        //console.log('[TransactionDb.js.154:ret:]',ret); //TODO
        if (!ret || !ret.addr || !ret.valueSat) {
          console.log('Could not get TXouts in %s,%d from %s ', i.txid, i.vout, info.txid);
          if (ret) i.unconfirmedInput = ret.unconfirmedInput;
          incompleteInputs = 1;
          return c_in(); // error not scalated
        }

        info.firstSeenTs = ret.spentTs;
        i.unconfirmedInput = i.unconfirmedInput;
        i.addr = ret.addr;
        i.valueSat = ret.valueSat;
        i.value = ret.valueSat / util.COIN;
        valueIn += i.valueSat;

/*        
*        If confirmed by blackcoind, we could not check for double spents
*        but we prefer to keep the flag of double spent attempt
*
        if (info.confirmations
            && info.confirmations >= CONFIRMATION_NR_TO_NOT_CHECK)
          return c_in();
isspent
*/
        // Double spent?
        // if (ret.multipleSpentAttempt || !ret.spentTxId ||
        //   (ret.spentTxId && ret.spentTxId !== info.txid)
        // ) {
        //   if (ret.multipleSpentAttempts) {
        //     ret.multipleSpentAttempts.each(function(mul) {
        //       if (mul.spentTxId !== info.txid) {
        //         i.doubleSpentTxID = ret.spentTxId;
        //         i.doubleSpentIndex = ret.spentIndex;
        //       }
        //     });
        //   } else if (!ret.spentTxId) {
        //     i.dbError = 'Input spent not registered';
        //   } else {
        //     i.doubleSpentTxID = ret.spentTxId;
        //     i.doubleSpentIndex = ret.spentIndex;
        //   }
        // } else {
          i.doubleSpentTxID = null;
        // }
        return c_in();
      });
    },
    function() {
      if (!incompleteInputs) {
        info.valueIn = valueIn / util.COIN;
        info.fees = (valueIn - parseInt(info.valueOut * util.COIN)) / util.COIN;
      } else {
        info.incompleteInputs = 1;
      }
      return cb();
    });
};

TransactionDb.prototype._getInfo = function(txid, next) {
  var self = this;

  Rpc.getTxInfo(txid, function(err, info) {
    if (err) return next(err);
    self._fillOutpoints(info, function() {
      self._fillSpent(info, function() {
        return next(null, info);
      });
    });
  });
};


// Simplified / faster Info version: No spent / outpoints info.
TransactionDb.prototype.fromIdInfoSimple = function(txid, cb) {
  Rpc.getTxInfo(txid, true, function(err, info) {
    if (err) return cb(err);
    if (!info) return cb();
    return cb(err, info);
  });
};

TransactionDb.prototype.fromIdWithInfo = function(txid, cb) {
  var self = this;

  self._getInfo(txid, function(err, info) {
    if (err) return cb(err);
    if (!info) return cb();
    return cb(err, {
      txid: txid,
      info: info
    });
  });
};

TransactionDb.prototype.fromTxIdN = function(txid, n, confirmations, cb) {
  var self = this;
  var k = OUTS_PREFIX + txid + '-' + n;

  db.get(k, function(err, val) {
    if (!val || (err && err.notFound)) {
      return cb(null, {
        unconfirmedInput: 1
      });
    }

    var a = val.split(':');
    var ret = {
      addr: a[0],
      valueSat: parseInt(a[1]),
    };

    /* 
      * If this TxID comes from an RPC request 
      * the .confirmations value from blackcoind is available
      * so we could avoid checking if the input were double spented
      *
      * This speed up address calculations by ~30%
      *
      if (confirmations >= CONFIRMATION_NR_TO_NOT_CHECK) {
        return cb(null, ret);
      }
    */

    // spent?
    var k = SPENT_PREFIX + txid + '-' + n + '-';
    db.createReadStream({
      start: k,
      end: k + '~'
    })
      .on('data', function(data) {
        var k = data.key.split('-');
        self._addSpentInfo(ret, k[3], k[4], data.value);
      })
      .on('error', function(error) {
        return cb(error);
      })
      .on('end', function() {
        return cb(null, ret);
      });
  });
};

TransactionDb.prototype.fillConfirmations = function(o, cb) {
  var self = this;

  self.isConfirmed(o.txid, function(err, is) {
    if (err) return cb(err);

    o.isConfirmed = is;
    if (!o.spentTxId) return cb();

    if (o.multipleSpentAttempts) {

      async.eachLimit(o.multipleSpentAttempts, CONCURRENCY,
        function(oi, e_c) {
          self.isConfirmed(oi.spentTxId, function(err, is) {
            if (err) return;
            if (is) {
              o.spentTxId = oi.spentTxId;
              o.index = oi.index;
              o.spentIsConfirmed = 1;
            }
            return e_c();
          });
        }, cb);
    } else {
      self.isConfirmed(o.spentTxId, function(err, is) {
        if (err) return cb(err);
        o.spentIsConfirmed = is;
        return cb();
      });
    }
  });
};

TransactionDb.prototype.fromAddr = function(addr, cb) {
  var self = this;

  var k = ADDR_PREFIX + addr + '-';
  var ret = [];

  db.createReadStream({
    start: k,
    end: k + '~'
  })
    .on('data', function(data) {
      var k = data.key.split('-');
      var v = data.value.split(':');
      ret.push({
        txid: k[2],
        index: parseInt(k[3]),
        value_sat: parseInt(v[0]),
        ts: parseInt(v[1]),
      });
    })
    .on('error', function(err) {
      return cb(err);
    })
    .on('end', function() {

      async.eachLimit(ret, CONCURRENCY, function(o, e_c) {
          var k = SPENT_PREFIX + o.txid + '-' + o.index + '-';
          db.createReadStream({
            start: k,
            end: k + '~'
          })
            .on('data', function(data) {
              var k = data.key.split('-');
              self._addSpentInfo(o, k[3], k[4], data.value);
            })
            .on('error', function(err) {
              return e_c(err);
            })
            .on('end', function(err) {
              return e_c(err);
            });
        },
        function() {
          async.eachLimit(ret, CONCURRENCY, function(o, e_c) {
            self.fillConfirmations(o, e_c);
          }, function(err) {
            return cb(err, ret);
          });
        });
    });
};

TransactionDb.prototype.updateAddress = function(addr, notxlist, cb) {
  var address = {
    txApperances: 0,
    totalReceivedSat: 0,
    totalSentSat: 0,
    balanceSat: 0,
    unconfirmedBalanceSat: 0,
    unconfirmedTxApperances: 0
  };
  var seen={};
  var txs  = [];
  // if (!notxlist === undefined) {notxlist = true;}
  this.fromAddr(addr, function(err,txOut){
    if (err && cb) {cb(err);}
    address.addr = addr;
    txOut.forEach(function(txItem){
      var add=0, addSpend=0;
      var v = txItem.value_sat;

      if ( !seen[txItem.txid] ) {
        if (!notxlist) {
          txs.push({txid: txItem.txid, ts: txItem.ts});
        }
        seen[txItem.txid]=1;
        add=1;
      }

      if (txItem.spentTxId && !seen[txItem.spentTxId]  ) {
        if (!notxlist) {
          txs.push({txid: txItem.spentTxId, ts: txItem.spentTs});
        }
        seen[txItem.spentTxId]=1;
        addSpend=1;
      }

      if (txItem.isConfirmed) {
        address.txApperances += add;
        address.totalReceivedSat += v;
        if (! txItem.spentTxId ) {
          //unspent
          address.balanceSat   += v;
        }
        else if(!txItem.spentIsConfirmed) {
          // unspent
          address.balanceSat   += v;
          address.unconfirmedBalanceSat -= v;
          address.unconfirmedTxApperances += addSpend;
        }
        else {
          // spent
          address.totalSentSat += v;
          address.txApperances += addSpend;
        }
      }
      else {
        address.unconfirmedBalanceSat += v;
        address.unconfirmedTxApperances += add;
      }
    });
// console.log(address);

    db.get(ADDR_BAL_PREFIX + addr, function (err, value) {
      // console.log(err, value);
      var balanceStr = '' + address.balanceSat;
      balanceStr = MAX_BALANCE.substr(0, MAX_BALANCE.length - balanceStr.length) + balanceStr;
      db.batch()
        // .del(ADDR_BAL_PREFIX + addr)
        .del(BAL_ADDR_PREFIX + value + '-' + addr)
        .put(BAL_ADDR_PREFIX + balanceStr + '-' + addr, Date.now()/* + '-1'*/)
        .put(ADDR_BAL_PREFIX + addr, balanceStr)
        .del(UPD_ADDR_PREFIX + '0-' + addr)
        .put(UPD_ADDR_PREFIX + '1-' + addr, Date.now())
        .write(function (err) {
          // console.log('write', BAL_ADDR_PREFIX + address.balanceSat + '-' + addr, ADDR_BAL_PREFIX + addr, address.balanceSat);
          if (cb) { cb(err, address, txs);}
        });
    });
  });
};

//var ADDR_PREFIX = 'txa-'; //txa-<addr>-<txid>-<n> => + btc_sat:ts [:<txid>-n](spent)
TransactionDb.prototype.updateAllAddresses = function(cb) {
  var self = this;
  // var addrUpd = [];
  var count = 0;
  db.createReadStream({
    start: UPD_ADDR_PREFIX + '0-',
    end: UPD_ADDR_PREFIX + '0-~'
  })
    .on('data', function(data) {
      var arr = data.key.split('-');
      // console.log('data', data, arr);
      var addr = arr[2];
      count++;
      self.updateAddress(addr, true, function (err) {
        if (err) {console.log(err);}
        if (count % 100 === 0) {
          console.log(count + ' address balances updated so far');
        }
      });
    })
    .on('error', function(err) {
      console.log(err);
      // return c(err);
      cb(err);
    })
    .on('end', function(err) {
      // console.log('addrUpd', addrUpd);
      cb(err, count);
      // return c(err, ret);
    });
};

TransactionDb.prototype.top100 = function(cb) {

  var result = [];
  db.createReadStream({
    start: BAL_ADDR_PREFIX + '~',
    end: BAL_ADDR_PREFIX,
    reverse: true,
    limit: 100
  })
    .on('data', function(data) {
      var arr = data.key.split('-');
      // console.log('data', data, arr);
      var balanceStr = '' + +arr[1] / util.COIN;
      var pointIndex = balanceStr.indexOf('.');
      pointIndex = pointIndex === -1 ? (balanceStr += '.', balanceStr.length) : pointIndex;
      var coinStr = '' + util.COIN;
      var coinZeroNum = coinStr.length;
      var additionalZeroNum = coinZeroNum - (balanceStr.length - pointIndex);
      result.push({balance: balanceStr + coinStr.substr(1, additionalZeroNum), address: arr[2], ts: data.value});
    })
    .on('error', function(err) {
      console.log(err);
      // return c(err);
      cb(err);
    })
    .on('end', function(err) {
      // console.log('result', result);
      cb(err, {
        addresses: result
      });
      // return c(err, ret);
    });
};

TransactionDb.prototype.removeFromTxId = function(txid, cb) {

  async.series([

      function(c) {
        db.createReadStream({
          start: OUTS_PREFIX + txid + '-',
          end: OUTS_PREFIX + txid + '~',
        }).pipe(
          db.createWriteStream({
            type: 'del'
          })
        ).on('close', c);
      },
      function(c) {
        db.createReadStream({
          start: SPENT_PREFIX + txid + '-',
          end: SPENT_PREFIX + txid + '~'
        }).pipe(
            db.createWriteStream({
              type: 'del'
            })
        ).on('close', c);
      }
    ],
    function(err) {
      cb(err);
    });

};


// TODO. replace with 
// Script.prototype.getAddrStrs if that one get merged in bitcore
TransactionDb.prototype.getAddrStr = function(s) {
  var self = this;

  var addrStrs = [];
  var type = s.classify();
  var addr;

  switch (type) {
    case Script.TX_PUBKEY:
      var chunk = s.captureOne();
      addr = new Address(self.network.addressPubkey, bitutil.sha256ripe160(chunk));
      addrStrs.push(addr.toString());
      break;
    case Script.TX_PUBKEYHASH:
      addr = new Address(self.network.addressPubkey, s.captureOne());
      addrStrs.push(addr.toString());
      break;
    case Script.TX_SCRIPTHASH:
      addr = new Address(self.network.addressScript, s.captureOne());
      addrStrs.push(addr.toString());
      break;
    case Script.TX_MULTISIG:
      var chunks = s.capture();
      chunks.forEach(function(chunk) {
        if (chunk && Buffer.isBuffer(chunk)) {
          var a = new Address(self.network.addressPubkey, bitutil.sha256ripe160(chunk));
          addrStrs.push(a.toString());
        }
      });
      break;
    case Script.TX_UNKNOWN:
      break;
  }

  return addrStrs;
};

TransactionDb.prototype.adaptTxObject = function(txInfo) {
  var self = this;
  // adapt bitcore TX object to blackcoind JSON response
  txInfo.txid = txInfo.hash;


  var to = 0;
  var tx = txInfo;
  if (tx.outs) {
    tx.outs.forEach(function(o) {
      var s = new Script(o.s);
      var addrs = self.getAddrStr(s);

      // support only for p2pubkey p2pubkeyhash and p2sh
      if (addrs.length === 1) {
        tx.out[to].addrStr = addrs[0];
        tx.out[to].n = to;
      }
      to++;
    });
  }

  var count = 0;
  txInfo.vin = txInfo.in.map(function(txin) {
    var i = {};

    if (txin.coinbase) {
      txInfo.isCoinBase = true;
    } else {
      i.txid = txin.prev_out.hash;
      i.vout = txin.prev_out.n;
    }
    i.n = count++;
    return i;
  });


  count = 0;
  txInfo.vout = txInfo.out.map(function(txout) {
    var o = {};

    o.value = txout.value;
    o.n = count++;

    if (txout.addrStr) {
      o.scriptPubKey = {};
      o.scriptPubKey.addresses = [txout.addrStr];
    }
    return o;
  });
};


// var errs = [];
TransactionDb.prototype.add = function(tx, blockhash, cb) {
  var self = this;
  var addrs = [];
  // console.log(tx.hash);
  if (tx.hash) self.adaptTxObject(tx);

  var ts = tx.time;
// console.log(tx.confirmations);

  async.series([
    // Input Outpoints (mark them as spent)
    function(p_c) {
      if (tx.isCoinBase) return p_c();
      async.forEachLimit(tx.vin, CONCURRENCY,
        function(i, next_out) {
          self.fromTxIdN(i.txid, i.vout, 0, function(err, ret) {
            if (!ret || !ret.addr || !ret.valueSat) {
              console.log('Could not get TXouts in %s,%d from %s ', i.txid, i.vout, tx.txid);
              return;
            }
            // console.log(UPD_ADDR_PREFIX + '0-' + ret.addr);
            db.put(UPD_ADDR_PREFIX + '0-' + ret.addr, Date.now());
          });
          db.batch()
            .put(SPENT_PREFIX + i.txid + '-' + i.vout + '-' + tx.txid + '-' + i.n, ts || 0)
            .write(next_out);
        },
        function(err) {
          return p_c(err);
        });
    },
    // Parse Outputs
    function(p_c) {
      async.forEachLimit(tx.vout, CONCURRENCY,
        function(o, next_out) {
          // console.log('--------------------------------------------',o);
          if (o.value && o.scriptPubKey &&
            o.scriptPubKey.addresses &&
            o.scriptPubKey.addresses[0] && !o.scriptPubKey.addresses[1] // TODO : not supported
          ) {
            var addr = o.scriptPubKey.addresses[0];
            var sat = Math.round(o.value * util.COIN);

            if (addrs.indexOf(addr) === -1) {
              addrs.push(addr);
            }

            // existed? 
            var k = OUTS_PREFIX + tx.txid + '-' + o.n;
              // console.log('--------------', addr, sat, k);
            db.get(k, function(err) {
              // console.log('--------------', k, addr + ':' + sat);
              // console.log('--------------', ADDR_PREFIX + addr + '-' + tx.txid + '-' + o.n, sat + ':' + ts);
              if (err && err.notFound) {
                db.batch()
                  .put(k, addr + ':' + sat)
                  .put(ADDR_PREFIX + addr + '-' + tx.txid + '-' + o.n, sat + ':' + ts)
                  .put(UPD_ADDR_PREFIX + '0-' + addr, Date.now())
                  .write(next_out);
              } else {
                return next_out();
              }
            });
          } else {
            return next_out();
          }
        },
        function(err) {
          if (err) {
            console.log('ERR at TX %s: %s', tx.txid, err);
            return cb(err);
          }
          return p_c();
        });
    },
    function(p_c) {
      if (!blockhash) {
        return p_c();
      }
      return self.setConfirmation(tx.txid, blockhash, true, p_c);
    },
  ], function(err) {
    if (addrs.length > 0 && !blockhash) {
      // only emit if we are processing a single tx (not from a block)
      tx.addrsToEmit=addrs;
      var time_key = TIMESTAMP_PREFIX + Math.round(Date.now() / 1000);
      db.put(time_key, tx.txid, function(err) {
        return cb(err);
      });
    } else {
      return cb(err);
    }
  });
};



TransactionDb.prototype.setConfirmation = function(txId, blockHash, confirmed, c) {
  if (!blockHash) return c();

  confirmed = confirmed ? 1 : 0;

  db.batch()
    .put(IN_BLK_PREFIX + txId + '-' + blockHash, confirmed)
    .put(FROM_BLK_PREFIX + blockHash + '-' + txId, 1)
    .write(c);
};


// This slowdown addr balance calculation by 100%
TransactionDb.prototype.isConfirmed = function(txId, c) {
  var k = IN_BLK_PREFIX + txId;
  var ret = false;

  db.createReadStream({
    start: k,
    end: k + '~'
  })
    .on('data', function(data) {
      if (data.value === '1') ret = true;
    })
    .on('error', function(err) {
      return c(err);
    })
    .on('end', function(err) {
      return c(err, ret);
    });
};

TransactionDb.prototype.handleBlockChange = function(hash, isMain, cb) {
  var toChange = [];
  console.log('\tSearching Txs from block:' + hash);

  var k = FROM_BLK_PREFIX + hash;
  var k2 = IN_BLK_PREFIX;
  // This is slow, but prevent us to create a new block->tx index.
  db.createReadStream({
    start: k,
    end: k + '~'
  })
    .on('data', function(data) {
      var ks = data.key.split('-');
      toChange.push({
        key: k2 + ks[2] + '-' + ks[1],
        type: 'put',
        value: isMain ? 1 : 0,
      });
    })
    .on('error', function(err) {
      return cb(err);
    })
    .on('end', function(err) {
      if (err) return cb(err);
      console.log('\t%s %d Txs', isMain ? 'Confirming' : 'Invalidating', toChange.length);
      db.batch(toChange, cb);
    });
};

// txs can be a [hashes] or [txObjects]
TransactionDb.prototype.createFromArray = function(txs, blockHash, next) {
  var self = this;
  if (!txs) return next();

  async.forEachLimit(txs, CONCURRENCY, function(t, each_cb) {
      if (typeof t === 'string') {
        // TODO: parse it from networks.genesisTX?
        if (t === genesisTXID) return each_cb();

        Rpc.getTxInfo(t, function(err, inInfo) {
          if (!inInfo) return each_cb(err);

          return self.add(inInfo, blockHash, each_cb);
        });
      } else {
        return self.add(t, blockHash, each_cb);
      }
    },
    function(err) {
      return next(err);
    });
};


TransactionDb.prototype.createFromBlock = function(b, next) {
  var self = this;
  if (!b || !b.tx) return next();

  return self.createFromArray(b.tx, b.hash, next);
};

TransactionDb.prototype.getLatestTransactions = function(start_ts, limit, cb) {
  var list = [];
  db.createReadStream({
    start: TIMESTAMP_PREFIX + start_ts,
    limit: limit,
    reverse: true,
    fillCache: true
    })
    .on('data', function (data) {
      // var k = data.key.split('-');
      list.push(data.value);
    })
    .on('error', function (err) {
      return cb(err);
    })
    .on('end', function () {
      return cb(null, list);
      // return cb(null, list.reverse());
    });
};


module.exports = require('soop')(TransactionDb);
