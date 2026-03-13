#!/bin/bash
cd "$(dirname "$0")"
echo "Serving from: $(pwd)"
npx serve .
