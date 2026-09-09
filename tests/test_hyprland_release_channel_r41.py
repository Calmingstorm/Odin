"""Execute shipping scope parser/exchange against an isolated socketpair.

No Wayland connection, compositor, keyboard, or desktop is involved.
"""

import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def native_scope(tmp_path_factory):
    directory = tmp_path_factory.mktemp("native-scope-r41")
    source = (ROOT / "assets/hyprland-input/guardian.c").read_text()
    helpers = source[source.index("struct scope_reply {"):source.index("static bool path_socket(")]
    receipt = source[source.index("static void action_receipt("):source.index("static void step(")]
    mapping = source[
        source.index("    g->command_name = line[0]"):
        source.index('    if (!strncmp(line,"F ",2))')
    ]
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
    char scope_token[129], arm_token[129];
    const char *scope_operation, *scope_error, *command_name, *reason;
    uint64_t rejected;
    bool input_sent, release_sent, release_acknowledged;
    unsigned planned, completed;
};
/* Clock is frozen even for the real socketpair: scheduler latency is not a
 * transport deadline assertion. Synthetic poll/recv advance it explicitly. */
static uint64_t clock_us=1000000, poll_advance, recv_advance;
static unsigned sends, receives, polls;
static const char *wire_reply;
static char wire_request[512];
static uint64_t now_us(void) { return clock_us; }
static int controlled_poll(struct pollfd *fd, nfds_t n, int timeout) {
    if (!wire_reply) return poll(fd,n,timeout);
    assert(n==1 && timeout==2); ++polls; clock_us+=poll_advance;
    fd->revents=fd->events; return 1;
}
static ssize_t controlled_send(int fd,const void *data,size_t n,int flags) {
    if (!wire_reply) return send(fd,data,n,flags);
    assert(n<sizeof wire_request); memcpy(wire_request,data,n); wire_request[n]=0;
    ++sends; return (ssize_t)n;
}
static ssize_t controlled_recv(int fd,void *data,size_t n,int flags) {
    if (!wire_reply) return recv(fd,data,n,flags);
    ++receives; clock_us+=recv_advance;
    if (!strcmp(wire_reply,"EOF")) return 0;
    assert(strlen(wire_reply)<=n); memcpy(data,wire_reply,strlen(wire_reply));
    return (ssize_t)strlen(wire_reply);
}
static bool emit(const char *line) { return fputs(line,stdout)>=0; }
static void fail(struct guardian *g,const char *reason) { g->reason=reason; }
#define poll controlled_poll
#define send controlled_send
#define recv controlled_recv
'''
    harness += helpers + receipt
    harness += "\nstatic void map_command(struct guardian *g,char *line) {\n" + mapping + "}\n"
    harness += r'''
#undef poll
#undef send
#undef recv
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
        /* Keep peer open until controller closes: no scheduler-sensitive
         * POLLHUP race with the final acknowledgment. */
        assert(recv(fds[1],request,sizeof request,0)==0);
        close(fds[1]); _exit(0);
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
    /* A genuine disposable descriptor still verifies scope_call poisoning. */
    int fds[2]; assert(!socketpair(AF_UNIX,SOCK_STREAM,0,fds)); g.scope_fd=fds[0];
    if (!strcmp(argv[1],"deadline")) {
        assert(argc==6);
        const char *op=argv[2]; unsigned budget=(unsigned)atoi(argv[3]);
        g.begun=true; g.scope_deadline=clock_us+budget; g.lease=clock_us+1000000;
        if (!strcmp(op,"renew-lease")) {
            op="renew"; g.lease=clock_us+budget; g.scope_deadline=clock_us+1000000;
        }
        poll_advance=(uint64_t)atoi(argv[4]); recv_advance=(uint64_t)atoi(argv[5]);
        wire_reply="{\"ok\":true}\n";
        char request[64]; snprintf(request,sizeof request,"{\"op\":\"%s\"}\n",op);
        bool ok=scope_call(&g,request,&r);
        printf("%d %u %u %u %d\n",ok,sends,receives,polls,g.scope_fd>=0);
    } else if (!strcmp(argv[1],"bind")) {
        assert(argc==8);
        bool renew=atoi(argv[2]); uint64_t deadline=clock_us+(uint64_t)atoi(argv[3]);
        strcpy(g.scope_token,atoi(argv[4]) ? "private-new-token" : "");
        strcpy(g.arm_token,"private-original-token"); g.rejected=7;
        wire_reply=argv[5]; recv_advance=(uint64_t)atoi(argv[6]);
        bool ok=scope_bind(&g,renew,deadline);
        if (sends) {
            assert(!g.scope_token[0]);
            assert(strstr(wire_request,renew ? "private-original-token" : "private-new-token"));
            assert(strstr(wire_request,renew ? "\"op\":\"renew\"" : "\"op\":\"arm\""));
        }
        map_command(&g,argv[7]);
        g.input_sent=ok; g.release_sent=!ok; g.release_acknowledged=!ok;
        g.planned=3; g.completed=ok ? 3 : 0;
        action_receipt(&g,ok ? "action_done" : "action_rejected",
                       ok ? "completed" : "invalid-command");
        assert(!g.reason);
    } else if (!strcmp(argv[1],"receipt-default")) {
        action_receipt(&g,"closed","orderly"); assert(!g.reason);
    } else { assert(!"unknown case"); }
    if(g.scope_fd>=0) close(g.scope_fd);
    close(fds[1]); return 0;
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
    "sanitize", "negative-retains-release",
])
def test_native_release_channel(native_scope, case):
    subprocess.run([str(native_scope), case], check=True, timeout=5)


