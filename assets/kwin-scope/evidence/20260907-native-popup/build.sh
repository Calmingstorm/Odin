#!/bin/bash
set -euo pipefail
dnf install -y extra-cmake-modules libepoxy-devel libdrm-devel libinput-devel xcb-util-cursor-devel > /evidence/dependencies.log 2>&1
cmake -S /evidence/source -B /evidence/build -DODIN_KWIN_EXACT_VERSION=6.7.4 -DCMAKE_BUILD_TYPE=Release > /evidence/build.log 2>&1
cmake --build /evidence/build --parallel 2 >> /evidence/build.log 2>&1
cp /evidence/build/odin-scope.so /evidence/odin-scope.so
