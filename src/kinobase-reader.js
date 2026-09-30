// Reads the public player's protocol as syntax/data. No source eval, DOM or network.
function kinoBaseAnalyzer(syntax) {
    'use strict';
    function own(o,k) { return Object.prototype.hasOwnProperty.call(o,k); }
    function unique(a) { return a.filter(function (v,i) { return a.indexOf(v) === i; }); }
    function fail() { throw new Error('KinoBase змінив формат плеєра. Потрібне оновлення адаптера.'); }
    function base91(input,alphabet) {
        var bits=0,n=0,v=-1,out='',i,k;
        for (i=0;i<input.length;i++) {
            k=alphabet.indexOf(input.charAt(i)); if (k<0) continue;
            if (v<0) v=k;
            else {
                v+=k*91; bits|=v<<n; n+=(v&8191)>88?13:14;
                do { out+=String.fromCharCode(bits&255); bits>>>=8; n-=8; } while (n>7);
                v=-1;
            }
        }
        if (v>=0) out+=String.fromCharCode((bits|v<<n)&255);
        return out;
    }
    function constantReader(ast) {
        var count=0,steps=0;
        function walk(node,scope,depth) {
            if (!node || typeof node!=='object') return;
            if (++count>80000 || depth>250) fail();
            if (node.type==='FunctionDeclaration') scope.functions[node.id.name]=node;
            node._fbrScope=scope;
            if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|Program)$/.test(node.type)) {
                scope={parent:scope,functions:Object.create(null),bindings:Object.create(null)};
                node._fbrInner=scope;
            }
            if (node.type==='VariableDeclarator' && node.id.type==='Identifier' && node.init) scope.bindings[node.id.name]=node.init;
            if (node.type==='AssignmentExpression' && node.operator==='=' && node.left.type==='Identifier' && !own(scope.bindings,node.left.name)) scope.bindings[node.left.name]=node.right;
            Object.keys(node).forEach(function (key) {
                if (key==='id' || key==='params' || key.indexOf('_fbr')===0) return;
                var v=node[key];
                if (Array.isArray(v)) v.forEach(function (c) { walk(c,scope,depth+1); });
                else if (v && typeof v==='object') walk(v,scope,depth+1);
            });
        }
        walk(ast,{functions:Object.create(null),bindings:Object.create(null)},0);
        function find(scope,kind,name) {
            for (var s=scope;s;s=s.parent) if (own(s[kind],name)) return s[kind][name];
            throw new Error('Non-constant identifier');
        }
        function read(node,scope,env,depth) {
            if (!node || depth>35 || ++steps>500000) throw new Error('Non-constant expression');
            function ev(n) { return read(n,scope,env,depth+1); }
            var a,b,k,fn,params;
            switch (node.type) {
            case 'Literal': return node.value;
            case 'Identifier':
                if (own(env,node.name)) return env[node.name];
                if (node.name==='undefined') return undefined;
                // Initializers resolve in their declaration's scope, not the caller's
                // (the site's constant helpers routinely reuse short function names).
                a=find(scope,'bindings',node.name);
                return read(a,a._fbrScope,Object.create(null),depth+1);
            case 'ArrayExpression': return node.elements.map(ev);
            case 'UnaryExpression':
                a=ev(node.argument);
                switch (node.operator) { case '-':return -a; case '+':return +a; case '!':return !a; case '~':return ~a; case 'void':return undefined; } break;
            case 'ConditionalExpression': return ev(node.test)?ev(node.consequent):ev(node.alternate);
            case 'BinaryExpression':
                a=ev(node.left); b=ev(node.right);
                switch (node.operator) {
                case '+':return a+b; case '-':return a-b; case '*':return a*b; case '/':return a/b; case '%':return a%b;
                case '>':return a>b; case '<':return a<b; case '>=':return a>=b; case '<=':return a<=b;
                case '===':return a===b; case '!==':return a!==b; case '==':return a==b; case '!=':return a!=b;
                case '&':return a&b; case '|':return a|b; case '^':return a^b; case '<<':return a<<b; case '>>':return a>>b; case '>>>':return a>>>b;
                } break;
            case 'MemberExpression':
                a=ev(node.object); k=node.computed?ev(node.property):node.property.name;
                if (!Array.isArray(a) || typeof k!=='number' || k%1 || k<0 || k>=a.length) throw new Error('Non-constant property');
                return a[k];
            case 'CallExpression':
                if (node.callee.type!=='Identifier') throw new Error('Method calls are not allowed');
                fn=find(scope,'functions',node.callee.name);
                if (fn.body.body.length!==1 || fn.body.body[0].type!=='ReturnStatement') throw new Error('Not a constant helper');
                params=Object.create(null);
                fn.params.forEach(function (p,i) { if (p.type!=='Identifier') throw new Error('Unsupported parameter'); params[p.name]=node.arguments[i] ? ev(node.arguments[i]) : undefined; });
                return read(fn.body.body[0].argument,fn._fbrInner,params,depth+1);
            }
            throw new Error('Non-constant expression');
        }
        return function (node) { return read(node,node._fbrScope,Object.create(null),0); };
    }
    function protocol(source) {
        if (typeof source!=='string' || source.length>250000) fail();
        var ast=syntax.parse(source,{ecmaVersion:2020}), read=constantReader(ast);
        var literals=[],arrays=[],offsets=[],checks=[],xor=[];
        function walk(n) {
            if (!n || typeof n!=='object') return;
            if (n.type==='Literal' && typeof n.value==='string') literals.push(n.value);
            if (n.type==='ArrayExpression' && n.elements.length>100) arrays.push(n);
            try {
                if (n.type==='CallExpression' && n.callee.type==='MemberExpression' && n.callee.computed && n.arguments.length===1) {
                    var value=read(n.arguments[0]);
                    if (typeof value==='number' && value>=16 && value<4096) offsets.push(value);
                }
                if (n.type==='BinaryExpression' && n.operator==='%' && n.left.type==='BinaryExpression') {
                    if (n.left.operator==='+' && n.left.left.type==='BinaryExpression' && n.left.left.operator==='*' && n.left.left.left.type==='LogicalExpression') checks.push([read(n.left.left.right),read(n.left.right),read(n.right)]);
                    if (n.left.operator==='^' && read(n.right)===64) xor.push(read(n.left.right));
                }
            } catch (ignore) { /* Read constants only; never run the source's other expressions. */ }
            Object.keys(n).forEach(function (key) {
                if (key.indexOf('_fbr')===0) return;
                var v=n[key]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v==='object') walk(v);
            });
        }
        walk(ast);
        var alphabets=unique(literals.filter(function (s) { return s.length===91 && unique(s.split('')).length===91; }));
        if (!alphabets.length || alphabets.length>24 || !arrays.length || offsets.length!==3 || checks.length!==1 || xor.length!==1 || xor[0]<0 || xor[0]>63) fail();
        var array=arrays.sort(function (a,b) { return b.elements.length-a.elements.length; })[0];
        var words=array.elements.map(function (node) {
            var value; try { value=read(node); } catch (ignore) { return []; }
            if (typeof value!=='string' || value.length>300) return [];
            return unique(alphabets.map(function (a) { return base91(value,a); }).filter(function (s) { return /^[\x20-\x7e]+$/.test(s); }));
        });
        function index(word) { for (var i=0;i<words.length;i++) if (words[i].indexOf(word)>=0) return i; fail(); }
        function one(i,pattern) { var found=(words[i] || []).filter(function (s) { return pattern.test(s); }); if (found.length!==1) fail(); return found[0]; }
        var chk=index('chk'),id=index('identifier'),alphabet=index('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');
        index('/user_data'); index('/vod/');
        var check=checks[0];
        if (!check.every(function (v) { return typeof v==='number' && isFinite(v) && v>0 && v<100000000; })) fail();
        return {userKey:one(chk-2,/^[a-z\d]{10,}$/i),userValue:one(chk-1,/^[a-z\d]{10,}$/i),checkVar:one(chk+1,/^_[a-z\d]+$/i),vodKey:one(id-2,/^[a-z\d]{10,}$/i),vodValue:one(id-1,/^[a-z\d]{10,}$/i),alphabet:one(alphabet+1,/^[a-z\d+/]{64}$/i),separator:one(index('split')+1,/^[a-z\d]{4,}$/i),check:check,xor:xor[0],userOffset:offsets[0]+offsets[1],vodOffset:offsets[2]};
    }
    return {protocol:protocol};
}
