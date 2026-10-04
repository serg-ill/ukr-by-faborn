'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const installer = path.resolve(__dirname, '../server/uakinogo/install.sh');
function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faborn-install-test-'));
    t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
    return dir;
}
function shell(code, env={}) {
    return spawnSync('bash', ['-c', 'source "$INSTALLER"\n'+code], {
        encoding:'utf8', env:{...process.env, INSTALLER:installer, TEST_NODE:process.execPath, ...env}
    });
}
const listener='LISTEN 0 511 0.0.0.0:8787 0.0.0.0:* users:(("other",pid=42,fd=7))';

test('installer validates an explicit port before changing or probing the host', () => {
    for (const value of ['0','65536','999999999999','abc','8788; touch /tmp/unwanted']) {
        const r=spawnSync('bash',[installer,'--port',value],{encoding:'utf8'});
        assert.equal(r.status,2); assert.match(r.stderr,/--port requires/);
    }
    const r=spawnSync('bash',[installer,'--help'],{encoding:'utf8'});
    assert.equal(r.status,0); assert.match(r.stdout,/--port NUMBER/);
});
test('a foreign listener on 8787 causes automatic selection of the free 8788', () => {
    const r=shell('ss() { [[ "$3" != "sport = :8787" ]] || printf "%s\\n" "$LISTENER"; return 0; }\nchoose_port "" 8787 0', {LISTENER:listener});
    assert.equal(r.status,0); assert.equal(r.stdout.trim(),'8788');
    assert.match(r.stderr,/8787 is occupied/);
});
test('an explicitly occupied port fails without silently moving to a different port', () => {
    const r=shell('ss() { printf "%s\\n" "$LISTENER"; }\nchoose_port 8787 8787 0',{LISTENER:listener});
    assert.equal(r.status,1); assert.equal(r.stdout,''); assert.match(r.stderr,/--port/);
});
test('a running Faborn listener retains its port for updates, but shared or unidentified sockets do not', () => {
    let r=shell('ss() { printf "%s\\n" "$LISTENER"; }\nchoose_port "" 8787 42',{LISTENER:listener});
    assert.equal(r.status,0); assert.equal(r.stdout.trim(),'8787');
    for (const value of [listener.replace('fd=7))','fd=7),("other2",pid=99,fd=8))'), 'LISTEN 0 511 0.0.0.0:8787 0.0.0.0:*']) {
        r=shell('ss() { [[ "$3" != "sport = :8787" ]] || printf "%s\\n" "$LISTENER"; return 0; }\nchoose_port "" 8787 42',{LISTENER:value});
        assert.equal(r.status,0); assert.equal(r.stdout.trim(),'8788');
    }
});
test('port inspection failures and exhaustion stop instead of treating a port as free', () => {
    let r=shell('ss() { return 1; }\nchoose_port "" 8787 0');
    assert.equal(r.status,2); assert.match(r.stderr,/Cannot inspect/);
    r=shell('ss() { printf "%s\\n" "$LISTENER"; }\nchoose_port "" 65535 0',{LISTENER:listener});
    assert.equal(r.status,1); assert.equal(r.stdout,'');
});
test('existing configured ports, including quoted values, are read without executing the environment file', t => {
    const dir=fixture(t), file=path.join(dir,'resolver.env'), marker=path.join(dir,'must-not-exist');
    fs.writeFileSync(file,'HOST=0.0.0.0\nPORT="08788"\nFABORN_ACCESS_KEYS=$(touch '+marker+')\n');
    let r=shell('read_port "$ENV_FILE"',{ENV_FILE:file});
    assert.equal(r.status,0); assert.equal(r.stdout.trim(),'8788'); assert.equal(fs.existsSync(marker),false);
    fs.writeFileSync(file,'PORT=not-a-port\n');
    r=shell('read_port "$ENV_FILE"',{ENV_FILE:file});
    assert.equal(r.status,2); assert.match(r.stderr,/Invalid PORT/);
});
test('changing the port preserves host and access keys, removes duplicate PORT entries, and keeps mode 600', t => {
    const dir=fixture(t), file=path.join(dir,'resolver.env');
    const untouched='# existing settings\nHOST=0.0.0.0\nFABORN_ACCESS_KEYS=fixture,another\n';
    fs.writeFileSync(file,untouched+'PORT=8787\nPORT=9000\n');
    const r=shell('write_port "$ENV_FILE" 8788',{ENV_FILE:file});
    assert.equal(r.status,0); assert.equal(fs.readFileSync(file,'utf8'),untouched+'PORT=8788\n');
    assert.equal(fs.statSync(file).mode & 0o777,0o600);
});
test('health checks reject a different process before calling its HTTP endpoint', t => {
    const dir=fixture(t), calls=path.join(dir,'curl-called');
    const r=shell('port=8787\nstage="$FIXTURE"\nsystemctl() { case "$1" in is-active) return 0;; show) echo 77;; esac; }\nss() { printf "%s\\n" "$LISTENER"; }\ncurl() { touch "$CALLS"; return 22; }\nhealth_check',{FIXTURE:dir,LISTENER:listener,CALLS:calls});
    assert.equal(r.status,1); assert.equal(fs.existsSync(calls),false);
});
test('health requires an active own listener and matching service JSON, even when a key is configured', t => {
    const dir=fixture(t); fs.mkdirSync(path.join(dir,'node','bin'),{recursive:true});
    fs.symlinkSync(process.execPath,path.join(dir,'node','bin','node'));
    const code='port=8788\nstage="$FIXTURE"\nbase="$FIXTURE"\nsystemctl() { case "$1" in is-active) return 0;; show) echo 42;; esac; }\nss() { printf "%s\\n" "$LISTENER"; }\ncurl() { printf "%s" "$HEALTH" > "$stage/health.json"; }\nhealth_check';
    for (const auth of ['none','key']) {
        const r=shell(code,{FIXTURE:dir,LISTENER:listener,HEALTH:JSON.stringify({ok:true,version:'0.1.0-beta.40',auth,videoProxy:false})});
        assert.equal(r.status,0,r.stderr);
    }
    for (const h of [{ok:true,version:'other',videoProxy:false},{ok:true,version:'0.1.0-beta.40',videoProxy:true},{ok:false,version:'0.1.0-beta.40',videoProxy:false}]) {
        assert.equal(shell(code,{FIXTURE:dir,LISTENER:listener,HEALTH:JSON.stringify(h)}).status,1);
    }
});
test('failed update restores the original port, keys, links, unit and active/enabled state', t => {
    const dir=fixture(t), stage=path.join(dir,'stage'), base=path.join(dir,'base');
    fs.mkdirSync(stage); fs.mkdirSync(base);
    const oldEnv='HOST=0.0.0.0\nPORT=9000\nFABORN_ACCESS_KEYS=kept-fixture\n';
    fs.writeFileSync(path.join(stage,'previous.env'),oldEnv);
    fs.writeFileSync(path.join(stage,'previous.service'),'old unit\n');
    fs.writeFileSync(path.join(dir,'resolver.env'),'PORT=8788\n');
    fs.writeFileSync(path.join(dir,'resolver.service'),'new unit\n');
    fs.symlinkSync('/new-app',path.join(base,'current')); fs.symlinkSync('/new-node',path.join(base,'node'));
    const code=`stage="$FIXTURE/stage"
base="$FIXTURE/base"
env_file="$FIXTURE/resolver.env"
service_file="$FIXTURE/resolver.service"
previous=/old-app
previous_node=/old-node
previous_active=true
previous_enabled=true
rollback_armed=true
systemctl() { printf '%s\\n' "$*" >> "$FIXTURE/systemctl.log"; }
# macOS has no mv -T; Node rename exercises the same atomic symlink replacement.
mv() { if [[ "$1" == -Tf ]]; then "$TEST_NODE" -e 'require("fs").renameSync(process.argv[1],process.argv[2])' "$2" "$3"; else command mv "$@"; fi; }
rollback_install
rollback_install`;
    const r=shell(code,{FIXTURE:dir}); assert.equal(r.status,0,r.stderr);
    assert.equal(fs.readFileSync(path.join(dir,'resolver.env'),'utf8'),oldEnv);
    assert.equal(fs.readlinkSync(path.join(base,'current')),'/old-app');
    assert.equal(fs.readlinkSync(path.join(base,'node')),'/old-node');
    assert.equal(fs.readFileSync(path.join(dir,'resolver.service'),'utf8'),'old unit\n');
    assert.equal(fs.readFileSync(path.join(dir,'systemctl.log'),'utf8'),'stop faborn-resolver.service\ndaemon-reload\nenable faborn-resolver.service\nrestart faborn-resolver.service\n');
});
