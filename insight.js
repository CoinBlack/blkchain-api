'use strict';

// require('nodetime').profile({
//     accountKey: 'a05c02bfbd15a64e6960c20b90ee6255e42027e3',
//     appName: 'blkchain-dev'
//   });

//Set the node enviornment variable if not set before
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Module dependencies.
 */
// var newrelic = require('newrelic');
var express = require('express'),
  fs = require('fs'),
  PeerSync = require('./lib/PeerSync'),
  HistoricSync = require('./lib/HistoricSync');

//Initializing system variables
var config = require('./config/config');

/**
 * express app
 */
var expressApp = express();

/**
 * Bootstrap models
 */
var models_path = __dirname + '/app/models';
var walk = function(path) {
  fs.readdirSync(path).forEach(function(file) {
    var newPath = path + '/' + file;
    var stat = fs.statSync(newPath);
    if (stat.isFile()) {
      if (/(.*)\.(js$)/.test(file)) {
        require(newPath);
      }
    }
    else if (stat.isDirectory()) {
      walk(newPath);
    }
  });
};

walk(models_path);

/**
 * p2pSync process
 */

var peerSync = new PeerSync({shouldBroadcast: true});

if (!config.disableP2pSync) {
  peerSync.run();
}

/**
 * historic_sync process
 */
var historicSync = new HistoricSync({
  shouldBroadcastSync: true
});
peerSync.historicSync = historicSync;

if (!config.disableHistoricSync) {
  historicSync.start({}, function(err){
    if (err) {
      var txt = 'ABORTED with error: ' + err.message;
      console.log('[historic_sync] ' + txt);
    }
    if (peerSync) peerSync.allowReorgs = true;
    // historicSync.updateAllAddresses();
    // historicSync.refreshAllAddresses();
  });
}
else
  if (peerSync) peerSync.allowReorgs = true;


//express settings
require('./config/express')(expressApp, historicSync, peerSync);
// expressApp.locals.newrelic = newrelic;
//Bootstrap routes
require('./config/routes')(expressApp);

// socket.io
var server = require('http').createServer(expressApp);
var ios = require('socket.io').listen(server);
require('./app/controllers/socket.js').init(expressApp, ios);

//Start the app by listening on <port>
server.listen(config.port, function(){
    console.log('insight server listening on port %d in %s mode', server.address().port, process.env.NODE_ENV);
});

//expose app
exports = module.exports = expressApp;
