cmake_minimum_required(VERSION 3.20)
project(odin-kwin-scope VERSION 1.0.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)

find_package(ECM 6.0 REQUIRED NO_MODULE)
list(APPEND CMAKE_MODULE_PATH "${ECM_MODULE_PATH}")
include(KDEInstallDirs)
include(KDECMakeSettings)
find_package(Qt6 6.6 REQUIRED COMPONENTS Core DBus Widgets Quick)
find_package(KF6 6.0 REQUIRED COMPONENTS CoreAddons)
find_package(KWin 6.3 REQUIRED COMPONENTS kwin)
if(DEFINED ODIN_KWIN_EXACT_VERSION AND NOT KWin_VERSION VERSION_EQUAL ODIN_KWIN_EXACT_VERSION)
    message(FATAL_ERROR "KWin ${KWin_VERSION} does not match ODIN_KWIN_EXACT_VERSION=${ODIN_KWIN_EXACT_VERSION}")
endif()

kcoreaddons_add_plugin(odin-scope
    SOURCES odinscope.cpp odinscope.h
    INSTALL_NAMESPACE "kwin/plugins")
target_link_libraries(odin-scope PRIVATE KWin::kwin Qt6::Core Qt6::DBus)
target_compile_options(odin-scope PRIVATE -Wall -Wextra -Wpedantic)
set_target_properties(odin-scope PROPERTIES
    PREFIX ""
    OUTPUT_NAME "odin-scope"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}")
