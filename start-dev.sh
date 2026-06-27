#!/bin/sh
export PATH="/Users/worapol/.nvm/versions/node/v20.20.2/bin:$PATH"
export NODE="/Users/worapol/.nvm/versions/node/v20.20.2/bin/node"
cd "/Users/worapol/Code/trade-monitor"
exec "/Users/worapol/.nvm/versions/node/v20.20.2/bin/node" \
  "/Users/worapol/Code/trade-monitor/node_modules/.bin/next" dev
