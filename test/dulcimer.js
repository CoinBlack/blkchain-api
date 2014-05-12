var dulcimer = require('dulcimer'),
    levelup = require('levelup'),
    async = require('async'),
    dulcimerDb = levelup('../db/addresses', {
        valueEncoding: 'json'
        // ,keyEncoding: 'json'
    });

var AddressModel = new dulcimer.Model({
    address: {
        index: true,
        type: 'string'
    },
    balance: {
        index: true,
        type: 'integer'
    },
    uptodate: {
        index: true,
        type: 'boolean'
    }
}, {
    db: dulcimerDb,
    name: 'TOPADDR-'
});
// var idx = 0;
// var total = 100;
// var STEPS = 1000;
// var step = ~~ (total / STEPS) || 1;
// console.log('Wiping....');
// AddressModel.wipe(function(err) {
//     console.log('Wiping is done. Filling with ' + total + ' records');
//     async.whilst(
//         function() {
//             idx++;
//             idx % step == 0 && console.log(~~(idx / total * 100) + '%');
//             return idx <= total;
//         },
//         function(acb) {
//             var tm;
//             async.series([
//                     function(cb) {
//                         AddressModel.findByIndex('address', 'CHAiN12348eGFtwQsMTVPFfGwQRniAMqw1_', {},
//                             function(err1, addr) {
//                                 err1 && console.log('err1', err1);
//                                 // console.log(addr);
//                                 // !err && AddressModel.update(addr.key, {
//                                 //         balance: addr.balance + 100
//                                 //     },
//                                 //     function(err2, newAddr) {
//                                 //         // addr = addr.toJSON();
//                                 //         err2 && console.log('err2', err2);
//                                 //         // console.log(addr.balance, newAddr.balance);
//                                 //         cb();
//                                 //     });
//                         		cb(addr !== undefined);
//                             });
//                     },
//                     function(cb) {
//                         tm = AddressModel.create({
//                             address: 'CHAiN12348eGFtwQsMTVPFfGwQRniAMqw1_', // + idx,
//                             balance: idx //~~(Math.random() * 100000000000000)
//                         });
//                         cb();
//                     },
//                     function(cb) {
//                         tm.save(function(err) {
//                             cb();
//                         });
//                     },
//                     // function(cb) {
//                     //     if (idx > 5) {
//                     //         AddressModel.findByIndex('address', 'CHAiN12348eGFtwQsMTVPFfGwQRniAMqw1_' + (idx - 5), {},
//                     //             function(err1, addr) {
//                     //                 err1 && console.log('err1', err1);
//                     //                 AddressModel.update(addr.key, {
//                     //                         balance: addr.balance + 100
//                     //                     },
//                     //                     function(err2, newAddr) {
//                     //                         // addr = addr.toJSON();
//                     //                         err2 && console.log('err2', err2);
//                     //                         // console.log(addr.balance, newAddr.balance);
//                     //                         cb();
//                     //                     });
//                     //             });
//                     //         return;
//                     //     }
//                     //     cb();
//                     // }
//                 ],
//                 function(err) {
//                     acb(err);
//                 });
//         },
//         function(err) {
//             console.log('Filling is done. Getting top 10...');
//             AddressModel.all({
//                 sortBy: 'balance',
//                 limit: 10,
//                 reverse: true /*, offset: 10*/
//             }, function(err, tms, info) {
//                 console.log(err, tms.length, info.total);
//                 for (var i = 0, l = tms.length; i < l; i++) {
//                     console.log(tms[i].key, tms[i].address, tms[i].balance);
//                 };
//                 // console.log(tms[9].idx, 20);
//                 console.log('Everything is done');
//             });
//         }
//     );
// });


AddressModel.all({
    sortBy: 'balance',
    limit: 10,
    reverse: true /*, offset: 10*/
}, function(err, tms, info) {
    console.log(err, tms.length, info.total);
    for (var i = 0, l = tms.length; i < l; i++) {
        console.log(tms[i].key, tms[i].address, tms[i].balance, tms[i].uptodate);
    };
    // console.log(tms[9].idx, 20);
    console.log('Everything is done');
});

dulcimerDb.batch()
	.put('TEST-1', 'val1')
	.put('TEST-1', 'val2')
	.put('TEST-1', 'val3')
	.put('TEST-1', 'val4')
	.write(function (err) {
		console.log(err);
		console.log('Batch done!');
		dulcimerDb.get('TEST-1', function (err, value) {
			console.log('Get value:', value);
		})
	})