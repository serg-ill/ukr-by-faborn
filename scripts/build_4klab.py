#!/usr/bin/env python3
"""Build the optional Tizen worker with Samsung Emscripten 1.39.4.7 (Python 3.9).

Download SDK: https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/download.html
Usage: python3.9 scripts/build_4klab.py --sdk /path/to/emscripten-release-bundle/emsdk
The normal Pages workflow uses the committed binary and does not need this SDK.
"""
import argparse
import os
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--sdk', type=Path, required=True)
    args.add_argument('--build-dir', type=Path, default=ROOT / '_native-build')
    options = args.parse_args()
    sdk = options.sdk.resolve()
    build = options.build_dir.resolve()
    build.mkdir(parents=True, exist_ok=True)
    toolchain = sdk / 'fastcomp'
    emscripten = toolchain / 'emscripten'
    # This SDK ships C++17 constexpr lambdas with C++14 flags. The socket-only
    # link still builds that system library. Correct its two build flags locally.
    system = emscripten / 'tools/system_libs.py'
    source = system.read_text()
    corrected = source.replace("'-std=c++14'", "'-std=c++17'")
    if corrected != source:
        system.write_text(corrected)
    # Samsung forwards host imports in the fastcomp backend but omitted the
    # same mapping in its upstream backend. Keep names as strings for the
    # SDK's existing createWasm() resolver, including its fallback functions.
    compiler_source = emscripten / 'emscripten.py'
    source = compiler_source.read_text()
    old = "  return '{ ' + ', '.join('\"' + k + '\": ' + send_items_map[k] for k in sorted_keys) + ' }'"
    new = "  host_funcs = forwarded_json['Functions'].get('hostFunctions', {})\n  return '{ ' + ', '.join('\"' + k + '\": ' + (json.dumps(host_funcs[send_items_map[k]]) if send_items_map[k] in host_funcs else send_items_map[k]) for k in sorted_keys) + ' }'"
    if old in source:
        compiler_source.write_text(source.replace(old, new))
    nodes = list((sdk / 'node').glob('*/bin/node'))
    if not nodes:
        raise SystemExit('SDK Node executable not found')
    config = build / 'emscripten-config.py'
    config_text = '\n'.join(key + '=' + repr(str(value)) for key, value in {
        'LLVM_ROOT': toolchain / 'bin', 'BINARYEN_ROOT': toolchain,
        'NODE_JS': nodes[0], 'EMSCRIPTEN_ROOT': emscripten,
    }.items()) + '\n'
    if not config.exists() or config.read_text() != config_text:
        config.write_text(config_text)
    # Normalize __FILE__ strings in all dependent libraries as well as our C
    # source. The release binary must not contain the builder's home directory.
    prefix_flags = ' '.join(shlex.quote('-ffile-prefix-map=' + str(path) + '=' + replacement)
                            for path, replacement in [(build, '/faborn-build'), (sdk, '/samsung-sdk'), (ROOT, '/faborn')])
    env = dict(os.environ, EM_CONFIG=str(config), EM_CACHE=str(build / 'cache-release'),
               EM_PORTS=str(build / 'ports'), EMCC_CORES='4', EMCC_CFLAGS=prefix_flags,
               PYTHONHASHSEED='0')
    command = [sys.executable, str(emscripten / 'emcc'),
               str(ROOT / 'src/4klab/native.c'), '-o', str(ROOT / 'lib/4klab/native.js'),
               '--pre-js', str(ROOT / 'src/4klab/pre.js'), '-Os',
               '-s', 'ENVIRONMENT_MAY_BE_TIZEN=1', '-s', 'SOCKET_HOST_BINDINGS=0', '-s', 'USE_CURL=1',
               '-s', 'MODULARIZE=1', '-s', 'EXPORT_NAME=FabornNative',
               '-s', 'ENVIRONMENT=worker', '-s', 'NO_EXIT_RUNTIME=1',
               '-s', 'ALLOW_MEMORY_GROWTH=1', '-s', 'WASM_MEM_MAX=134217728',
               '-s', 'EXPORTED_FUNCTIONS=["_malloc","_free"]',
               '-s', 'EXTRA_EXPORTED_RUNTIME_METHODS=["ccall","UTF8ToString","stringToUTF8","lengthBytesUTF8","FS"]']
    subprocess.run(command, cwd=ROOT, env=env, check=True)


if __name__ == '__main__':
    main()
