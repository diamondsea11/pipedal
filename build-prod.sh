#!/bin/bash
# Run a Clean Production CMake build.

set -e

# Make sure vite dependencies are up to date.
cd vite 
npm install
cd ..

# clean build


if [ "$1" != "--continue" ]; then
    rm -rf build
fi


# configure for release
mkdir -p build
cd build
cmake .. -D CMAKE_BUILD_TYPE=Release  -D CMAKE_VERBOSE_MAKEFILE=ON -G Ninja 
cd ..

# Use all available cores. On the arm64 Pi this was pinned to -j 3; on an
# amd64 desktop (e.g. i5-12500, 12 threads) $(nproc) builds far faster.
# Override with:  PIPEDAL_BUILD_JOBS=N ./build-prod.sh
time cmake --build ./build --target all  --config Release -- -j "${PIPEDAL_BUILD_JOBS:-$(nproc)}"

./makePackage.sh

