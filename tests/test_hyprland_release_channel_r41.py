"""Execute shipping scope parser/exchange against an isolated socketpair.

No Wayland connection, compositor, keyboard, or desktop is involved.
"""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def native_scope(tmp_path_factory):
    directory = tmp_path_factory.mktemp("native-scope-r41")
    source = (ROOT / "assets/hyprland-input/guardian.c").read_text()
    helpers = source[source.index("struct scope_reply {"):source.index("static bool scope_bind(")]
    harness = r'''
#define _GNU_SOURCE
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
struct guardian {
    int scope_fd;
    bool begun;
    uint64_t scope_deadline, lease;
};
static uint64_t now_us(void) {
    struct timespec t; assert(!clock_gettime(CLOCK_MONOTONIC, &t));
    return (uint64_t)t.tv_sec*1000000 + (uint64_t)t.tv_nsec/1000;
}
'''
    harness += helpers + r'''
static pid_t peer(struct guardian *g, const char *reply, unsigned delay, bool twice) {
    int fds[2]; assert(!socketpair(AF_UNIX, SOCK_STREAM, 0, fds));
    pid_t pid=fork(); assert(pid>=0);
    if (!pid) {
        close(fds[0]); char request[512];
        assert(recv(fds[1], request, sizeof request, 0)>0);
        usleep(delay);
        (void)send(fds[1], reply, strlen(reply), MSG_NOSIGNAL);
        if (twice) {
            assert(recv(fds[1], request, sizeof request, 0)>0);
            const char *released="{\"ok\":true,\"armed\":false,\"keys\":0,\"buttons\":0,"
                                 "\"release_acknowledged\":true}\n";
            assert(send(fds[1], released, strlen(released), MSG_NOSIGNAL)>0);
        }
        usleep(20000); close(fds[1]); _exit(0);
    }
    close(fds[1]); g->scope_fd=fds[0]; return pid;
}
static void reap(pid_t pid) {
    int status; assert(waitpid(pid,&status,0)==pid);
    assert(WIFEXITED(status) && WEXITSTATUS(status)==0);
}
int main(int argc, char **argv) {
    assert(argc>=2); struct guardian g={.scope_fd=-1}; struct scope_reply r;
    if (!strcmp(argv[1],"parse")) {
        assert(argc==4);
        assert(parse_reply(argv[2],&r)==(bool)atoi(argv[3])); return 0;
    }
    if (!strcmp(argv[1],"sanitize")) {
        assert(parse_reply("{\"ok\":false,\"error\":\"human-input-held\"}",&r));
        assert(!strcmp(r.error,"human-input-held"));
        assert(parse_reply("{\"ok\":false,\"error\":\"private-token-123\"}",&r));
        assert(!strcmp(r.error,"unrecognized-scope-error")); return 0;
    }
    if (!strcmp(argv[1],"negative-retains-release")) {
        pid_t p=peer(&g,"{\"ok\":false,\"error\":\"renew-binding-refused\"}\n",0,true);
        assert(!scope_call(&g,"{\"op\":\"renew\"}\n",&r));
        assert(g.scope_fd>=0 && !strcmp(r.error,"renew-binding-refused"));
        assert(scope_call(&g,"{\"op\":\"release_all\"}\n",&r));
        assert(r.release_acknowledged && !r.armed && !r.keys && !r.buttons);
        close(g.scope_fd); reap(p); return 0;
    }
    bool cleanup=!strcmp(argv[1],"cleanup-budget");
    bool expired=!strcmp(argv[1],"expired-renew");
    bool corrupt=!strcmp(argv[1],"corrupt-poisons");
    bool late_cleanup=!strcmp(argv[1],"late-cleanup-poisons");
    if (expired) { g.begun=true; g.scope_deadline=now_us()+10000; g.lease=now_us()+1000000; }
    const char *reply=corrupt ? "{\"ok\":false,\"ok\":true}\n" : "{\"ok\":true}\n";
    pid_t p=peer(&g,reply,corrupt ? 0 : late_cleanup ? 550000 : 100000,false);
    uint64_t before=now_us();
    const char *op=cleanup || late_cleanup ? "release_all" : "renew";
    char request[64]; snprintf(request,sizeof request,"{\"op\":\"%s\"}\n",op);
    bool ok=scope_call(&g,request,&r);
    assert(ok==cleanup);
    assert(cleanup ? g.scope_fd>=0 : g.scope_fd==-1);
    if(expired) assert(now_us()-before<80000);
    if(g.scope_fd>=0) close(g.scope_fd);
    reap(p); return 0;
}
'''
    file = directory / "scope.c"
    binary = directory / "scope"
    file.write_text(harness)
    subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
                    str(file), "-o", str(binary)], check=True, timeout=30)
    return binary


@pytest.mark.parametrize("reply,valid", [
    ('{"ok":true}', True),
    ('{"ok":false,"error":"human-input-held"}', True),
    ('{"ok":false,"error":true}', False),
    ('{"ok":false,"error":0}', False),
    ('{"ok":true,"error":"a","error":"b"}', False),
    ('{"ok":true,"error":"escaped\\nsecret"}', False),
    ('{"ok":true,"error":"nonasciié"}', False),
    ('{"ok":true,"error":{}}', False),
    ('{"ok":true,"error":"' + 'x' * 512 + '"}', False),
    ('{"ok":true,"rejected":18446744073709551616}', False),
    ('{"ok":true,"keys":249}', False),
    ('{"ok":true,"buttons":9}', False),
    ('{"ok":true,"release_acknowledged":1}', False),
    ('{"ok":true}\n{"ok":true}\n', False),
])
def test_native_diagnostic_parser(native_scope, reply, valid):
    subprocess.run([str(native_scope), "parse", reply, str(int(valid))], check=True, timeout=5)


@pytest.mark.parametrize("case", [
    "sanitize", "negative-retains-release", "cleanup-budget", "ordinary-budget",
    "expired-renew", "corrupt-poisons", "late-cleanup-poisons",
])
def test_native_release_channel(native_scope, case):
    subprocess.run([str(native_scope), case], check=True, timeout=5)
