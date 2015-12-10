'use strict';

var path = require('path'),
    rootPath = path.normalize(__dirname + '/..'),
    env,
    db,
    port,
    b_port,
    p2p_port;

if (process.env.INSIGHT_NETWORK === 'livenet') {
  env = 'livenet';
  db = rootPath + '/db';
  port = '30000';
  b_port = '15715';
  p2p_port = '15714';
}
else {
  env = 'testnet';
  db = rootPath + '/db/testnet';
  port = '30001';
  b_port = '25715';
  p2p_port = '25714';
}

switch(process.env.NODE_ENV) {
  case 'production':
    env += '';
    break;
  case 'test':
    env += ' - test environment';
    break;
  default:
    env += ' - development';
    break;
}

var network = process.env.INSIGHT_NETWORK || 'testnet';

var dataDir = process.env.BLACKCOIND_DATADIR;
var isWin = /^win/.test(process.platform);
var isMac = /^darwin/.test(process.platform);
var isLinux = /^linux/.test(process.platform);
if (!dataDir) {
  if (isWin) dataDir = '%APPDATA%\\Blackcoin\\';
  if (isMac) dataDir = process.env.HOME + '/Library/Application Support/Blackcoin/';
  if (isLinux) dataDir = process.env.HOME + '/.blackcoin/';
}
dataDir += network === 'testnet' ? 'testnet3' : '';

module.exports = {
  root: rootPath,
  publicPath: process.env.INSIGHT_PUBLIC_PATH || false,
  appName: 'Blackchain ' + env,
  apiPrefix: '/api',
  port: port,
  leveldb: db,
  blackcoind: {
    protocol:  process.env.BLACKCOIND_PROTO || 'http',
    user: process.env.BLACKCOIND_USER || 'blackcoinrpc',
    pass: process.env.BLACKCOIND_PASS || 'password',
    host: process.env.BLACKCOIND_HOST || '127.0.0.1',
    port: process.env.BLACKCOIND_PORT || b_port,
    p2pPort: process.env.BLACKCOIND_P2P_PORT || p2p_port,
    dataDir: dataDir,
    // DO NOT CHANGE THIS!
    disableAgent: true
  },
  network: network,
  disableP2pSync: false,
  disableHistoricSync: false,

  // Time to refresh the currency rate. In minutes
  currencyRefresh: 10,
  keys: {
    segmentio: process.env.INSIGHT_SEGMENTIO_KEY
  }
};

