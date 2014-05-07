(function() {
    var redis = require('redis');

    var redisClient = redis.createClient(6379, '127.0.0.1');

    function connectToRedis(callback) {
        redisClient.on('ready', function() {
            console.log('Connected to redis');
            if (callback) {
                callback();
                return;
            }
            // redisTest(callback);
        }).on('end', function() {
            console.log('Connection to redis database as been ended');
        }).once('error', function() {
            if (callback) {
                callback('Error connecting to redis');
            }
        });
    }

    connectToRedis(function(err) {
        if (err) {
            console.log(err);
        }
        // redisClient.quit();
        // console.log('Done!');
    });

    function redisTest(callback) {
        redisClient.multi()
            .del('testAddrZet')
            .zadd('testAddrZet', '10', 'testAddr1')
            .zadd('testAddrZet', '200', 'testAddr1')
            .zadd('testAddrZet', '1000', 'testAddr3')
            .zadd('testAddrZet', '1', 'testAddr4')
            .zadd('testAddrZet', '100', 'testAddr5')
            .zcard('testAddrZet')
            .zcount('testAddrZet', 100, 1000)
            .zrevrangebyscore(['testAddrZet', "+inf", "-inf", "WITHSCORES", "LIMIT", 0, 10],
                function(err, result) {
                    console.log(result);
                })
            .zrevrank('testAddrZet', 'testAddr3')
            .exec(function(err, replies) {
                console.log("MULTI got " + replies.length + " replies");
                replies.forEach(function(reply, index) {
                    console.log("Reply " + index + ": " + reply.toString());
                });
                callback();
            });
    }
    module.exports = {
        redisClient: redisClient
    };
})();
