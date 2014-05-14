#!/bin/bash
cd /root/blkcahin-api/
sleep 30
INSIGHT_NETWORK=livenet NODE_ENV=production INSIGHT_PUBLIC_PATH=public forever start -c 'node --expose-gc' insight.js
