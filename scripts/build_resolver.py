"""Bundle the pinned syntax parser and the ES5 KinoBase protocol reader."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADER = '''/* Faborn KinoBase reader. Acorn 8.18.0: MIT, see ACORN-LICENSE. */
(function(root,factory){
    if(typeof module==='object' && module.exports) module.exports=factory();
    else root.FabornKinoBase=factory();
}(typeof window!=='undefined'?window:this,function(){
    var module={exports:{}},exports=module.exports;
'''
code = HEADER + (ROOT / 'vendor/acorn.js').read_text() + '\nvar syntax=module.exports;\n'
code += (ROOT / 'src/kinobase-reader.js').read_text() + '\nreturn kinoBaseAnalyzer(syntax);\n}));\n'
(ROOT / 'lib/kinobase.js').write_text(code)
(ROOT / 'lib/ACORN-LICENSE').write_bytes((ROOT / 'vendor/ACORN-LICENSE').read_bytes())