@pytest.mark.parametrize("op,budget,poll_advance,recv_advance,expected", [
    # Cleanup's 500ms budget is independent of expired scope/lease.
    ("release_all", 0, 100000, 0, "1 1 1 2 1"),
    ("release_all", 0, 250000, 0, "0 1 0 2 0"),
    ("arm", 1000000, 25000, 0, "0 1 0 2 0"),
    # Check immediately after poll, before even sending or receiving.
    ("renew", 10000, 10000, 0, "0 0 0 1 0"),
    ("renew", 10000, 5000, 0, "0 1 0 2 0"),
    ("renew-lease", 10000, 5000, 0, "0 1 0 2 0"),
    ("renew", 0, 0, 0, "0 0 0 0 0"),
    # Exact post-parse acceptance boundary, including cleanup.
    ("renew", 10000, 0, 9999, "1 1 1 2 1"),
    ("renew", 10000, 0, 10000, "0 1 1 2 0"),
    ("release_all", 0, 0, 499999, "1 1 1 2 1"),
    ("release_all", 0, 0, 500000, "0 1 1 2 0"),
])
def test_native_exact_exchange_deadlines(
    native_scope, op, budget, poll_advance, recv_advance, expected,
):
    result = subprocess.run(
        [str(native_scope), "deadline", op, str(budget), str(poll_advance), str(recv_advance)],
        check=True, capture_output=True, text=True, timeout=5,
    )
    assert result.stdout.strip() == expected


ACK = '{"ok":true,"armed":true,"rejected":7}\n'


@pytest.mark.parametrize("renew", [False, True])
@pytest.mark.parametrize("deadline,token,reply,advance,error", [
    (250000, True, ACK, 0, "none"),
    (10000, False, ACK, 0, "missing-scope-token"),
    (0, True, ACK, 0, "local-deadline-invalid"),
    (999, True, ACK, 0, "local-deadline-invalid"),
    (250001, True, ACK, 0, "local-deadline-invalid"),
    (10000, True, '{"ok":false}\n', 0, "scope-operation-refused"),
    (10000, True, '{"ok":false,"error":"renew-binding-refused"}\n', 0,
     "renew-binding-refused"),
    (10000, True, '{"ok":false,"error":"private-peer-prose"}\n', 0,
     "unrecognized-scope-error"),
    (10000, True, "EOF", 0, "scope-exchange-failed"),
    (10000, True, '{"ok":true,"ok":false}\n', 0, "scope-exchange-failed"),
    (10000, True, '{"ok":true,"rejected":7}\n', 0, "scope-ack-invalid"),
    (10000, True, '{"ok":true,"armed":false,"rejected":7}\n', 0, "scope-ack-invalid"),
    (10000, True, '{"ok":true,"armed":true}\n', 0, "scope-ack-invalid"),
    (10000, True, ACK, 10000, "scope-ack-expired"),
])
def test_native_bind_produces_private_typed_receipt(
    native_scope, renew, deadline, token, reply, advance, error,
):
    receipt = run_bind(native_scope, renew, deadline, token, reply, advance, "O" if renew else "B")
    ok = error == "none"
    assert receipt["native_failure"] == {
        "command": "renew" if renew else "begin",
        "scope_operation": "renew" if renew else "arm", "scope_error": error,
    }
    assert receipt["input_was_sent"] is ok
    assert receipt["release_sent"] is (not ok)
    assert receipt["release_acknowledged"] is (not ok)
    assert receipt["receiver_proven"] is False
    assert receipt["event"] == ("action_done" if ok else "action_rejected")
    assert receipt["diagnostics"] == {
        "phase": "complete" if ok else "release", "steps_planned": 3,
        "steps_completed": 3 if ok else 0, "release": "unknown" if ok else "confirmed",
        "reason": "completed" if ok else "invalid-command",
    }


def run_bind(native_scope, renew, deadline, token, reply, advance, command):
    result = subprocess.run(
        [str(native_scope), "bind", str(int(renew)), str(deadline), str(int(token)),
         reply, str(advance), command],
        check=True, capture_output=True, text=True, timeout=5,
    )
    assert "private-" not in result.stdout
    return json.loads(result.stdout)


@pytest.mark.parametrize("renew,error", [(False, "none"), (True, "scope-rejected-input")])
def test_native_rejection_count_classification(native_scope, renew, error):
    receipt = run_bind(native_scope, renew, 10000, True, ACK.replace(":7", ":8"), 0, "O")
    assert receipt["native_failure"]["scope_error"] == error


@pytest.mark.parametrize("command,name", [
    ("B", "begin"), ("O", "renew"), ("F", "bind"), ("S", "select"),
    ("G", "pixel-permit"), ("K", "action"), ("?", "action"),
])
def test_native_command_name_assignment(native_scope, command, name):
    receipt = run_bind(native_scope, False, 10000, True, ACK, 0, command)
    assert receipt["native_failure"]["command"] == name


def test_native_receipt_unset_diagnostics(native_scope):
    result = subprocess.run([str(native_scope), "receipt-default"], check=True,
                            capture_output=True, text=True, timeout=5)
    receipt = json.loads(result.stdout)
    assert receipt["native_failure"] == dict.fromkeys(
        ("command", "scope_operation", "scope_error"), "none",
    )
    for field in ("input_was_sent", "release_sent", "release_acknowledged", "receiver_proven"):
        assert receipt[field] is False
