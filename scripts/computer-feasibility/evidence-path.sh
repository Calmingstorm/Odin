#!/bin/bash
# Caller selects an existing evidence root; never create or traverse its parents.
new_evidence_path() {
  local evidence=$1 prefix=$2 root=${EVIDENCE_ROOT:?Set EVIDENCE_ROOT to an existing absolute directory}
  [[ $root == /* && $root != / && $root != *'/../'* && $root != */.. ]] || return 64
  [[ -d $root && ! -L $root ]] || return 64
  root=$(realpath -e -- "$root") || return 64
  [[ $evidence == "$root"/"$prefix"* && $evidence != *'/../'* ]] || return 64
  [[ $(dirname -- "$evidence") == "$root" && ! -e $evidence && ! -L $evidence ]] || return 64
  [[ $(realpath -m -- "$evidence") == "$evidence" ]] || return 64
}
