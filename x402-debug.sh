#!/bin/bash
# Debug wrapper - log stderr only, don't touch stdin/stdout
exec 2> >(tee -a /tmp/openmm-x402.log >&2)
exec node /Users/angeloskappos/Desktop/QBT-Labs/openmm-mcp/dist/index.js "$@"
